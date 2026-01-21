//! CozoCrossDoc - Cross-Document Knowledge Graph Schema
//!
//! Provides HNSW vector search for entity similarity and clustering.
//! Supports Matryoshka embeddings (768/384/256/128 dimensions).
//!
//! Relations:
//! - node_vectors: Entity embeddings with HNSW indices
//! - entity_clusters: Cluster definitions with canonical entities
//! - cluster_members: Cluster membership with similarity scores
//! - cooccurrence_edges: Entity co-occurrence weights

use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use serde_json::Value as JsonValue;
use std::cell::RefCell;
use std::collections::BTreeMap;

use crate::db::cozo_graph::CozoGraph;
use crate::db::cozo_shared::COZO_DB;

// =============================================================================
// Schema Definitions
// =============================================================================

/// Node vectors relation - stores embeddings per entity
pub fn node_vectors_schema() -> &'static str {
    r#"
        :create node_vectors {
            node_id: String,
            model: String
            =>
            dimension: Int,
            vector: [Float; 768],
            context_text: String?,
            source_note_id: String?,
            created_at: Float,
            updated_at: Float
        }
    "#
}

/// HNSW index for 384-dim vectors (Matryoshka primary)
pub fn node_vectors_hnsw_384_schema() -> &'static str {
    r#"
        ::hnsw create node_vectors:semantic_idx_384 {
            dim: 384,
            m: 16,
            ef_construction: 100,
            fields: [vector],
            distance: Cosine,
            filter: dimension == 384
        }
    "#
}

/// HNSW index for 768-dim vectors
pub fn node_vectors_hnsw_768_schema() -> &'static str {
    r#"
        ::hnsw create node_vectors:semantic_idx_768 {
            dim: 768,
            m: 16,
            ef_construction: 100,
            fields: [vector],
            distance: Cosine,
            filter: dimension == 768
        }
    "#
}

/// HNSW index for 256-dim vectors
pub fn node_vectors_hnsw_256_schema() -> &'static str {
    r#"
        ::hnsw create node_vectors:semantic_idx_256 {
            dim: 256,
            m: 16,
            ef_construction: 100,
            fields: [vector],
            distance: Cosine,
            filter: dimension == 256
        }
    "#
}

/// HNSW index for 128-dim vectors
pub fn node_vectors_hnsw_128_schema() -> &'static str {
    r#"
        ::hnsw create node_vectors:semantic_idx_128 {
            dim: 128,
            m: 16,
            ef_construction: 100,
            fields: [vector],
            distance: Cosine,
            filter: dimension == 128
        }
    "#
}

/// Entity clusters - groups of similar/same entities
pub fn entity_clusters_schema() -> &'static str {
    r#"
        :create entity_clusters {
            cluster_id: String
            =>
            canonical_id: String,
            canonical_name: String,
            member_count: Int,
            avg_similarity: Float,
            confidence: Float,
            created_at: Float,
            updated_at: Float
        }
    "#
}

/// Cluster members - entities belonging to clusters
pub fn cluster_members_schema() -> &'static str {
    r#"
        :create cluster_members {
            cluster_id: String,
            node_id: String
            =>
            label: String,
            similarity: Float,
            is_canonical: Bool,
            joined_at: Float
        }
    "#
}

/// Co-occurrence edges - entities appearing together
pub fn cooccurrence_edges_schema() -> &'static str {
    r#"
        :create cooccurrence_edges {
            source_id: String,
            target_id: String
            =>
            weight: Float,
            doc_count: Int,
            last_seen_at: Float,
            first_seen_at: Float
        }
    "#
}

