//! DaachScanner: Full-Parity Implicit Entity Scanner
//!
//! Uses `aho-corasick` for exact surface-form matching in raw text,
//! plus fuzzy fallback via Damerau-Levenshtein on single-token misses.
//!
//! Architecture matches TypeScript ImplicitCore:
//! 1. Store surface forms (labels + aliases) in AC
//! 2. Search raw text directly (case-insensitive)
//! 3. Normalize matched word -> lookup entity candidates

use aho_corasick::{AhoCorasick, AhoCorasickBuilder, MatchKind};
use serde::{Serialize, Deserialize};
use std::cell::RefCell;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::Arc;
use thiserror::Error;

pub mod bridge;

pub const MIN_ANCHOR_LEN: usize = 3;

thread_local! {
    static GLOBAL_RUNTIME_DICTIONARY: RefCell<Option<Arc<RuntimeDictionary>>> = RefCell::new(None);
}

pub fn set_global_dictionary(dict: Arc<RuntimeDictionary>) {
    GLOBAL_RUNTIME_DICTIONARY.with(|cell| *cell.borrow_mut() = Some(dict));
}

pub fn is_known_entity(token: &str) -> bool {
    GLOBAL_RUNTIME_DICTIONARY.with(|cell| {
        let borrow = cell.borrow();
        let Some(dict) = borrow.as_ref() else { return false; };
        let norm = normalize_raw(token);
        dict.surface_to_ids.contains_key(&norm) || dict.anchor_to_ids.contains_key(&norm)
    })
}

// -------------------- Types --------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum EntityKind {
    CHARACTER,
    PLACE,
    FACTION,
    ORGANIZATION,
    ITEM,
    EVENT,
    CONCEPT,
    OTHER,
}

impl EntityKind {
    pub fn priority(&self) -> u8 {
        match self {
            EntityKind::CHARACTER => 10,
            EntityKind::PLACE => 8,
            EntityKind::FACTION => 7,
            EntityKind::ORGANIZATION => 7,
            EntityKind::ITEM => 5,
            EntityKind::CONCEPT => 3,
            EntityKind::EVENT => 1,
            EntityKind::OTHER => 2,
        }
    }
}

