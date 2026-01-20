//! CozoRegistry - Entity & Relationship CRUD API
//!
//! High-level operations for SmartGraphRegistry parity.
//! Exposed via WASM for TypeScript consumption.

use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use serde_json::Value as JsonValue;
use std::cell::RefCell;
use std::collections::BTreeMap;

use crate::db::cozo_graph::CozoGraph;
use crate::db::cozo_shared::COZO_DB;


// =============================================================================
// Types
// =============================================================================

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EntityRecord {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub props: JsonValue,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RelationshipRecord {
    pub id: String,
    pub source_id: String,
    pub target_id: String,
    pub rel_type: String,
    pub confidence: f64,
    pub bidirectional: bool,
}

// =============================================================================
// Helper: Parse row from query result
// =============================================================================

fn get_string(row: &BTreeMap<String, JsonValue>, key: &str) -> String {
    row.get(key)
        .and_then(|v: &JsonValue| v.as_str())
        .unwrap_or("")
        .to_string()
}

fn get_f64(row: &BTreeMap<String, JsonValue>, key: &str, default: f64) -> f64 {
    row.get(key)
        .and_then(|v: &JsonValue| v.as_f64())
        .unwrap_or(default)
}

fn get_bool(row: &BTreeMap<String, JsonValue>, key: &str) -> bool {
    row.get(key)
        .and_then(|v: &JsonValue| v.as_bool())
        .unwrap_or(false)
}

fn parse_entity(row: &BTreeMap<String, JsonValue>) -> EntityRecord {
    EntityRecord {
        id: get_string(row, "id"),
        label: get_string(row, "label"),
        kind: get_string(row, "kind"),
        props: row.get("props").cloned().unwrap_or(JsonValue::Null),
    }
}

fn parse_relationship(row: &BTreeMap<String, JsonValue>) -> RelationshipRecord {
    RelationshipRecord {
        id: get_string(row, "id"),
        source_id: get_string(row, "source_id"),
        target_id: get_string(row, "target_id"),
        rel_type: get_string(row, "type"),
        confidence: get_f64(row, "confidence", 1.0),
        bidirectional: get_bool(row, "bidirectional"),
    }
}

// =============================================================================
// Entity CRUD
// =============================================================================

/// Register or update an entity
#[wasm_bindgen]
pub fn registry_upsert_entity(
    id: &str,
    label: &str,
    kind: &str,
    props_json: &str,
) -> Result<bool, JsValue> {
    let props: JsonValue = serde_json::from_str(props_json)
        .unwrap_or(JsonValue::Object(serde_json::Map::new()));

    COZO_DB.with(|cell: &RefCell<Option<CozoGraph>>| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => Err(JsValue::from_str("CozoDB not initialized")),
            Some(graph) => {
                graph.upsert_node(id, label, kind, props)
                    .map(|_| true)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))
            }
        }
    })
}

/// Get entity by ID
#[wasm_bindgen]
pub fn registry_get_entity_by_id(id: &str) -> Result<JsValue, JsValue> {
    // Handle nodes with and without props column
    let query = format!(
        r#"
            nodes_with_props[id, label, kind, props] := *nodes{{id, label, kind, props}}, id == "{0}"
            nodes_without_props[id, label, kind, props] := *nodes{{id, label, kind}}, id == "{0}", not *nodes{{id, props: _}}, props = {{}}
            ?[id, label, kind, props] := nodes_with_props[id, label, kind, props]
            ?[id, label, kind, props] := nodes_without_props[id, label, kind, props]
        "#,
        id.replace('"', r#"\""#)
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
                    let entity = parse_entity(&result[0]);
                    serde_wasm_bindgen::to_value(&entity)
                        .map_err(|e| JsValue::from_str(&format!("{}", e)))
                }
            }
        }
    })
}

/// Find entity by label (case-insensitive)
#[wasm_bindgen]
pub fn registry_find_entity_by_label(label: &str) -> Result<JsValue, JsValue> {
    let normalized = label.to_lowercase();
    // Handle nodes with and without props column
    let query = format!(
        r#"
            nodes_with_props[id, label, kind, props] := *nodes{{id, label, kind, props}}, lowercase(label) == "{0}"
            nodes_without_props[id, label, kind, props] := *nodes{{id, label, kind}}, lowercase(label) == "{0}", not *nodes{{id, props: _}}, props = {{}}
            ?[id, label, kind, props] := nodes_with_props[id, label, kind, props]
            ?[id, label, kind, props] := nodes_without_props[id, label, kind, props]
        "#,
        normalized.replace('"', r#"\""#)
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
                    let entity = parse_entity(&result[0]);
                    serde_wasm_bindgen::to_value(&entity)
                        .map_err(|e| JsValue::from_str(&format!("{}", e)))
                }
            }
        }
    })
}