// =============================================================================
// Types
// =============================================================================

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VectorRecord {
    pub node_id: String,
    pub model: String,
    pub dimension: i64,
    pub vector: Vec<f64>,
    pub context_text: Option<String>,
    pub source_note_id: Option<String>,
    pub created_at: f64,
    pub updated_at: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ClusterRecord {
    pub cluster_id: String,
    pub canonical_id: String,
    pub canonical_name: String,
    pub member_count: i64,
    pub avg_similarity: f64,
    pub confidence: f64,
    pub created_at: f64,
    pub updated_at: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ClusterMemberRecord {
    pub cluster_id: String,
    pub node_id: String,
    pub label: String,
    pub similarity: f64,
    pub is_canonical: bool,
    pub joined_at: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CooccurrenceRecord {
    pub source_id: String,
    pub target_id: String,
    pub weight: f64,
    pub doc_count: i64,
    pub last_seen_at: f64,
    pub first_seen_at: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SimilarityResult {
    pub node_id: String,
    pub similarity: f64,
    pub label: Option<String>,
}

// =============================================================================
// Helpers
// =============================================================================

fn now_ms() -> f64 {
    js_sys::Date::now()
}

fn escape_str(s: &str) -> String {
    s.replace('\\', r"\\").replace('"', r#"\""#)
}

fn get_string(row: &BTreeMap<String, JsonValue>, key: &str) -> String {
    row.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

fn get_string_opt(row: &BTreeMap<String, JsonValue>, key: &str) -> Option<String> {
    row.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
}

fn get_i64(row: &BTreeMap<String, JsonValue>, key: &str, default: i64) -> i64 {
    row.get(key)
        .and_then(|v| v.as_i64())
        .unwrap_or(default)
}

fn get_f64(row: &BTreeMap<String, JsonValue>, key: &str, default: f64) -> f64 {
    row.get(key)
        .and_then(|v| v.as_f64())
        .unwrap_or(default)
}

fn get_bool(row: &BTreeMap<String, JsonValue>, key: &str) -> bool {
    row.get(key)
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

fn vector_to_cozo(vec: &[f64]) -> String {
    format!("[{}]", vec.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(", "))
}

// =============================================================================
// Vector CRUD WASM API
// =============================================================================

/// Upsert a vector for an entity
#[wasm_bindgen]
pub fn crossdoc_upsert_vector(
    node_id: &str,
    model: &str,
    dimension: i64,
    vector_json: &str,
    context_text: Option<String>,
    source_note_id: Option<String>,
) -> Result<bool, JsValue> {
    let vector: Vec<f64> = serde_json::from_str(vector_json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    
    if vector.len() != dimension as usize {
        return Err(JsValue::from_str(&format!(
            "Vector dimension mismatch: expected {}, got {}",
            dimension, vector.len()
        )));
    }
    
    // Pad to 768 if needed (CozoDB fixed array)
    let mut padded = vector.clone();
    padded.resize(768, 0.0);
    
    let now = now_ms();
    let ctx = context_text.as_deref().map(escape_str).unwrap_or_default();
    let src = source_note_id.as_deref().map(escape_str).unwrap_or_default();
    
    let query = format!(
        r#"?[node_id, model, dimension, vector, context_text, source_note_id, created_at, updated_at] <- [[
            "{}", "{}", {}, {}, {}, {}, {}, {}
        ]]
        :put node_vectors {{
            node_id, model => dimension, vector, context_text, source_note_id, created_at, updated_at
        }}"#,
        escape_str(node_id),
        escape_str(model),
        dimension,
        vector_to_cozo(&padded),
        if ctx.is_empty() { "null".to_string() } else { format!("\"{}\"", ctx) },
        if src.is_empty() { "null".to_string() } else { format!("\"{}\"", src) },
        now,
        now
    );

    COZO_DB.with(|cell: &RefCell<Option<CozoGraph>>| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => Err(JsValue::from_str("CozoDB not initialized")),
            Some(graph) => {
                graph.query(&query)
                    .map(|_| true)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))
            }
        }
    })
}

/// Get vector for a node
#[wasm_bindgen]
pub fn crossdoc_get_vector(node_id: &str) -> Result<JsValue, JsValue> {
    let query = format!(
        r#"?[node_id, model, dimension, vector, context_text, source_note_id, created_at, updated_at] :=
            *node_vectors{{node_id, model, dimension, vector, context_text, source_note_id, created_at, updated_at}},
            node_id == "{}"
        :limit 1"#,
        escape_str(node_id)
    );

    COZO_DB.with(|cell: &RefCell<Option<CozoGraph>>| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => Err(JsValue::from_str("CozoDB not initialized")),
            Some(graph) => {
                let result = graph.query(&query)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))?;
                
                if result.is_empty() {
                    Ok(JsValue::NULL)
                } else {
                    let row = &result[0];
                    let dim = get_i64(row, "dimension", 384);
                    
                    // Extract vector and truncate to actual dimension
                    let full_vec: Vec<f64> = row.get("vector")
                        .and_then(|v| v.as_array())
                        .map(|arr| arr.iter().filter_map(|v| v.as_f64()).collect())
                        .unwrap_or_default();
                    let vec = full_vec.into_iter().take(dim as usize).collect::<Vec<_>>();
                    
                    let record = VectorRecord {
                        node_id: get_string(row, "node_id"),
                        model: get_string(row, "model"),
                        dimension: dim,
                        vector: vec,
                        context_text: get_string_opt(row, "context_text"),
                        source_note_id: get_string_opt(row, "source_note_id"),
                        created_at: get_f64(row, "created_at", 0.0),
                        updated_at: get_f64(row, "updated_at", 0.0),
                    };
                    
                    serde_wasm_bindgen::to_value(&record)
                        .map_err(|e| JsValue::from_str(&format!("{}", e)))
                }
            }
        }
    })
}

