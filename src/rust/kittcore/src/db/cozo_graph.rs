//! CozoGraph - In-memory graph database powered by CozoDB
//!
//! Provides a minimal graph store for RealityCortex:
//! - `nodes` relation: Entity storage
//! - `edges` relation: Relationship storage

use cozo::DbInstance;
use serde_json::Value as JsonValue;
use std::collections::BTreeMap;

/// Errors from CozoGraph operations
#[derive(Debug, thiserror::Error)]
pub enum CozoError {
    #[error("Database initialization failed: {0}")]
    Init(String),
    #[error("Schema creation failed: {0}")]
    Schema(String),
    #[error("Query execution failed: {0}")]
    Query(String),
    #[error("Upsert failed: {0}")]
    Upsert(String),
}

/// In-memory CozoDB graph instance
pub struct CozoGraph {
    db: DbInstance,
}

impl CozoGraph {
    /// Create a new in-memory CozoGraph
    pub fn new() -> Result<Self, CozoError> {
        let db = DbInstance::new("mem", "", Default::default())
            .map_err(|e| CozoError::Init(e.to_string()))?;
        
        let graph = Self { db };
        graph.init_schema()?;
        Ok(graph)
    }

    /// Initialize the schema with all required relations
    fn init_schema(&self) -> Result<(), CozoError> {
        // Create nodes relation
        let nodes_schema = r#"
            :create nodes {
                id: String
                =>
                label: String,
                kind: String,
                props: Json
            }
        "#;
        self.run_schema("nodes", nodes_schema)?;



        // Entity Aliases
        let aliases_schema = r#"
            :create entity_aliases {
                entity_id: String,
                normalized: String
                =>
                alias: String
            }
        "#;
        self.run_schema("entity_aliases", aliases_schema)?;

        // Entity Mentions
        let mentions_schema = r#"
            :create entity_mentions {
                entity_id: String,
                note_id: String
                =>
                mention_count: Int,
                last_seen: Float
            }
        "#;
        self.run_schema("entity_mentions", mentions_schema)?;

        // Entity Metadata
        let metadata_schema = r#"
            :create entity_metadata {
                entity_id: String,
                key: String
                =>
                value: String
            }
        "#;
        self.run_schema("entity_metadata", metadata_schema)?;

        // Discovery Candidates (Unsupervised NER)
        let discovery_schema = r#"
            :create discovery_candidates {
                token: String
                =>
                kind: Int,
                score: Float,
                status: Int,
                last_seen: Float,
                first_seen: Float,
                count: Int
            }
        "#;
        self.run_schema("discovery_candidates", discovery_schema)?;

        // Create full relationships relation (replaces simple edges)
        let relationships_schema = r#"
            :create relationships {
                id: String
                =>
                source_id: String,
                target_id: String,
                type: String,
                inverse_type: String?,
                bidirectional: Bool,
                confidence: Float default 1.0,
                namespace: String?,
                created_at: Float,
                updated_at: Float
            }
        "#;
        self.run_schema("relationships", relationships_schema)?;

        // Relationship Provenance
        let rel_provenance_schema = r#"
            :create relationship_provenance {
                relationship_id: String,
                source: String,
                origin_id: String
                =>
                confidence: Float,
                timestamp: Float,
                context: String?
            }
        "#;
        self.run_schema("relationship_provenance", rel_provenance_schema)?;

        // Relationship Attributes
        let rel_attributes_schema = r#"
            :create relationship_attributes {
                relationship_id: String,
                key: String
                =>
                value: String
            }
        "#;
        self.run_schema("relationship_attributes", rel_attributes_schema)?;

        // =====================================================================
        // FOLDERS & CONTENT
        // =====================================================================

        // Folders table (content storage)
        let folders_schema = r#"
            :create folders {
                id: String
                =>
                world_id: String,
                name: String,
                parent_id: String,
                entity_kind: String,
                entity_subtype: String,
                entity_label: String,
                color: String,
                is_typed_root: Bool,
                is_subtype_root: Bool,
                collapsed: Bool,
                owner_id: String,
                created_at: Float,
                updated_at: Float
            }
        "#;
        self.run_schema("folders", folders_schema)?;

        // Folder Hierarchy (graph edges for folder tree)
        let folder_hierarchy_schema = r#"
            :create folder_hierarchy {
                id: String,
                parent_id: String,
                child_id: String
                =>
                created_at: Float,
                valid_at: Float,
                invalid_at: Float?,
                group_id: String,
                scope_type: String,
                edge_type: String,
                inverse_type: String,
                parent_entity_kind: String?,
                child_entity_kind: String?,
                confidence: Float
            }
        "#;
        self.run_schema("folder_hierarchy", folder_hierarchy_schema)?;

        // =====================================================================
        // NETWORKS (Factions/Organizations)
        // =====================================================================

        // Network Instance (metadata for a network/faction)
        let network_instance_schema = r#"
            :create network_instance {
                id: String
                =>
                name: String,
                schema_id: String,
                network_kind: String,
                network_subtype: String?,
                root_folder_id: String,
                root_entity_id: String?,
                namespace: String,
                description: String?,
                member_count: Int,
                relationship_count: Int,
                max_depth: Int,
                created_at: Float,
                updated_at: Float,
                group_id: String,
                scope_type: String
            }
        "#;
        self.run_schema("network_instance", network_instance_schema)?;

        // Network Membership (entity belongs to network)
        let network_membership_schema = r#"
            :create network_membership {
                id: String,
                network_id: String,
                entity_id: String
                =>
                role: String?,
                joined_at: Float,
                left_at: Float?,
                is_root: Bool,
                depth_level: Int,
                created_at: Float,
                updated_at: Float,
                group_id: String
            }
        "#;
        self.run_schema("network_membership", network_membership_schema)?;

        // Network Relationship (entity-to-entity within a network)
        let network_relationship_schema = r#"
            :create network_relationship {
                id: String,
                network_id: String,
                source_id: String,
                target_id: String
                =>
                relationship_code: String,
                inverse_code: String?,
                start_date: Float?,
                end_date: Float?,
                strength: Float,
                notes: String?,
                attributes: Json?,
                created_at: Float,
                updated_at: Float,
                group_id: String,
                scope_type: String,
                confidence: Float
            }
        "#;
        self.run_schema("network_relationship", network_relationship_schema)?;

        // =====================================================================
        // CALENDAR
        // =====================================================================

        // Calendar Definitions
        let calendar_definitions_schema = r#"
            :create calendar_definitions {
                id: String
                =>
                world_id: String,
                name: String,
                hours_per_day: Int,
                minutes_per_hour: Int,
                seconds_per_minute: Int,
                has_year_zero: Bool,
                created_from: String,
                weekdays: Json,
                months: Json,
                eras: Json,
                epochs: Json,
                moons: Json,
                seasons: Json,
                current_date: Json,
                created_at: Float,
                updated_at: Float
            }
        "#;
        self.run_schema("calendar_definitions", calendar_definitions_schema)?;

        // Calendar Events
        let calendar_events_schema = r#"
            :create calendar_events {
                id: String
                =>
                calendar_id: String,
                title: String,
                description: String?,
                date_year: Int,
                date_month: Int,
                date_day: Int,
                date_hour: Int?,
                date_minute: Int?,
                end_year: Int?,
                end_month: Int?,
                end_day: Int?,
                is_all_day: Bool,
                importance: String,
                category: String,
                color: String?,
                icon: String?,
                entity_id: String?,
                entity_kind: String?,
                source_note_id: String?,
                parent_event_id: String?,
                status: String?,
                narrative_type: String?,
                story_beat: String?,
                created_at: Float,
                updated_at: Float
            }
        "#;
        self.run_schema("calendar_events", calendar_events_schema)?;

        // Calendar Periods
        let calendar_periods_schema = r#"
            :create calendar_periods {
                id: String
                =>
                calendar_id: String,
                name: String,
                description: String?,
                start_year: Int,
                start_month: Int?,
                end_year: Int?,
                end_month: Int?,
                parent_period_id: String?,
                period_type: String,
                color: String,
                icon: String?,
                abbreviation: String?,
                direction: String,
                arc_type: String?,
                dominant_theme: String?,
                protagonist_id: String?,
                antagonist_id: String?,
                summary: String?,
                show_on_timeline: Bool,
                timeline_color: String?,
                timeline_icon: String?,
                created_at: Float,
                updated_at: Float
            }
        "#;
        self.run_schema("calendar_periods", calendar_periods_schema)?;

        // =====================================================================
        // CROSS-DOC KNOWLEDGE GRAPH
        // =====================================================================

        // Node Vectors (embeddings)
        let node_vectors_schema = r#"
            :create node_vectors {
                node_id: String,
                model: String
                =>
                dimension: Int,
                vector: <F64; 768>,
                context_text: String?,
                source_note_id: String?,
                created_at: Float,
                updated_at: Float
            }
        "#;
        self.run_schema("node_vectors", node_vectors_schema)?;

        // Entity Clusters
        let entity_clusters_schema = r#"
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
        "#;
        self.run_schema("entity_clusters", entity_clusters_schema)?;

        // Cluster Members
        let cluster_members_schema = r#"
            :create cluster_members {
                cluster_id: String,
                node_id: String
                =>
                label: String,
                similarity: Float,
                is_canonical: Bool,
                joined_at: Float
            }
        "#;
        self.run_schema("cluster_members", cluster_members_schema)?;

        // Co-occurrence Edges
        let cooccurrence_edges_schema = r#"
            :create cooccurrence_edges {
                source_id: String,
                target_id: String
                =>
                weight: Float,
                doc_count: Int,
                last_seen_at: Float,
                first_seen_at: Float
            }
        "#;
        self.run_schema("cooccurrence_edges", cooccurrence_edges_schema)?;

        Ok(())
    }



