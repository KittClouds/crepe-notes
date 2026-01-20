use std::collections::BTreeMap;
use fst::MapBuilder;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use super::types::{EntityKind, RegisteredEntity, EntityInfo};

pub const MAX_PHRASE_TOKENS: usize = 4;
pub const TOK_SEP: char = '\u{0001}';

// ---- Domain DTOs ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompiledDictionary {
    pub version: u64,
    pub compiled_at: u64,
    pub entity_count: usize,
    pub phrase_count: usize,

    // key -> bucket_idx (FST bytes)
    pub fst_bytes: Vec<u8>,

    // bucket_idx -> entities sharing that key
    pub buckets: Vec<Vec<EntityInfo>>,

    // -- Fuzzy Index --
    // Token -> Entity ID (for unique tokens)
    pub unique_token_to_id: BTreeMap<String, String>,

    // Token -> List of Entity IDs (for rare anchor tokens)
    pub anchor_to_ids: BTreeMap<String, Vec<String>>,

    // Entity ID -> List of tokens (for verification)
    pub entity_tokens: BTreeMap<String, Vec<String>>,
}

#[derive(Debug, Error)]
pub enum DictError {
    #[error("fst insert failed")]
    InsertFailed,
    #[error("fst finish failed")]
    FinishFailed,
    #[error("fst load failed")]
    LoadFailed,
}

// ---- Normalization & keying ----

pub fn is_stop_word(s: &str) -> bool {
    matches!(
        s,
        "mr" | "mrs" | "ms" | "dr" | "prof" | "sir" | "lady" | "lord" | "king" | "queen" |
        "the" | "of" | "and" | "a" | "an" |
        // Common words that shouldn't be unique identifiers
        "sun" | "hat" | "hair" | "red" | "blue" | "one" | "two" | "big" | "old" | "new" |
        "force" | "star" | "moon" | "sea" | "sky" | "ship" | "world" | "giant" | "giants"
    )
}