/// Search for similar vectors using HNSW
#[wasm_bindgen]
pub fn crossdoc_search_similar(
    query_vector_json: &str,
    dimension: i64,
    k: i64,
) -> Result<JsValue, JsValue> {
    let query_vec: Vec<f64> = serde_json::from_str(query_vector_json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    
    // Determine which HNSW index to use
    let index_name = match dimension {
        768 => "semantic_idx_768",
        384 => "semantic_idx_384",
        256 => "semantic_idx_256",
        128 => "semantic_idx_128",
        _ => return Err(JsValue::from_str(&format!("Unsupported dimension: {}", dimension))),
    };
    
    // Pad/truncate to match expectation
    let mut padded = query_vec.clone();
    padded.resize(768, 0.0);
    
    let query = format!(
        r#"?[node_id, similarity] := ~node_vectors:{} {{
            node_id |
            query: {},
            k: {},
            ef: 50,
            bind_distance: similarity
        }}"#,
        index_name,
        vector_to_cozo(&padded),
        k
    );

    COZO_DB.with(|cell: &RefCell<Option<CozoGraph>>| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => Err(JsValue::from_str("CozoDB not initialized")),
            Some(graph) => {
                let result = graph.query(&query)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))?;
                
                let results: Vec<SimilarityResult> = result.iter().map(|row| {
                    SimilarityResult {
                        node_id: get_string(row, "node_id"),
                        similarity: get_f64(row, "similarity", 0.0),
                        label: None, // Can join with nodes table if needed
                    }
                }).collect();

                serde_wasm_bindgen::to_value(&results)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))
            }
        }
    })
}

// =============================================================================
// Cluster CRUD WASM API
// =============================================================================

/// Create or update a cluster
#[wasm_bindgen]
pub fn crossdoc_upsert_cluster(cluster_json: &str) -> Result<bool, JsValue> {
    let cluster: ClusterRecord = serde_json::from_str(cluster_json)
        .map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;
    
    let now = now_ms();
    
    let query = format!(
        r#"?[cluster_id, canonical_id, canonical_name, member_count, avg_similarity, confidence, created_at, updated_at] <- [[
            "{}", "{}", "{}", {}, {}, {}, {}, {}
        ]]
        :put entity_clusters {{
            cluster_id => canonical_id, canonical_name, member_count, avg_similarity, confidence, created_at, updated_at
        }}"#,
        escape_str(&cluster.cluster_id),
        escape_str(&cluster.canonical_id),
        escape_str(&cluster.canonical_name),
        cluster.member_count,
        cluster.avg_similarity,
        cluster.confidence,
        if cluster.created_at > 0.0 { cluster.created_at } else { now },
        now
    );

    COZO_DB.with(|cell: &RefCell<Option<CozoGraph>>| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => Err(JsValue::from_str("CozoDB not initialized")),
            Some(graph) => {
                graph.query(&query)
                    .map(|_| true)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))
            }
        }
    })
}