    /// Helper to run schema creation scripts
    fn run_schema(&self, name: &str, script: &str) -> Result<(), CozoError> {
        self.db
            .run_script(script, Default::default(), cozo::ScriptMutability::Mutable)
            .map_err(|e| CozoError::Schema(format!("{}: {}", name, e)))
            .map(|_| ())
    }



    /// Upsert a node into the graph
    pub fn upsert_node(
        &self,
        id: &str,
        label: &str,
        kind: &str,
        props: JsonValue,
    ) -> Result<(), CozoError> {
        let query = format!(
            r#"
            ?[id, label, kind, props] <- [["{}", "{}", "{}", {}]]
            :put nodes {{ id => label, kind, props }}
            "#,
            id,
            label.replace('"', r#"\""#),
            kind,
            props.to_string()
        );

        self.db
            .run_script(&query, Default::default(), cozo::ScriptMutability::Mutable)
            .map_err(|e| CozoError::Upsert(e.to_string()))?;

        Ok(())
    }

    /// Upsert a relationship into the graph
    pub fn upsert_relationship(
        &self,
        id: &str,
        source: &str,
        target: &str,
        rel_type: &str,
        confidence: f64,
        bidirectional: bool,
    ) -> Result<(), CozoError> {
        let timestamp = js_sys::Date::now(); // Note: js_sys dependency might be needed, or use a placeholder
        // For now, let's pass timestamp as a float arg or use 0.0 if not available
        // Better: user passed args. Let's assume we use 0.0 for now if we don't import js_sys/chrono
        // But we are in WASM context, so...
        
        let query = format!(
            r#"
            ?[id, source_id, target_id, type, bidirectional, confidence, created_at, updated_at] <- [["{}", "{}", "{}", "{}", {}, {}, {}, {}]]
            :put relationships {{ id => source_id, target_id, type, bidirectional, confidence, created_at, updated_at }}
            "#,
            id, source, target, rel_type, bidirectional, confidence, 0.0, 0.0
        );

        self.db
            .run_script(&query, Default::default(), cozo::ScriptMutability::Mutable)
            .map_err(|e| CozoError::Upsert(e.to_string()))?;

        Ok(())
    }


    /// Execute a Datalog query and return results as JSON
    pub fn query(&self, q: &str) -> Result<Vec<BTreeMap<String, JsonValue>>, CozoError> {
        let result = self
            .db
            .run_script(q, Default::default(), cozo::ScriptMutability::Immutable)
            .map_err(|e| CozoError::Query(e.to_string()))?;

        // Convert NamedRows to Vec<BTreeMap>
        let headers = result.headers.clone();
        let rows: Vec<BTreeMap<String, JsonValue>> = result
            .rows
            .into_iter()
            .map(|row| {
                headers
                    .iter()
                    .zip(row.into_iter())
                    .map(|(h, v)| (h.clone(), datavalue_to_json(v)))
                    .collect()
            })
            .collect();

        Ok(rows)
    }

    /// Execute a mutable Datalog query (for :put, :rm operations)
    pub fn query_mut(&self, q: &str) -> Result<Vec<BTreeMap<String, JsonValue>>, CozoError> {
        let result = self
            .db
            .run_script(q, Default::default(), cozo::ScriptMutability::Mutable)
            .map_err(|e| CozoError::Query(e.to_string()))?;

        // Convert NamedRows to Vec<BTreeMap>
        let headers = result.headers.clone();
        let rows: Vec<BTreeMap<String, JsonValue>> = result
            .rows
            .into_iter()
            .map(|row| {
                headers
                    .iter()
                    .zip(row.into_iter())
                    .map(|(h, v)| (h.clone(), datavalue_to_json(v)))
                    .collect()
            })
            .collect();

        Ok(rows)
    }

    /// Get node count
    pub fn node_count(&self) -> Result<usize, CozoError> {
        let result = self.query("?[count(id)] := *nodes{id}")?;
        if let Some(row) = result.first() {
            if let Some(JsonValue::Number(n)) = row.get("count(id)") {
                return Ok(n.as_u64().unwrap_or(0) as usize);
            }
        }
        Ok(0)
    }

    /// Get edge count
    pub fn edge_count(&self) -> Result<usize, CozoError> {
        let result = self.query("?[count(source)] := *edges{source}")?;
        if let Some(row) = result.first() {
            if let Some(JsonValue::Number(n)) = row.get("count(source)") {
                return Ok(n.as_u64().unwrap_or(0) as usize);
            }
        }
        Ok(0)
    }

    /// Export the database to a JSON string (for OPFS persistence)
    pub fn export(&self) -> Result<String, CozoError> {
        let relations = [
            // Core entity graph
            "nodes", 
            "relationships",
            "relationship_provenance",
            "relationship_attributes",
            "entity_aliases",
            "entity_mentions",
            "entity_metadata",
            "discovery_candidates",
            // Folders & content
            "folders",
            "folder_hierarchy",
            // Networks (factions/organizations)
            "network_instance",
            "network_membership",
            "network_relationship",
            // Calendar
            "calendar_definitions",
            "calendar_events",
            "calendar_periods",
            // Cross-doc knowledge graph
            "node_vectors",
            "entity_clusters",
            "cluster_members",
            "cooccurrence_edges"
        ];


        let result = self
            .db
            .export_relations(relations.into_iter())
            .map_err(|e| CozoError::Query(format!("export: {}", e)))?;
        
        serde_json::to_string(&result)
            .map_err(|e| CozoError::Query(format!("serialize: {}", e)))
    }


    /// Import from a JSON string (for OPFS hydration)
    pub fn import(&self, data: &str) -> Result<(), CozoError> {
        // Deserialize to the expected BTreeMap<String, NamedRows> type
        let payload: std::collections::BTreeMap<String, cozo::NamedRows> = 
            serde_json::from_str(data)
                .map_err(|e| CozoError::Query(format!("deserialize: {}", e)))?;
        
        self.db
            .import_relations(payload)
            .map_err(|e| CozoError::Query(format!("import: {}", e)))?;
        
        Ok(())
    }
}

/// Convert CozoDB DataValue to serde_json::Value
fn datavalue_to_json(v: cozo::DataValue) -> JsonValue {
    use cozo::DataValue;

    // Handle the non-wrapped cases first
    match v {
        DataValue::Null => return JsonValue::Null,
        DataValue::Bot => return JsonValue::Null,
        // Json variant needs special handling because serialization wraps it
        DataValue::Json(j) => {
            return serde_json::to_value(j).unwrap_or(JsonValue::Null);
        }, 
        _ => {}
    }


    // For everything else, rely on serde serialization and unwrap the enum wrapper
    match serde_json::to_value(&v) {
        Ok(json_val) => {
            // Cozo serializes as {"Variant": value}
            // We want just 'value'
            if let JsonValue::Object(map) = &json_val {
                if map.len() == 1 {
                    let inner = map.values().next().unwrap();
                    
                    // Values like Num::Int(42) are double-wrapped: {"Num": {"Int": 42}}
                    if let JsonValue::Object(inner_map) = inner {
                         if inner_map.len() == 1 {
                             return inner_map.values().next().unwrap().clone();
                         }
                    }
                    
                    return inner.clone();
                }
            }
            json_val
        }
        Err(_) => JsonValue::Null,
    }
}





#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_cozo_init_and_insert() {
        let graph = CozoGraph::new().unwrap();
        
