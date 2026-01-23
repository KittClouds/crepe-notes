//! Alex: The Librarian - DAFSA-Based Entity Library
//!
//! Named after the Library of Alexandria, Alex is the compressed entity dictionary
//! that serves as the single source of truth for all entity definitions.
//!
//! # Roles
//! - **Hunter** (AC Scanner): Scans wild text for known patterns - already done
//! - **Librarian** (Alex): Stores/queries dictionary of known terms - this module
//!
//! # Benefits
//! - Fast startup: Load FST bytes from IndexedDB instead of querying CozoDB
//! - Compressed storage: FST provides efficient storage for entity dictionary
//! - Fuzzy matching: Damerau-Levenshtein for typo tolerance
//! - Hydration source: AC scanner gets entity list from Alex
//!
//! # Submodules
//! - `fuzzy` - Damerau-Levenshtein distance and token matching
//! - `normalize` - Text normalization and tokenization utilities

// Submodules
pub mod fuzzy;
pub mod normalize;
pub mod persistence;

use std::collections::{HashMap, BTreeMap};
use fst::Map;
use serde::{Deserialize, Serialize};
use thiserror::Error;

// Re-use types from dafsa
pub use crate::scanner::dafsa::types::{EntityInfo, RegisteredEntity};
// EntityKind only used in tests
#[cfg(test)]
use crate::scanner::dafsa::types::EntityKind;
use crate::scanner::dafsa::compiler::{CompiledDictionary, compile_dictionary};

// Use shared utilities
use normalize::normalize_raw;
use fuzzy::tok_match;

// ---- Error Types ----

#[derive(Debug, Error)]
pub enum AlexError {
    #[error("FST load failed")]
    FstLoadFailed,
    #[error("Serialization failed")]
    SerializationFailed,
    #[error("Serialize failed")]
    SerializeFailed,
    #[error("Deserialization failed")]
    DeserializationFailed,
    #[error("Build failed: {0}")]
    BuildFailed(String),
}

// ---- Serializable State ----

/// Serializable snapshot of Alex state, optimized for IndexedDB storage
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlexSnapshot {
    pub version: u64,
    pub compiled_at: u64,
    pub entity_count: usize,
    
    // FST bytes (the core compressed dictionary)
    pub fst_bytes: Vec<u8>,
    
    // Metadata per entity (id -> EntityInfo)
    pub entities: Vec<EntityInfo>,
    
    // Fuzzy index components
    pub unique_token_to_id: BTreeMap<String, String>,
    pub anchor_to_ids: BTreeMap<String, Vec<String>>,
    pub entity_tokens: BTreeMap<String, Vec<String>>,
    
    // Bucket structure (maps phrase keys to entity indices)
    pub buckets: Vec<Vec<usize>>, // indices into entities vec
}

// ---- Main Alex Struct ----

/// Alex: The Librarian - DAFSA-based entity library
/// 
/// Provides:
/// - `is_known(token)` - exact lookup
/// - `fuzzy_match(token)` - typo-tolerant lookup
/// - `get_entity(id)` - by ID
/// - `get_all_entities()` - list all
/// - `to_registered_entities()` - for AC scanner hydration
pub struct Alex {
    // FST map: normalized_key -> bucket_idx
    fst: Map<Vec<u8>>,
    
    // Entity storage
    entities: Vec<EntityInfo>,
    id_to_idx: HashMap<String, usize>,
    
    // Bucket mapping (bucket_idx -> entity indices)
    buckets: Vec<Vec<usize>>,
    
    // Fuzzy index
    unique_token_to_id: BTreeMap<String, String>,
    anchor_to_ids: BTreeMap<String, Vec<String>>,
    entity_tokens: BTreeMap<String, Vec<String>>,
    
    // Metadata
    version: u64,
    compiled_at: u64,
}