/// Add a member to a cluster
#[wasm_bindgen]
pub fn crossdoc_add_cluster_member(
    cluster_id: &str,
    node_id: &str,
    label: &str,
    similarity: f64,
    is_canonical: bool,
) -> Result<bool, JsValue> {
    let now = now_ms();
    
    let query = format!(
        r#"?[cluster_id, node_id, label, similarity, is_canonical, joined_at] <- [[
            "{}", "{}", "{}", {}, {}, {}
        ]]
        :put cluster_members {{
            cluster_id, node_id => label, similarity, is_canonical, joined_at
        }}"#,
        escape_str(cluster_id),
        escape_str(node_id),
        escape_str(label),
        similarity,
        is_canonical,
        now
    );

    COZO_DB.with(|cell: &RefCell<Option<CozoGraph>>| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => Err(JsValue::from_str("CozoDB not initialized")),
            Some(graph) => {
                graph.query(&query)
                    .map(|_| true)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))
            }
        }
    })
}

/// Get all members of a cluster
#[wasm_bindgen]
pub fn crossdoc_get_cluster_members(cluster_id: &str) -> Result<JsValue, JsValue> {
    let query = format!(
        r#"?[cluster_id, node_id, label, similarity, is_canonical, joined_at] :=
            *cluster_members{{cluster_id, node_id, label, similarity, is_canonical, joined_at}},
            cluster_id == "{}"
        :order -similarity"#,
        escape_str(cluster_id)
    );

    COZO_DB.with(|cell: &RefCell<Option<CozoGraph>>| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => Err(JsValue::from_str("CozoDB not initialized")),
            Some(graph) => {
                let result = graph.query(&query)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))?;
                
                let members: Vec<ClusterMemberRecord> = result.iter().map(|row| {
                    ClusterMemberRecord {
                        cluster_id: get_string(row, "cluster_id"),
                        node_id: get_string(row, "node_id"),
                        label: get_string(row, "label"),
                        similarity: get_f64(row, "similarity", 0.0),
                        is_canonical: get_bool(row, "is_canonical"),
                        joined_at: get_f64(row, "joined_at", 0.0),
                    }
                }).collect();

                serde_wasm_bindgen::to_value(&members)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))
            }
        }
    })
}

// =============================================================================
// Co-occurrence WASM API
// =============================================================================

/// Upsert (increment) a co-occurrence edge
#[wasm_bindgen]
pub fn crossdoc_upsert_cooccurrence(
    source_id: &str,
    target_id: &str,
    weight_delta: f64,
) -> Result<bool, JsValue> {
    let now = now_ms();
    
    // Ensure consistent ordering (source < target) to avoid duplicates
    let (s, t) = if source_id < target_id {
        (source_id, target_id)
    } else {
        (target_id, source_id)
    };
    
    // Query to get existing weight, then upsert with increment
    let query = format!(
        r#"
        old[source_id, target_id, weight, doc_count, first_seen_at] := 
            *cooccurrence_edges{{source_id, target_id, weight, doc_count, first_seen_at}},
            source_id == "{0}", target_id == "{1}"
        old[source_id, target_id, weight, doc_count, first_seen_at] :=
            source_id = "{0}", target_id = "{1}", weight = 0.0, doc_count = 0, first_seen_at = {2}
        
        ?[source_id, target_id, weight, doc_count, last_seen_at, first_seen_at] :=
            old[source_id, target_id, old_weight, old_count, fs],
            weight = old_weight + {3},
            doc_count = old_count + 1,
            last_seen_at = {2},
            first_seen_at = fs
        
        :put cooccurrence_edges {{
            source_id, target_id => weight, doc_count, last_seen_at, first_seen_at
        }}
        "#,
        escape_str(s),
        escape_str(t),
        now,
        weight_delta
    );

    COZO_DB.with(|cell: &RefCell<Option<CozoGraph>>| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => Err(JsValue::from_str("CozoDB not initialized")),
            Some(graph) => {
                graph.query(&query)
                    .map(|_| true)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))
            }
        }
    })
}