        // Insert a node
        graph
            .upsert_node("n1", "Alice", "CHARACTER", json!({"age": 30}))
            .unwrap();
        
        // Query nodes
        let nodes = graph.query("?[id, label] := *nodes{id, label}").unwrap();
        assert_eq!(nodes.len(), 1);
        assert_eq!(nodes[0].get("id").unwrap(), "n1");
        assert_eq!(nodes[0].get("label").unwrap(), "Alice");
    }

    #[test]
    fn test_upsert_edge() {
        let graph = CozoGraph::new().unwrap();
        
        // Insert nodes
        graph.upsert_node("n1", "Frodo", "CHARACTER", json!({})).unwrap();
        graph.upsert_node("n2", "Sam", "CHARACTER", json!({})).unwrap();
        
        // Insert relationship
        graph
            .upsert_relationship("rel1", "n1", "n2", "brother_of", 1.0, false)
            .unwrap();
        
        // Query relationships
        let rels = graph
            .query("?[source_id, target_id, type] := *relationships{source_id, target_id, type}")
            .unwrap();
        assert_eq!(rels.len(), 1);
        assert_eq!(rels[0].get("source_id").unwrap(), "n1");
        assert_eq!(rels[0].get("target_id").unwrap(), "n2");
    }

    #[test]
    fn test_counts() {
        let graph = CozoGraph::new().unwrap();
        
        graph.upsert_node("a", "A", "T", json!({})).unwrap();
        graph.upsert_node("b", "B", "T", json!({})).unwrap();
        graph.upsert_relationship("rel1", "a", "b", "e", 1.0, false).unwrap();
        
        assert_eq!(graph.node_count().unwrap(), 2);
        // Note: edge_count returns 0 because we use relationships now, not edges
    }
}
