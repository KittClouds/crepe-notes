// ---- Runtime Dictionary ----

use std::collections::{HashMap, BTreeMap};
use fst::Map;
use super::types::{DecorationSpan, EntityInfo};
use super::compiler::{CompiledDictionary, DictError, normalize_raw, is_stop_word, TOK_SEP, MAX_PHRASE_TOKENS};
use std::sync::Arc;
use std::cell::RefCell;

// Global Thread-Local Access for Shared Memory Discovery
thread_local! {
    static GLOBAL_RUNTIME_DICTIONARY: RefCell<Option<Arc<RuntimeDictionary>>> = RefCell::new(None);
}

pub fn set_global_dictionary(dict: Arc<RuntimeDictionary>) {
    GLOBAL_RUNTIME_DICTIONARY.with(|cell| {
        *cell.borrow_mut() = Some(dict);
    });
}

pub fn is_known_entity(token: &str) -> bool {
    GLOBAL_RUNTIME_DICTIONARY.with(|cell| {
        if let Some(dict) = cell.borrow().as_ref() {
            // Check if token matches any known entity label or alias exactly (case-insensitive via normalization)
            // 1. Check direct map lookup (normalized)
            let normalized = normalize_raw(token);
            if dict.map.contains_key(normalized.as_bytes()) {
                return true;
            }
            // 2. Check unique token index (for single-word aliases)
            if dict.unique_token_to_id.contains_key(token) {
                return true;
            }
        }
        false
    })
}

pub struct RuntimeDictionary {
    map: Map<Vec<u8>>,
    buckets: Vec<Vec<EntityInfo>>,
    id_to_info: HashMap<String, EntityInfo>,
    
    // Fuzzy Index
    unique_token_to_id: BTreeMap<String, String>,
    anchor_to_ids: BTreeMap<String, Vec<String>>,
    entity_tokens: BTreeMap<String, Vec<String>>,
    
    valid: bool,
}

impl RuntimeDictionary {
    pub fn new() -> Self {
         let empty_map = Map::from_iter(Vec::<(String, u64)>::new()).unwrap();
         Self {
             map: empty_map,
             buckets: vec![],
             id_to_info: HashMap::new(),
             unique_token_to_id: BTreeMap::new(),
             anchor_to_ids: BTreeMap::new(),
             entity_tokens: BTreeMap::new(),
             valid: false,
         }
    }

    pub fn load(compiled: CompiledDictionary) -> Result<Self, DictError> {
        let map = Map::new(compiled.fst_bytes).map_err(|_| DictError::LoadFailed)?;
        let mut id_to_info = HashMap::new();
        for bucket in &compiled.buckets {
            for e in bucket {
                id_to_info.entry(e.id.clone()).or_insert_with(|| e.clone());
            }
        }
        Ok(Self { 
            map, 
            buckets: compiled.buckets, 
            id_to_info,
            unique_token_to_id: compiled.unique_token_to_id,
            anchor_to_ids: compiled.anchor_to_ids,
            entity_tokens: compiled.entity_tokens,
            valid: true 
        })
    }

    fn bucket_for_key(&self, key: &str) -> Option<&[EntityInfo]> {
        if !self.valid { return None; }
        let idx = self.map.get(key.as_bytes())? as usize;
        self.buckets.get(idx).map(|v| v.as_slice())
    }

    fn get_entity(&self, id: &str) -> Option<&EntityInfo> {
        self.id_to_info.get(id)
    }

    // Optimized fuzzy lookup for anchors
    fn find_matching_anchors(&self, token: &str) -> Vec<String> {
        if token.len() < 3 { return vec![]; }
        let mut matches = Vec::new();
        let token_lower = token.to_lowercase(); // Anchor keys are normalized (lowercase)
        
        // Optimization: Only check anchors with same start char and similar length
        let start_char = token.chars().next().unwrap();
        // BTreeMap range could help if keys were sorted, but we want similar strings.
        // We can just iterate. For 10k entities, we need a better index (e.g. BK-tree or Trigram), 
        // but for now let's just iterate keys starting with same char? 
        // BTreeMap iterates in order.
        
        // Simple scan for now (A/B Test Phase)
        for anchor in self.anchor_to_ids.keys() {
            if !anchor.starts_with(start_char) { continue; } // Heuristic optimization
             if tok_match(token, anchor) {
                 matches.push(anchor.clone());
             }
        }
        matches
    }