/// Get co-occurrence edges for an entity
#[wasm_bindgen]
pub fn crossdoc_get_cooccurrences(node_id: &str) -> Result<JsValue, JsValue> {
    let query = format!(
        r#"?[source_id, target_id, weight, doc_count, last_seen_at, first_seen_at] :=
            *cooccurrence_edges{{source_id, target_id, weight, doc_count, last_seen_at, first_seen_at}},
            (source_id == "{0}" || target_id == "{0}")
        :order -weight"#,
        escape_str(node_id)
    );

    COZO_DB.with(|cell: &RefCell<Option<CozoGraph>>| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => Err(JsValue::from_str("CozoDB not initialized")),
            Some(graph) => {
                let result = graph.query(&query)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))?;
                
                let edges: Vec<CooccurrenceRecord> = result.iter().map(|row| {
                    CooccurrenceRecord {
                        source_id: get_string(row, "source_id"),
                        target_id: get_string(row, "target_id"),
                        weight: get_f64(row, "weight", 0.0),
                        doc_count: get_i64(row, "doc_count", 0),
                        last_seen_at: get_f64(row, "last_seen_at", 0.0),
                        first_seen_at: get_f64(row, "first_seen_at", 0.0),
                    }
                }).collect();

                serde_wasm_bindgen::to_value(&edges)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))
            }
        }
    })
}

// =============================================================================
// Stats
// =============================================================================

#[derive(Serialize, Deserialize)]
pub struct CrossdocStats {
    pub vector_count: usize,
    pub cluster_count: usize,
    pub member_count: usize,
    pub cooccurrence_count: usize,
}

#[wasm_bindgen]
pub fn crossdoc_get_stats() -> Result<JsValue, JsValue> {
    COZO_DB.with(|cell: &RefCell<Option<CozoGraph>>| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => Err(JsValue::from_str("CozoDB not initialized")),
            Some(graph) => {
                let vector_count = graph.query("?[count(node_id)] := *node_vectors{node_id}")
                    .ok()
                    .and_then(|r| r.first().and_then(|row| row.get("count(node_id)").and_then(|v| v.as_u64())))
                    .unwrap_or(0) as usize;
                
                let cluster_count = graph.query("?[count(cluster_id)] := *entity_clusters{cluster_id}")
                    .ok()
                    .and_then(|r| r.first().and_then(|row| row.get("count(cluster_id)").and_then(|v| v.as_u64())))
                    .unwrap_or(0) as usize;
                
                let member_count = graph.query("?[count(node_id)] := *cluster_members{node_id}")
                    .ok()
                    .and_then(|r| r.first().and_then(|row| row.get("count(node_id)").and_then(|v| v.as_u64())))
                    .unwrap_or(0) as usize;
                
                let cooccurrence_count = graph.query("?[count(source_id)] := *cooccurrence_edges{source_id}")
                    .ok()
                    .and_then(|r| r.first().and_then(|row| row.get("count(source_id)").and_then(|v| v.as_u64())))
                    .unwrap_or(0) as usize;
                
                let stats = CrossdocStats {
                    vector_count,
                    cluster_count,
                    member_count,
                    cooccurrence_count,
                };
                
                serde_wasm_bindgen::to_value(&stats)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))
            }
        }
    })
}