impl Alex {
    /// Build Alex from a slice of RegisteredEntity
    pub fn build(entities: &[RegisteredEntity]) -> Result<Self, AlexError> {
        // Use WASM-compatible timestamp (js_sys on wasm32, SystemTime on native)
        #[cfg(target_arch = "wasm32")]
        let now = js_sys::Date::now() as u64;
        
        #[cfg(not(target_arch = "wasm32"))]
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        
        let version = 1;
        
        // Use existing compiler
        let compiled = compile_dictionary(version, now, entities)
            .map_err(|e| AlexError::BuildFailed(format!("{:?}", e)))?;
        
        Self::from_compiled(compiled)
    }
    
    /// Create Alex from a CompiledDictionary (internal)
    fn from_compiled(compiled: CompiledDictionary) -> Result<Self, AlexError> {
        let fst = Map::new(compiled.fst_bytes).map_err(|_| AlexError::FstLoadFailed)?;
        
        // Flatten all entities from buckets (dedup by id)
        let mut entities = Vec::new();
        let mut id_to_idx: HashMap<String, usize> = HashMap::new();
        let mut bucket_indices: Vec<Vec<usize>> = Vec::with_capacity(compiled.buckets.len());
        
        for bucket in &compiled.buckets {
            let mut bucket_idxs = Vec::with_capacity(bucket.len());
            for info in bucket {
                let idx = if let Some(&existing_idx) = id_to_idx.get(&info.id) {
                    existing_idx
                } else {
                    let new_idx = entities.len();
                    id_to_idx.insert(info.id.clone(), new_idx);
                    entities.push(info.clone());
                    new_idx
                };
                bucket_idxs.push(idx);
            }
            bucket_indices.push(bucket_idxs);
        }
        
        Ok(Self {
            fst,
            entities,
            id_to_idx,
            buckets: bucket_indices,
            unique_token_to_id: compiled.unique_token_to_id,
            anchor_to_ids: compiled.anchor_to_ids,
            entity_tokens: compiled.entity_tokens,
            version: compiled.version,
            compiled_at: compiled.compiled_at,
        })
    }
    
    /// Load Alex from a serialized snapshot
    pub fn load(bytes: &[u8]) -> Result<Self, AlexError> {
        let snapshot: AlexSnapshot = bincode::deserialize(bytes)
            .map_err(|_| AlexError::DeserializationFailed)?;
        
        let fst = Map::new(snapshot.fst_bytes).map_err(|_| AlexError::FstLoadFailed)?;
        
        // Build id_to_idx
        let mut id_to_idx = HashMap::with_capacity(snapshot.entities.len());
        for (idx, info) in snapshot.entities.iter().enumerate() {
            id_to_idx.insert(info.id.clone(), idx);
        }
        
        Ok(Self {
            fst,
            entities: snapshot.entities,
            id_to_idx,
            buckets: snapshot.buckets,
            unique_token_to_id: snapshot.unique_token_to_id,
            anchor_to_ids: snapshot.anchor_to_ids,
            entity_tokens: snapshot.entity_tokens,
            version: snapshot.version,
            compiled_at: snapshot.compiled_at,
        })
    }
    
    /// Serialize Alex to bytes for IndexedDB storage
    pub fn to_bytes(&self) -> Result<Vec<u8>, AlexError> {
        let snapshot = AlexSnapshot {
            version: self.version,
            compiled_at: self.compiled_at,
            entity_count: self.entities.len(),
            fst_bytes: self.fst.as_fst().as_bytes().to_vec(),
            entities: self.entities.clone(),
            unique_token_to_id: self.unique_token_to_id.clone(),
            anchor_to_ids: self.anchor_to_ids.clone(),
            entity_tokens: self.entity_tokens.clone(),
            buckets: self.buckets.clone(),
        };
        
        bincode::serialize(&snapshot).map_err(|_| AlexError::SerializationFailed)
    }
    
    // ---- Query Methods ----
    
    /// Check if a token is known (exact match)
    pub fn is_known(&self, token: &str) -> bool {
        let normalized = normalize_raw(token);
        if normalized.is_empty() { return false; }
        
        // Direct FST lookup
        if self.fst.contains_key(normalized.as_bytes()) {
            return true;
        }
        
        // Check unique token index
        if self.unique_token_to_id.contains_key(&normalized) {
            return true;
        }
        
        // Check anchor index
        if self.anchor_to_ids.contains_key(&normalized) {
            return true;
        }
        
        false
    }
    