#[derive(Debug, Clone)]
pub struct RegisteredEntity {
    pub id: String,
    pub label: String,
    pub aliases: Vec<String>,
    pub kind: EntityKind,
    pub narrative_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct EntityInfo {
    pub id: String,
    pub label: String,
    pub kind: EntityKind,
    pub narrative_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecorationSpan {
    #[serde(rename = "type")]
    pub span_type: String,
    pub from: usize,
    pub to: usize,
    pub label: String,
    #[serde(rename = "matchedText")]
    pub matched_text: String,
    pub kind: EntityKind,
    pub resolved: bool,
    #[serde(rename = "entityId")]
    pub entity_id: Option<String>,
    #[serde(rename = "narrativeId")]
    pub narrative_id: Option<String>,
    #[serde(rename = "candidateIds")]
    pub candidate_ids: Option<Vec<String>>,
    #[serde(rename = "candidateLabels")]
    pub candidate_labels: Option<Vec<String>>,
}

#[derive(Debug, Error)]
pub enum DictError {
    #[error("aho-corasick build failed")]
    AcBuildFailed,
}

// -------------------- Normalization / Stop Words --------------------

const STOP_WORDS: &[&str] = &[
    "mr", "mrs", "ms", "dr", "prof", "sir", "lady", "lord", "king", "queen",
    "the", "of", "and", "a", "an", "to", "in", "on", "for", "at", "by",
    "is", "it", "as", "be", "was", "are", "been", "with", "from", "into",
    "that", "this", "has", "have", "had", "his", "her", "its", "their",
];

pub fn is_stop_word(tok: &str) -> bool {
    STOP_WORDS.contains(&tok)
}

pub fn normalize_raw(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        let c = ch.to_ascii_lowercase();
        if c == '\u{2019}' {
            out.push('\'');
        } else if c.is_ascii_alphanumeric() || c == '\'' || c.is_whitespace() {
            out.push(c);
        } else {
            out.push(' ');
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn tokenize_norm(text: &str) -> Vec<String> {
    normalize_raw(text)
        .split_whitespace()
        .filter(|t| !t.is_empty() && !is_stop_word(t))
        .map(|s| s.to_string())
        .collect()
}

fn strip_possessive(tok: &str) -> &str {
    tok.strip_suffix("'s").or_else(|| tok.strip_suffix("s'")).unwrap_or(tok)
}

// -------------------- Auto-Alias Generation --------------------

fn generate_auto_aliases(label: &str, kind: EntityKind) -> Vec<String> {
    let toks = tokenize_norm(label);
    if toks.len() <= 1 {
        return vec![];
    }

    let first = &toks[0];
    let last = &toks[toks.len() - 1];
    let mut out = Vec::new();

    if kind == EntityKind::CHARACTER {
        if last.len() >= 3 {
            out.push(last.clone());
        }
        if toks.len() >= 3 && first != last {
            out.push(format!("{} {}", first, last));
        }
        if toks.len() >= 3 {
            let second_last = &toks[toks.len() - 2];
            if second_last.len() <= 2 {
                out.push(format!("{} {}", second_last, last));
            }
        }
        if first.len() >= 4 && first != last {
            out.push(first.clone());
        }
    }

    if matches!(kind, EntityKind::FACTION | EntityKind::ORGANIZATION) {
        let acronym: String = toks.iter().filter_map(|t| t.chars().next()).collect();
        if (2..=5).contains(&acronym.len()) {
            out.push(acronym);
        }
        if toks.len() >= 2 && matches!(last.as_str(), "pirates" | "pirate" | "crew" | "gang" | "guild" | "army") {
            let partial: Vec<&str> = toks[..toks.len()-1].iter().map(|s| s.as_str()).collect();
            out.push(partial.join(" "));
        }
        if last.len() >= 4 {
            out.push(last.clone());
        }
    }

    if kind == EntityKind::PLACE && first.len() >= 4 {
        out.push(first.clone());
    }

    out.sort();
    out.dedup();
    out
}

// -------------------- Compiled Dictionary --------------------

#[derive(Debug, Clone)]
pub struct CompiledDictionary {
    pub patterns: Vec<String>,  // Surface forms (lowercased)
    pub pattern_to_ids: HashMap<String, Vec<String>>,  // pattern -> entity IDs
    pub id_to_info: HashMap<String, EntityInfo>,
    pub unique_token_to_id: BTreeMap<String, String>,
    pub anchor_to_ids: BTreeMap<String, Vec<String>>,
}

pub fn compile_dictionary(entities: &[RegisteredEntity]) -> Result<CompiledDictionary, DictError> {
    let mut id_to_info: HashMap<String, EntityInfo> = HashMap::new();
    let mut surface_to_ids: HashMap<String, Vec<String>> = HashMap::new();
    let mut token_df: HashMap<String, usize> = HashMap::new();
    let mut token_owner: HashMap<String, String> = HashMap::new();
    let mut anchor_to_ids: BTreeMap<String, Vec<String>> = BTreeMap::new();

    // Build entity info and collect surfaces
    for e in entities {
        id_to_info.insert(e.id.clone(), EntityInfo {
            id: e.id.clone(),
            label: e.label.clone(),
            kind: e.kind,
            narrative_id: e.narrative_id.clone(),
        });

        // Collect all surface forms
        let mut surfaces = vec![e.label.clone()];
        surfaces.extend(e.aliases.clone());
        surfaces.extend(generate_auto_aliases(&e.label, e.kind));

        for surface in surfaces {
            let key = normalize_raw(&surface);
            if key.is_empty() { continue; }
            surface_to_ids.entry(key).or_default().push(e.id.clone());
        }

        // Token DF for unique token detection (skip EVENTs from anchor index)
        if e.kind != EntityKind::EVENT {
            let toks = tokenize_norm(&e.label);
            let unique_toks: HashSet<_> = toks.iter().collect();
            for t in unique_toks {
                if t.len() >= MIN_ANCHOR_LEN {
                    *token_df.entry(t.clone()).or_default() += 1;
                    token_owner.entry(t.clone()).or_insert_with(|| e.id.clone());
                    anchor_to_ids.entry(t.clone()).or_default().push(e.id.clone());
                }
            }
        }
    }

    // Unique token index
    let mut unique_token_to_id = BTreeMap::new();
    for (t, count) in &token_df {
        if *count == 1 {
            if let Some(id) = token_owner.get(t) {
                unique_token_to_id.insert(t.clone(), id.clone());
            }
        }
    }

    // Dedup and sort anchors by priority
    for (_tok, ids) in anchor_to_ids.iter_mut() {
        ids.sort();
        ids.dedup();
        // Sort by entity kind priority (highest first)
        ids.sort_by(|a, b| {
            let pa = id_to_info.get(a).map(|e| e.kind.priority()).unwrap_or(0);
            let pb = id_to_info.get(b).map(|e| e.kind.priority()).unwrap_or(0);
            pb.cmp(&pa)
        });
    }

    // Dedup surface mappings
    for (_key, ids) in surface_to_ids.iter_mut() {
        ids.sort();
        ids.dedup();
    }

    // Build pattern list (unique surfaces)
    let mut patterns: Vec<String> = surface_to_ids.keys().cloned().collect();
    patterns.sort_by(|a, b| b.len().cmp(&a.len()));  // Longer first for leftmost-longest

    Ok(CompiledDictionary {
        patterns,
        pattern_to_ids: surface_to_ids,
        id_to_info,
        unique_token_to_id,
        anchor_to_ids,
    })
}

// -------------------- Runtime Dictionary --------------------

pub struct RuntimeDictionary {
    ac: AhoCorasick,
    patterns: Vec<String>,
    surface_to_ids: HashMap<String, Vec<String>>,
    id_to_info: HashMap<String, EntityInfo>,
    unique_token_to_id: BTreeMap<String, String>,
    anchor_to_ids: BTreeMap<String, Vec<String>>,
    valid: bool,
}

impl RuntimeDictionary {
    pub fn new() -> Self {
        let empty_patterns: Vec<String> = vec![];
        let empty_ac = AhoCorasickBuilder::new()
            .ascii_case_insensitive(true)
            .match_kind(MatchKind::LeftmostLongest)
            .build(&empty_patterns)
            .unwrap();
        Self {
            ac: empty_ac,
            patterns: vec![],
            surface_to_ids: HashMap::new(),
            id_to_info: HashMap::new(),
            unique_token_to_id: BTreeMap::new(),
            anchor_to_ids: BTreeMap::new(),
            valid: false,
        }
    }

    pub fn load(compiled: CompiledDictionary) -> Result<Self, DictError> {
        let ac = AhoCorasickBuilder::new()
            .ascii_case_insensitive(true)
            .match_kind(MatchKind::LeftmostLongest)
            .build(&compiled.patterns)
            .map_err(|_| DictError::AcBuildFailed)?;

        Ok(Self {
            ac,
            patterns: compiled.patterns,
            surface_to_ids: compiled.pattern_to_ids,
            id_to_info: compiled.id_to_info,
            unique_token_to_id: compiled.unique_token_to_id,
            anchor_to_ids: compiled.anchor_to_ids,
            valid: true,
        })
    }

    fn get_entity(&self, id: &str) -> Option<&EntityInfo> {
        self.id_to_info.get(id)
    }

    fn select_best(&self, ids: &[String]) -> Option<EntityInfo> {
        let mut best: Option<&EntityInfo> = None;
        for id in ids {
            if let Some(info) = self.get_entity(id) {
                if best.is_none() || info.kind.priority() > best.unwrap().kind.priority() {
                    best = Some(info);
                }
            }
        }
        best.cloned()
    }

    fn fuzzy_match_token(&self, token: &str) -> Option<EntityInfo> {
        if !self.valid || token.len() < MIN_ANCHOR_LEN { return None; }

        let stripped = strip_possessive(token);

        // 1. Unique token match
        if let Some(id) = self.unique_token_to_id.get(token)
            .or_else(|| self.unique_token_to_id.get(stripped)) {
            return self.get_entity(id).cloned();
        }

        // 2. Anchor exact match
        if let Some(ids) = self.anchor_to_ids.get(token)
            .or_else(|| self.anchor_to_ids.get(stripped)) {
            return self.select_best(ids);
        }

        // 3. Fuzzy anchor match (typos)
        if token.len() >= 4 {
            let token_lower = token.to_lowercase();
            let start_char = token_lower.chars().next().unwrap_or('\0');
            for anchor in self.anchor_to_ids.keys() {
                if !anchor.starts_with(start_char) { continue; }
                if tok_match(&token_lower, anchor) {
                    if let Some(ids) = self.anchor_to_ids.get(anchor) {
                        return self.select_best(ids);
                    }
                }
            }
        }

        None
    }
}

// -------------------- Fuzzy Algorithms --------------------

fn dl_within(a: &str, b: &str, max: usize) -> bool {
    if a == b { return true; }
    let la = a.chars().count();
    let lb = b.chars().count();
    if la.abs_diff(lb) > max { return false; }
    if la > 32 || lb > 32 { return false; }

    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let mut dp = vec![vec![0; lb + 1]; la + 1];

    for i in 0..=la { dp[i][0] = i; }
    for j in 0..=lb { dp[0][j] = j; }

    for i in 1..=la {
        let mut row_min = 999;
        for j in 1..=lb {
            let cost = if a_chars[i-1] == b_chars[j-1] { 0 } else { 1 };
            let mut v = (dp[i-1][j] + 1).min(dp[i][j-1] + 1).min(dp[i-1][j-1] + cost);
            if i > 1 && j > 1 && a_chars[i-1] == b_chars[j-2] && a_chars[i-2] == b_chars[j-1] {
                v = v.min(dp[i-2][j-2] + 1);
            }
            dp[i][j] = v;
            row_min = row_min.min(v);
        }
        if row_min > max { return false; }
    }

    dp[la][lb] <= max
}

fn tok_match(a: &str, b: &str) -> bool {
    if a == b { return true; }
    if a.len() < 4 || b.len() < 4 { return false; }
    let a_first = a.chars().next();
    let b_first = b.chars().next();
    if a_first != b_first { return false; }
    if a.len().abs_diff(b.len()) > 2 { return false; }
    let max = if a.len().max(b.len()) <= 5 { 1 } else { 2 };
    dl_within(a, b, max)
}

// -------------------- Scanner Core --------------------

pub struct ScannerCore {
    dict: Arc<RuntimeDictionary>,
}

impl ScannerCore {
    pub fn new(dict: Arc<RuntimeDictionary>) -> Self {
        Self { dict }
    }

    pub fn scan(&self, text: &str, allowed_narrative_id: Option<&str>) -> Vec<DecorationSpan> {
        if !self.dict.valid || text.is_empty() { return vec![]; }

        let mut spans: Vec<DecorationSpan> = Vec::new();
        let mut matched_ranges: HashSet<(usize, usize)> = HashSet::new();

        // Filter by narrative scope
        let filter_candidates = |ids: &[String]| -> Vec<EntityInfo> {
            ids.iter().filter_map(|id| {
                let info = self.dict.get_entity(id)?;
                if info.narrative_id.is_none() ||
                   (allowed_narrative_id.is_some() && info.narrative_id.as_deref() == allowed_narrative_id) {
                    Some(info.clone())
                } else {
                    None
                }
            }).collect()
        };

        // Phase 1: AC exact matches on raw text
        for m in self.dict.ac.find_iter(text) {
            let from = m.start();
            let to = m.end();
            let matched_text = &text[from..to];
            let key = normalize_raw(matched_text);

            if let Some(ids) = self.dict.surface_to_ids.get(&key) {
                let filtered = filter_candidates(ids);
                if filtered.is_empty() { continue; }

                matched_ranges.insert((from, to));

                if filtered.len() == 1 {
                    let e = &filtered[0];
                    spans.push(DecorationSpan {
                        span_type: "entity_implicit".to_string(),
                        from,
                        to,
                        label: e.label.clone(),
                        matched_text: matched_text.to_string(),
                        kind: e.kind,
                        resolved: true,
                        entity_id: Some(e.id.clone()),
                        narrative_id: e.narrative_id.clone(),
                        candidate_ids: None,
                        candidate_labels: None,
                    });
                } else {
                    // Ambiguous match - pick best by priority
                    let mut sorted = filtered.clone();
                    sorted.sort_by(|a, b| b.kind.priority().cmp(&a.kind.priority()));
                    let best = &sorted[0];
                    spans.push(DecorationSpan {
                        span_type: "entity_implicit".to_string(),
                        from,
                        to,
                        label: best.label.clone(),
                        matched_text: matched_text.to_string(),
                        kind: best.kind,
                        resolved: true,
                        entity_id: Some(best.id.clone()),
                        narrative_id: best.narrative_id.clone(),
                        candidate_ids: Some(filtered.iter().map(|e| e.id.clone()).collect()),
                        candidate_labels: Some(filtered.iter().map(|e| e.label.clone()).collect()),
                    });
                }
            }
        }

        // Phase 2: DISABLED - Fuzzy fallback was causing false positives
        // TODO: Re-enable with stricter unique token matching only
        // let word_re = regex::Regex::new(r"[A-Za-z0-9']+").unwrap();
        // for cap in word_re.find_iter(text) {
        //     let from = cap.start();
        //     let to = cap.end();
        //     
        //     // Skip if already covered
        //     if matched_ranges.iter().any(|(s, e)| from >= *s && to <= *e) { continue; }
        //
        //     let word = normalize_raw(cap.as_str());
        //     if word.is_empty() || is_stop_word(&word) { continue; }
        //
        //     if let Some(info) = self.dict.fuzzy_match_token(&word) {
        //         // Check scope
        //         if info.narrative_id.is_some() &&
        //            (allowed_narrative_id.is_none() || info.narrative_id.as_deref() != allowed_narrative_id) {
        //             continue;
        //         }
        //
        //         spans.push(DecorationSpan {
        //             span_type: "entity_implicit".to_string(),
        //             from,
        //             to,
        //             label: info.label.clone(),
        //             matched_text: cap.as_str().to_string(),
        //             kind: info.kind,
        //             resolved: true,
        //             entity_id: Some(info.id.clone()),
        //             narrative_id: info.narrative_id.clone(),
        //             candidate_ids: None,
        //             candidate_labels: None,
        //         });
        //     }
        // }

        // Sort and deduplicate overlapping spans (longer wins)
        spans.sort_by(|a, b| {
            if a.from != b.from {
                a.from.cmp(&b.from)
            } else {
                (b.to - b.from).cmp(&(a.to - a.from))
            }
        });

        let mut result: Vec<DecorationSpan> = Vec::new();
        let mut last_end: isize = -1;

        for span in spans {
            if (span.from as isize) < last_end { continue; }
            last_end = span.to as isize;
            result.push(span);
        }

        // Convert byte offsets to char offsets for JavaScript compatibility
        // JavaScript uses UTF-16 code units, Rust uses byte offsets in UTF-8
        let byte_to_char: Vec<usize> = {
            let mut mapping = Vec::with_capacity(text.len() + 1);
            let mut char_idx = 0;
            for (byte_idx, _) in text.char_indices() {
                while mapping.len() < byte_idx {
                    mapping.push(char_idx);
                }
                mapping.push(char_idx);
                char_idx += 1;
            }
            // Fill remaining for end-of-string positions
            while mapping.len() <= text.len() {
                mapping.push(char_idx);
            }
            mapping
        };

        for span in &mut result {
            span.from = byte_to_char.get(span.from).copied().unwrap_or(span.from);
            span.to = byte_to_char.get(span.to).copied().unwrap_or(span.to);
        }

        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_exact_match() {
        let entities = vec![
            RegisteredEntity {
                id: "char1".to_string(),
                label: "Monkey D. Luffy".to_string(),
                aliases: vec![],
                kind: EntityKind::CHARACTER,
                narrative_id: None,
            },
        ];

        let compiled = compile_dictionary(&entities).unwrap();
        let dict = RuntimeDictionary::load(compiled).unwrap();
        let scanner = ScannerCore::new(Arc::new(dict));

        let spans = scanner.scan("I saw Monkey D. Luffy today.", None);
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].matched_text, "Monkey D. Luffy");
        assert_eq!(spans[0].label, "Monkey D. Luffy");
    }

    #[test]
    fn test_auto_alias() {
        let entities = vec![
            RegisteredEntity {
                id: "char1".to_string(),
                label: "Monkey D. Luffy".to_string(),
                aliases: vec![],
                kind: EntityKind::CHARACTER,
                narrative_id: None,
            },
        ];

        let compiled = compile_dictionary(&entities).unwrap();
        let dict = RuntimeDictionary::load(compiled).unwrap();
        let scanner = ScannerCore::new(Arc::new(dict));

        // Should match "Luffy" alone via auto-alias
        let spans = scanner.scan("Luffy is the captain.", None);
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].matched_text, "Luffy");
        assert_eq!(spans[0].label, "Monkey D. Luffy");
    }

    #[test]
    fn test_faction_partial_match() {
        let entities = vec![
            RegisteredEntity {
                id: "faction1".to_string(),
                label: "Straw Hat Pirates".to_string(),
                aliases: vec![],
                kind: EntityKind::FACTION,
                narrative_id: None,
            },
        ];

        let compiled = compile_dictionary(&entities).unwrap();
        let dict = RuntimeDictionary::load(compiled).unwrap();
        let scanner = ScannerCore::new(Arc::new(dict));

        // Should match "Straw Hat" via auto-alias
        let spans = scanner.scan("The Straw Hat crew arrived.", None);
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].matched_text, "Straw Hat");
    }
}
