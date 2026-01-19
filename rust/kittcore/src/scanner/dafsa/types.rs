use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum EntityKind {
    CHARACTER,
    LOCATION,
    NPC,
    ITEM,
    FACTION,
    ORGANIZATION,
    EVENT,
    CONCEPT,
    CUSTOM,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisteredEntity {
    pub id: String,
    pub label: String,
    pub kind: EntityKind,
    #[serde(default)]
    pub aliases: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntityInfo {
    pub id: String,
    pub label: String,
    pub kind: EntityKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecorationSpan {
    #[serde(rename = "type")]
    pub span_type: String, // "entity_implicit"
    pub from: usize,
    pub to: usize,
    pub label: String,
    #[serde(rename = "matchedText")]
    pub matched_text: String,
    pub kind: EntityKind,

    pub resolved: bool,
    #[serde(rename = "entityId")]
    pub entity_id: Option<String>,

    #[serde(rename = "candidateIds")]
    pub candidate_ids: Option<Vec<String>>,
    #[serde(rename = "candidateLabels")]
    pub candidate_labels: Option<Vec<String>>,
}