    fn fuzzy_match_token(&self, token: &str, stripped: &str) -> Option<EntityInfo> {
        if !self.valid { return None; }

        // 1. Unique Token Exact Match
        let maybe_id = self.unique_token_to_id.get(token).or_else(|| self.unique_token_to_id.get(stripped));
        if let Some(id) = maybe_id {
            if let Some(toks) = self.entity_tokens.get(id) {
                if toks.len() == 1 {
                     return self.get_entity(id).cloned();
                }
                // Return unique match even if multi-token? 
                // TS behavior: "unique match" implies strong evidence.
                // If I type "Monkey", it is unique to "Monkey D. Luffy".
                // Should I highlight "Monkey"? Yes, usually.
                return self.get_entity(id).cloned();
            }
        }

        // 2. Exact Anchor Match
        let candidates = self.anchor_to_ids.get(token).or_else(|| self.anchor_to_ids.get(stripped));
        if let Some(ids) = candidates {
            for id in ids {
                 // Check if token matches part of entity label?
                 // For now, simple return first valid
                 return self.get_entity(id).cloned();
            }
        }

        // 3. Fuzzy Anchor Match (Typos)
        // Only if token is long enough
        if token.len() >= 4 {
            let matched_anchors = self.find_matching_anchors(token);
            for anchor in matched_anchors {
                if let Some(ids) = self.anchor_to_ids.get(&anchor) {
                    for id in ids {
                        return self.get_entity(id).cloned();
                    }
                }
            }
        }

        None
    }
}


// ---- Fuzzy Algorithms ----

fn dl_within(a: &str, b: &str, max: usize) -> bool {
    if a == b { return true; }
    let la = a.chars().count();
    let lb = b.chars().count();
    
    if la.abs_diff(lb) > max { return false; }
    if la > 32 || lb > 32 { return false; } // Safety cutoff

    // Damerau-Levenshtein implementation
    // Using a simple matrix approach since strings are short
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

            // Transposition
            if i > 1 && j > 1 && a_chars[i-1] == b_chars[j-2] && a_chars[i-2] == b_chars[j-1] {
                v = v.min(dp[i-2][j-2] + 1);
            }

            dp[i][j] = v;
            row_min = row_min.min(v);
        }
        if row_min > max { return false; } // Row optimization
    }

    dp[la][lb] <= max
}

fn tok_match(a: &str, b: &str) -> bool {
    if a == b { return true; }
    let max = if a.len().max(b.len()) <= 5 { 1 } else { 2 };
    dl_within(a, b, max)
}

// ---- Scanner ----

#[derive(Debug, Clone)]
struct Token {
    t: String,
    start: usize,
    end: usize,
}

fn tokenize_with_offsets(text: &str) -> Vec<Token> {
    // ASCII-ish tokenizer matching JS /[A-Za-z0-9']+/ plus normalization.
    let b = text.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    
    // Safety check for empty text
    if text.is_empty() { return out; }

    while i < b.len() {
        let is_tok = b[i].is_ascii_alphanumeric() || b[i] == b'\'';
        if !is_tok { i += 1; continue; }

        let start = i;
        i += 1;
        while i < b.len() && (b[i].is_ascii_alphanumeric() || b[i] == b'\'') { i += 1; }
        let end = i;

        let raw = &text[start..end];
        let t = normalize_raw(raw);
        if t.is_empty() || is_stop_word(&t) { continue; }
        out.push(Token { t, start, end });
    }

    out
}

fn strip_possessive(tok: &str) -> &str {
    if let Some(stem) = tok.strip_suffix("'s") { return stem; }
    if let Some(stem) = tok.strip_suffix("s'") { return stem; }
    tok
}

pub struct ScannerCore {
    dict: Arc<RuntimeDictionary>,
}

impl ScannerCore {
    pub fn new(dict: Arc<RuntimeDictionary>) -> Self { Self { dict } }