    /// Fuzzy match a token (typo tolerance via Damerau-Levenshtein)
    pub fn fuzzy_match(&self, token: &str) -> Option<EntityInfo> {
        let normalized = normalize_raw(token);
        if normalized.is_empty() { return None; }
        
        // 1. Exact match via FST
        if let Some(bucket_idx) = self.fst.get(normalized.as_bytes()) {
            if let Some(idxs) = self.buckets.get(bucket_idx as usize) {
                if !idxs.is_empty() {
                    return self.entities.get(idxs[0]).cloned();
                }
            }
        }
        
        // 2. Unique token exact match
        if let Some(id) = self.unique_token_to_id.get(&normalized) {
            return self.get_entity(id).cloned();
        }
        
        // 3. Anchor exact match
        if let Some(ids) = self.anchor_to_ids.get(&normalized) {
            if let Some(first_id) = ids.first() {
                return self.get_entity(first_id).cloned();
            }
        }
        
        // 4. Fuzzy anchor match (for typos)
        if normalized.len() >= 4 {
            for anchor in self.anchor_to_ids.keys() {
                if tok_match(&normalized, anchor) {
                    if let Some(ids) = self.anchor_to_ids.get(anchor) {
                        if let Some(first_id) = ids.first() {
                            return self.get_entity(first_id).cloned();
                        }
                    }
                }
            }
        }
        
        None
    }
    
    /// Get entity by ID
    pub fn get_entity(&self, id: &str) -> Option<&EntityInfo> {
        self.id_to_idx.get(id).and_then(|&idx| self.entities.get(idx))
    }
    
    /// Get all entities
    pub fn get_all_entities(&self) -> Vec<&EntityInfo> {
        self.entities.iter().collect()
    }
    
    /// Convert to RegisteredEntity list for AC scanner hydration
    /// Note: aliases are NOT reconstructed since FST doesn't store them
    /// The caller should handle alias expansion if needed
    pub fn to_registered_entities(&self) -> Vec<RegisteredEntity> {
        self.entities.iter().map(|info| {
            // Note: We can't perfectly reconstruct aliases from the FST
            // The AC scanner should be hydrated from the original entity list when possible
            RegisteredEntity {
                id: info.id.clone(),
                label: info.label.clone(),
                kind: info.kind,
                aliases: vec![], // Aliases not stored in Alex
                narrative_id: info.narrative_id.clone(),
            }
        }).collect()
    }
    
    // ---- Metadata ----
    
    pub fn version(&self) -> u64 { self.version }
    pub fn compiled_at(&self) -> u64 { self.compiled_at }
    pub fn entity_count(&self) -> usize { self.entities.len() }
    
    /// Get buckets for a phrase key (for debugging)
    pub fn get_bucket(&self, key: &str) -> Option<Vec<&EntityInfo>> {
        let bucket_idx = self.fst.get(key.as_bytes())? as usize;
        let idxs = self.buckets.get(bucket_idx)?;
        Some(idxs.iter().filter_map(|&idx| self.entities.get(idx)).collect())
    }
}

// Fuzzy algorithms are now in alex::fuzzy module

// ---- Tests ----

#[cfg(test)]
mod tests {
    use super::*;
    
    fn make_entity(id: &str, label: &str, kind: EntityKind) -> RegisteredEntity {
        RegisteredEntity {
            id: id.to_string(),
            label: label.to_string(),
            kind,
            aliases: vec![],
            narrative_id: None,
        }
    }
    