/// Get all entities
#[wasm_bindgen]
pub fn registry_get_all_entities() -> Result<JsValue, JsValue> {
    web_sys::console::log_1(&"[CozoRegistry:TRACE] registry_get_all_entities() called".into());
    
    // Query all nodes - props may be missing on older data, so we handle it with a fallback
    // CozoDB doesn't have COALESCE, so we use a union of two rules:
    // 1. Nodes with props
    // 2. Nodes without props (assign empty JSON)
    let query = r#"
        nodes_with_props[id, label, kind, props] := *nodes{id, label, kind, props}
        nodes_without_props[id, label, kind, props] := *nodes{id, label, kind}, not *nodes{id, props: _}, props = {}
        ?[id, label, kind, props] := nodes_with_props[id, label, kind, props]
        ?[id, label, kind, props] := nodes_without_props[id, label, kind, props]
    "#;


    COZO_DB.with(|cell: &RefCell<Option<CozoGraph>>| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => {
                web_sys::console::error_1(&"[CozoRegistry:TRACE] CozoDB not initialized!".into());
                Err(JsValue::from_str("CozoDB not initialized"))
            }
            Some(graph) => {
                web_sys::console::log_1(&"[CozoRegistry:TRACE] Running query...".into());
                
                let result = graph.query(query)
                    .map_err(|e| {
                        web_sys::console::error_1(&format!("[CozoRegistry:TRACE] Query error: {}", e).into());
                        JsValue::from_str(&format!("{}", e))
                    })?;
                
                web_sys::console::log_1(&format!("[CozoRegistry:TRACE] Query returned {} rows", result.len()).into());
                
                // Log first 5 rows with their actual keys
                for (i, row) in result.iter().take(5).enumerate() {
                    let keys: Vec<&String> = row.keys().collect();
                    web_sys::console::log_1(&format!("[CozoRegistry:TRACE] Row[{}] KEYS: {:?}", i, keys).into());
                    
                    // Log raw values for each key
                    for (key, val) in row.iter() {
                        web_sys::console::log_1(&format!("[CozoRegistry:TRACE] Row[{}] {}={:?}", i, key, val).into());
                    }
                    
                    let id = get_string(row, "id");
                    let label = get_string(row, "label");
                    let kind = get_string(row, "kind");
                    web_sys::console::log_1(&format!("[CozoRegistry:TRACE] Row[{}]: id={}, label='{}', kind={}", i, id, label, kind).into());
                }

                
                let entities: Vec<EntityRecord> = result.iter()
                    .map(parse_entity)
                    .collect();

                web_sys::console::log_1(&format!("[CozoRegistry:TRACE] Returning {} entities", entities.len()).into());

                serde_wasm_bindgen::to_value(&entities)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))
            }
        }
    })
}


/// Delete entity by ID
#[wasm_bindgen]
pub fn registry_delete_entity(id: &str) -> Result<bool, JsValue> {
    let query = format!(
        r#"?[id] <- [["{}"]] :rm nodes {{id}}"#,
        id.replace('"', r#"\""#)
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

// =============================================================================
// Relationship CRUD
// =============================================================================

/// Create or update a relationship
#[wasm_bindgen]
pub fn registry_upsert_relationship(
    id: &str,
    source_id: &str,
    target_id: &str,
    rel_type: &str,
    confidence: f64,
    bidirectional: bool,
) -> Result<bool, JsValue> {
    COZO_DB.with(|cell: &RefCell<Option<CozoGraph>>| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => Err(JsValue::from_str("CozoDB not initialized")),
            Some(graph) => {
                graph.upsert_relationship(id, source_id, target_id, rel_type, confidence, bidirectional)
                    .map(|_| true)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))
            }
        }
    })
}

/// Get all relationships for an entity (both directions)
#[wasm_bindgen]
pub fn registry_get_relationships_for_entity(entity_id: &str) -> Result<JsValue, JsValue> {
    let query = format!(
        r#"?[id, source_id, target_id, type, confidence, bidirectional] := 
            *relationships{{id, source_id, target_id, type, confidence, bidirectional}},
            (source_id == "{0}" || target_id == "{0}")"#,
        entity_id.replace('"', r#"\""#)
    );

    COZO_DB.with(|cell: &RefCell<Option<CozoGraph>>| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => Err(JsValue::from_str("CozoDB not initialized")),
            Some(graph) => {
                let result = graph.query(&query)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))?;
                
                let relationships: Vec<RelationshipRecord> = result.iter()
                    .map(parse_relationship)
                    .collect();

                serde_wasm_bindgen::to_value(&relationships)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))
            }
        }
    })
}

/// Get all relationships
#[wasm_bindgen]
pub fn registry_get_all_relationships() -> Result<JsValue, JsValue> {
    let query = "?[id, source_id, target_id, type, confidence, bidirectional] := *relationships{id, source_id, target_id, type, confidence, bidirectional}";

    COZO_DB.with(|cell: &RefCell<Option<CozoGraph>>| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => Err(JsValue::from_str("CozoDB not initialized")),
            Some(graph) => {
                let result = graph.query(query)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))?;
                
                let relationships: Vec<RelationshipRecord> = result.iter()
                    .map(parse_relationship)
                    .collect();

                serde_wasm_bindgen::to_value(&relationships)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))
            }
        }
    })
}

/// Delete relationship by ID
#[wasm_bindgen]
pub fn registry_delete_relationship(id: &str) -> Result<bool, JsValue> {
    let query = format!(
        r#"?[id] <- [["{}"]] :rm relationships {{id}}"#,
        id.replace('"', r#"\""#)
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

// =============================================================================
// Stats
// =============================================================================

#[derive(Serialize, Deserialize)]
pub struct RegistryStats {
    pub entity_count: usize,
    pub relationship_count: usize,
}

#[wasm_bindgen]
pub fn registry_get_stats() -> Result<JsValue, JsValue> {
    COZO_DB.with(|cell: &RefCell<Option<CozoGraph>>| {
        let db_opt = cell.borrow();
        match db_opt.as_ref() {
            None => Err(JsValue::from_str("CozoDB not initialized")),
            Some(graph) => {
                let entity_count = graph.node_count().unwrap_or(0);
                let relationship_count = graph.edge_count().unwrap_or(0);
                
                let stats = RegistryStats {
                    entity_count,
                    relationship_count,
                };
                
                serde_wasm_bindgen::to_value(&stats)
                    .map_err(|e| JsValue::from_str(&format!("{}", e)))
            }
        }
    })
}