    pub fn scan(&self, text: &str, allowed_narrative_id: Option<&str>) -> Vec<DecorationSpan> {
        let toks = tokenize_with_offsets(text);
        if toks.is_empty() { return vec![]; }

        // Collect candidate matches: (from,to,bucket_idx)
        #[derive(Clone)]
        struct M { from: usize, to: usize, bucket: Vec<EntityInfo> }

        let mut matches: Vec<M> = Vec::new();
        let mut matched_positions = std::collections::HashSet::new();

        // Helper to filter entities by scope
        let filter_bucket = |bucket: &[EntityInfo]| -> Vec<EntityInfo> {
            bucket.iter().filter(|e| {
                // Allow if Global (None) OR (Scope matches Allowed)
                e.narrative_id.is_none() || 
                (allowed_narrative_id.is_some() && e.narrative_id.as_deref() == allowed_narrative_id)
            }).cloned().collect()
        };

        for i in 0..toks.len() {
            let mut key = String::new();
            let mut key_stripped = String::new();
            let mut found_exact = false;

            for j in i..toks.len().min(i + MAX_PHRASE_TOKENS) {
                let t = toks[j].t.as_str();
                let s = strip_possessive(t);

                if j == i {
                    key.push_str(t);
                    key_stripped.push_str(s);
                } else {
                    key.push(TOK_SEP);
                    key.push_str(t);

                    key_stripped.push(TOK_SEP);
                    key_stripped.push_str(s);
                }

                // Check exact match
                if let Some(bucket) = self.dict.bucket_for_key(&key) {
                    let filtered = filter_bucket(bucket);
                    if !filtered.is_empty() {
                        matches.push(M { from: toks[i].start, to: toks[j].end, bucket: filtered });
                        matched_positions.insert((toks[i].start, toks[j].end));
                        found_exact = true;
                    }
                } 
                // Check stripped match (if different)
                else if key_stripped != key {
                    if let Some(bucket) = self.dict.bucket_for_key(&key_stripped) {
                         let filtered = filter_bucket(bucket);
                         if !filtered.is_empty() {
                            matches.push(M { from: toks[i].start, to: toks[j].end, bucket: filtered });
                            matched_positions.insert((toks[i].start, toks[j].end));
                            found_exact = true;
                         }
                    }
                }
            }

            // Fuzzy Fallback (Single Token)
            if !found_exact {
                 let t = &toks[i];
                 let stripped = strip_possessive(&t.t);
                 if !matched_positions.contains(&(t.start, t.end)) {
                     if let Some(info) = self.dict.fuzzy_match_token(&t.t, stripped) {
                         // Fuzzy match returns single info, stick in vec and filter
                         let bucket = vec![info];
                         let filtered = filter_bucket(&bucket);
                         if !filtered.is_empty() {
                             matches.push(M { from: t.start, to: t.end, bucket: filtered });
                         }
                     }
                 }
            }
        }

        // Sort by Start ASC, then Length DESC.
        matches.sort_by(|a, b| {
            if a.from != b.from { a.from.cmp(&b.from) }
            else { (b.to - b.from).cmp(&(a.to - a.from)) }
        });

        let mut out: Vec<DecorationSpan> = Vec::with_capacity(matches.len());
        let mut last_end: isize = -1;

        for m in matches {
            // No overlaps logic
            if (m.from as isize) < last_end { continue; }

            let matched_text = text.get(m.from..m.to).unwrap_or("").to_string();

            if m.bucket.len() == 1 {
                let e = &m.bucket[0];
                out.push(DecorationSpan {
                    span_type: "entity_implicit".to_string(),
                    from: m.from,
                    to: m.to,
                    label: e.label.clone(),
                    matched_text,
                    kind: e.kind,
                    resolved: true,
                    entity_id: Some(e.id.clone()),
                    narrative_id: e.narrative_id.clone(),
                    candidate_ids: None,
                    candidate_labels: None,
                });
            } else {
                out.push(DecorationSpan {
                    span_type: "entity_implicit".to_string(),
                    from: m.from,
                    to: m.to,
                    label: matched_text.clone(), // or "Multiple Candidates"
                    matched_text,
                    kind: m.bucket[0].kind, // First candidate's kind as fallback
                    resolved: false,
                    entity_id: None,
                    narrative_id: None, // Ambiguous match, no single narrative
                    candidate_ids: Some(m.bucket.iter().map(|e| e.id.clone()).collect()),
                    candidate_labels: Some(m.bucket.iter().map(|e| e.label.clone()).collect()),
                });
            }

            last_end = m.to as isize;
        }

        merge_spans(out, text)
    }
}

fn get_ids(span: &DecorationSpan) -> Vec<String> {
    if let Some(id) = &span.entity_id {
        return vec![id.clone()];
    }
    if let Some(ids) = &span.candidate_ids {
        return ids.clone();
    }
    vec![]
}