    #[test]
    fn test_build_and_query() {
        let entities = vec![
            make_entity("e1", "Monkey D. Luffy", EntityKind::CHARACTER),
            make_entity("e2", "Roronoa Zoro", EntityKind::CHARACTER),
            make_entity("e3", "Grand Line", EntityKind::LOCATION),
        ];
        
        let alex = Alex::build(&entities).expect("build failed");
        
        // Check entity count
        assert_eq!(alex.entity_count(), 3);
        
        // Exact match via is_known
        assert!(alex.is_known("Luffy"));
        assert!(alex.is_known("Zoro"));
        assert!(alex.is_known("Grand Line"));
        assert!(!alex.is_known("Unknown Character"));
        
        // Get entity by ID
        let luffy = alex.get_entity("e1").expect("e1 missing");
        assert_eq!(luffy.label, "Monkey D. Luffy");
        
        // Get all entities
        let all = alex.get_all_entities();
        assert_eq!(all.len(), 3);
    }
    
    #[test]
    fn test_fuzzy_match() {
        let entities = vec![
            make_entity("e1", "Monkey D. Luffy", EntityKind::CHARACTER),
            make_entity("e2", "Roronoa Zoro", EntityKind::CHARACTER),
        ];
        
        let alex = Alex::build(&entities).expect("build failed");
        
        // Exact via fuzzy_match
        let exact = alex.fuzzy_match("Luffy");
        assert!(exact.is_some());
        assert_eq!(exact.unwrap().id, "e1");
        
        // Typo: "Luffu" should match "Luffy"
        let typo = alex.fuzzy_match("Luffu");
        assert!(typo.is_some(), "Should fuzzy match 'Luffu' to 'Luffy'");
        assert_eq!(typo.unwrap().id, "e1");
        
        // Typo: "Zoroo" should match "Zoro"
        let typo2 = alex.fuzzy_match("Zoroo");
        assert!(typo2.is_some(), "Should fuzzy match 'Zoroo' to 'Zoro'");
        assert_eq!(typo2.unwrap().id, "e2");
    }
    
    #[test]
    fn test_serialization_roundtrip() {
        let entities = vec![
            make_entity("e1", "Frodo Baggins", EntityKind::CHARACTER),
            make_entity("e2", "The Shire", EntityKind::LOCATION),
        ];
        
        let alex = Alex::build(&entities).expect("build failed");
        
        // Serialize
        let bytes = alex.to_bytes().expect("serialize failed");
        
        // Deserialize
        let alex2 = Alex::load(&bytes).expect("load failed");
        
        // Verify
        assert_eq!(alex2.entity_count(), 2);
        assert!(alex2.is_known("Frodo"));
        assert!(alex2.is_known("Shire"));
        
        let frodo = alex2.get_entity("e1").expect("e1 missing");
        assert_eq!(frodo.label, "Frodo Baggins");
    }
    
    #[test]
    fn test_to_registered_entities() {
        let entities = vec![
            make_entity("e1", "Samwise Gamgee", EntityKind::CHARACTER),
            make_entity("e2", "Mordor", EntityKind::LOCATION),
        ];
        
        let alex = Alex::build(&entities).expect("build failed");
        let hydrated = alex.to_registered_entities();
        
        assert_eq!(hydrated.len(), 2);
        assert_eq!(hydrated[0].label, "Samwise Gamgee");
        assert_eq!(hydrated[0].kind, EntityKind::CHARACTER);
    }
    
    #[test]
    fn test_empty_alex() {
        let alex = Alex::build(&[]).expect("empty build failed");
        
        assert_eq!(alex.entity_count(), 0);
        assert!(!alex.is_known("anything"));
        assert!(alex.fuzzy_match("anything").is_none());
        assert!(alex.get_all_entities().is_empty());
    }
    
    #[test]
    fn test_case_insensitivity() {
        let entities = vec![
            make_entity("e1", "GANDALF THE GREY", EntityKind::CHARACTER),
        ];
        
        let alex = Alex::build(&entities).expect("build failed");
        
        // Should match regardless of case
        assert!(alex.is_known("gandalf"));
        assert!(alex.is_known("GANDALF"));
        assert!(alex.is_known("Gandalf"));
        
        let match1 = alex.fuzzy_match("gandalf the grey");
        assert!(match1.is_some());
    }
}