pub fn normalize_raw(s: &str) -> String {
    // TS: lowercase, curly apostrophe -> ', non [a-z0-9' ] -> space, collapse whitespace.
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        let mut c = ch.to_ascii_lowercase();
        if c == '\u{2019}' { c = '\''; }
        let keep = c.is_ascii_alphanumeric() || c == '\'' || c.is_whitespace();
        out.push(if keep { c } else { ' ' });
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn tokens_from_normalized(norm: &str) -> Vec<&str> {
    norm.split(' ').filter(|t| !t.is_empty() && !is_stop_word(t)).collect()
}

pub fn phrase_key(surface: &str) -> Option<String> {
    let norm = normalize_raw(surface);
    if norm.is_empty() { return None; }
    let toks = tokens_from_normalized(&norm);
    if toks.is_empty() || toks.len() > MAX_PHRASE_TOKENS { return None; }
    Some(toks.join(&TOK_SEP.to_string()))
}

// ---- Auto-alias (match TS rules) ----

fn generate_auto_aliases(label: &str, kind: EntityKind) -> Vec<String> {
    let norm = normalize_raw(label);
    let toks = tokens_from_normalized(&norm);
    if toks.len() <= 1 { return vec![]; }

    let first = toks[0];
    let last  = toks[toks.len() - 1];
    let mut out = Vec::<String>::new();

    if kind == EntityKind::CHARACTER {
        if last.len() >= 3 { out.push(last.to_string()); }
        if toks.len() >= 3 && first != last { out.push(format!("{first} {last}")); }
        if toks.len() >= 3 {
            let second_last = toks[toks.len() - 2];
            if second_last.len() <= 2 { out.push(format!("{second_last} {last}")); }
        }
        if first.len() >= 4 && first != last { out.push(first.to_string()); }
    }

    if matches!(kind, EntityKind::FACTION | EntityKind::ORGANIZATION) {
        let acronym: String = toks.iter().map(|t| t.chars().next().unwrap()).collect();
        if (2..=5).contains(&acronym.len()) { out.push(acronym); }
        if last.len() >= 4 { out.push(last.to_string()); }
    }

    if kind == EntityKind::LOCATION && first.len() >= 4 {
        out.push(first.to_string());
    }

    out.sort();
    out.dedup();
    out
}

// ---- Compiler ----

pub fn compile_dictionary(
    version: u64,
    compiled_at: u64,
    entities: &[RegisteredEntity],
) -> Result<CompiledDictionary, DictError> {
    // key -> entities (ambiguous buckets)
    let mut key_to_bucket: BTreeMap<String, Vec<EntityInfo>> = BTreeMap::new();

    for e in entities {
        let info = EntityInfo { 
            id: e.id.clone(), 
            label: e.label.clone(), 
            kind: e.kind,
            narrative_id: e.narrative_id.clone()
        };

        let mut surfaces: Vec<String> = Vec::with_capacity(1 + e.aliases.len() + 4);
        surfaces.push(e.label.clone());
        surfaces.extend(e.aliases.iter().cloned());
        surfaces.extend(generate_auto_aliases(&e.label, e.kind));

        for s in surfaces {
            let Some(k) = phrase_key(&s) else { continue; };
            let bucket = key_to_bucket.entry(k).or_default();
            // Dedup within bucket
            if !bucket.iter().any(|x| x.id == info.id) {
                bucket.push(info.clone());
            }
        }
    }

    // Build fst: key -> bucket_idx
    let mut builder = MapBuilder::memory();
    let mut buckets: Vec<Vec<EntityInfo>> = Vec::with_capacity(key_to_bucket.len());

    for (idx, (key, infos)) in key_to_bucket.into_iter().enumerate() {
        builder.insert(key.as_bytes(), idx as u64).map_err(|_| DictError::InsertFailed)?;
        buckets.push(infos);
    }

    let fst_bytes = builder.into_inner().map_err(|_| DictError::FinishFailed)?;

    // ---- Fuzzy Indexing ----

    let mut token_df = std::collections::HashMap::new();
    let mut token_owner = std::collections::HashMap::new();
    let mut entity_tokens_map = BTreeMap::new();

    // Pass 1: TF/DF and Tokenizing
    for e in entities {
        let norm = normalize_raw(&e.label);
        let toks = tokens_from_normalized(&norm)
            .into_iter()
            .map(|s| s.to_string())
            .collect::<Vec<_>>();
        
        let unique_toks: std::collections::HashSet<&String> = toks.iter().collect();
        for t in &unique_toks {
            *token_df.entry((*t).clone()).or_insert(0) += 1;
            token_owner.entry((*t).clone()).or_insert_with(|| e.id.clone());
        }

        entity_tokens_map.insert(e.id.clone(), toks);
    }

    // Identify Unique Tokens
    let mut unique_token_to_id = BTreeMap::new();
    for (t, count) in &token_df {
        if *count == 1 {
            if let Some(owner) = token_owner.get(t) {
                unique_token_to_id.insert(t.clone(), owner.clone());
            }
        }
    }

    // Pass 2: Anchor Selection
    let mut anchor_to_ids = BTreeMap::new();
    for e in entities {
        if let Some(toks) = entity_tokens_map.get(&e.id) {
            let mut unique_toks: Vec<&String> = toks.iter()
                .filter(|t| t.len() >= 3)
                .collect::<std::collections::HashSet<_>>().into_iter().collect();
            // Sort by DF (rarest first)
            unique_toks.sort_by_key(|t| token_df.get(*t).unwrap_or(&9999));
            
            // Pick top 3 anchors (increased from 2 for reliability)
            for anchor in unique_toks.iter().take(3) {
                anchor_to_ids.entry((*anchor).clone()).or_insert_with(Vec::new).push(e.id.clone());
            }
        }
    }

    Ok(CompiledDictionary {
        version,
        compiled_at,
        entity_count: entities.len(),
        phrase_count: buckets.len(),
        fst_bytes,
        buckets,
        unique_token_to_id,
        anchor_to_ids,
        entity_tokens: entity_tokens_map,
    })
}