fn merge_spans(spans: Vec<DecorationSpan>, text: &str) -> Vec<DecorationSpan> {
    if spans.is_empty() { return vec![]; }
    let mut out: Vec<DecorationSpan> = Vec::new();
    let mut current = spans[0].clone();

    for next in spans.into_iter().skip(1) {
        // Check adjacency (allow up to 2 chars gap, e.g. ". " or " ")
        // Prevent merging identical tokens (e.g. "Luffy Luffy") unless they are very short (e.g. "D" in "Monkey D. Luffy")
        let is_repetition = next.matched_text == current.matched_text && next.matched_text.len() > 2;
        
        if next.from > current.to + 5 || is_repetition {
            out.push(current);
            current = next;
            continue;
        }

        // Check candidate intersection
        let ids1 = get_ids(&current);
        let ids2 = get_ids(&next);
        let intersection: Vec<String> = ids1.into_iter().filter(|id| ids2.contains(id)).collect();

        if !intersection.is_empty() {
             // Merge
             current.to = next.to;
             current.matched_text = text.get(current.from..current.to).unwrap_or("").to_string();
             
             if intersection.len() == 1 {
                 current.resolved = true;
                 current.entity_id = Some(intersection[0].clone());
                 // Keep kind from first span (heuristic)
                 current.candidate_ids = None;
                 current.candidate_labels = None;
             } else {
                 current.resolved = false;
                 current.entity_id = None;
                 current.candidate_ids = Some(intersection);
                 // Labels would need to be re-fetched or intersected, skipping for now
             }
        } else {
             out.push(current);
             current = next;
        }
    }
    out.push(current);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scanner::dafsa::compiler::compile_dictionary;
    use crate::scanner::dafsa::types::{RegisteredEntity, EntityKind};
    use std::sync::Arc;

    #[test]
    fn test_fuzzy_matching() {
        let entities = vec![
            RegisteredEntity {
                id: "e1".to_string(),
                label: "Monkey D. Luffy".to_string(),
                aliases: vec![],
                kind: EntityKind::CHARACTER,
                narrative_id: None,
            },
            RegisteredEntity {
                id: "e2".to_string(),
                label: "Roronoa Zoro".to_string(),
                aliases: vec![],
                kind: EntityKind::CHARACTER,
                narrative_id: None,
            }
        ];

        let compiled = compile_dictionary(1, 100, &entities).unwrap();
        let dict = RuntimeDictionary::load(compiled).unwrap();
        let scanner = ScannerCore::new(Arc::new(dict));

        // Exact match
        let spans = scanner.scan("Monkey D. Luffy is here.", None);
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].matched_text, "Monkey D. Luffy");

        // Fuzzy match (typo in unique token "Luffy" -> "Luffu")
        // "Luffy" df=1, should be in unique_token index.
        let spans = scanner.scan("Monkey D. Luffu is here.", None);
        assert_eq!(spans.len(), 1, "Should fuzzy match 'Luffu' to 'Luffy'");
        assert_eq!(spans[0].label, "Monkey D. Luffy");
        // matched_text should be the full spanned text
        assert_eq!(spans[0].matched_text, "Monkey D. Luffu");

        // Single token anchor match: "Zoro" is likely an anchor.
        // Scan "Zoroo" (typo)
        let spans = scanner.scan("I see Zoroo.", None);
        assert_eq!(spans.len(), 1, "Should fuzzy match 'Zoroo' to 'Zoro'");
        assert_eq!(spans[0].label, "Roronoa Zoro");
    }

    #[test]
    fn test_scope_filtering() {
        let entities = vec![
            RegisteredEntity {
                id: "global1".to_string(),
                label: "Global Hero".to_string(),
                aliases: vec![],
                kind: EntityKind::CHARACTER,
                narrative_id: None,
            },
            RegisteredEntity {
                id: "n1_char".to_string(),
                label: "Narrative One Hero".to_string(),
                aliases: vec![],
                kind: EntityKind::CHARACTER,
                narrative_id: Some("narrative_1".to_string()),
            },
            RegisteredEntity {
                id: "n2_char".to_string(),
                label: "Narrative Two Hero".to_string(),
                aliases: vec![],
                kind: EntityKind::CHARACTER,
                narrative_id: Some("narrative_2".to_string()),
            },
        ];

        let compiled = compile_dictionary(1, 100, &entities).unwrap();
        let dict = RuntimeDictionary::load(compiled).unwrap();
        let scanner = ScannerCore::new(Arc::new(dict));

        let text = "Global Hero met Narrative One Hero and Narrative Two Hero.";

        // 1. Scan with NO scope (Global only)
        let spans_global = scanner.scan(text, None);
        assert!(spans_global.iter().any(|s| s.label == "Global Hero"));
        assert!(!spans_global.iter().any(|s| s.label == "Narrative One Hero"));
        assert!(!spans_global.iter().any(|s| s.label == "Narrative Two Hero"));

        // 2. Scan with Narrative 1
        let spans_n1 = scanner.scan(text, Some("narrative_1"));
        assert!(spans_n1.iter().any(|s| s.label == "Global Hero")); // Global should show
        assert!(spans_n1.iter().any(|s| s.label == "Narrative One Hero")); // N1 should show
        assert!(!spans_n1.iter().any(|s| s.label == "Narrative Two Hero")); // N2 should NOT show

        // 3. Scan with Narrative 2
        let spans_n2 = scanner.scan(text, Some("narrative_2"));
        assert!(spans_n2.iter().any(|s| s.label == "Global Hero"));
        assert!(!spans_n2.iter().any(|s| s.label == "Narrative One Hero"));
        assert!(spans_n2.iter().any(|s| s.label == "Narrative Two Hero"));
    }
}
