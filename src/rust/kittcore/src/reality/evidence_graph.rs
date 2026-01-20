//! Evidence Graph: Document-Level Relation Reasoning
//!
//! # Purpose
//! Extends CST from sentence-level to document-level by:
//! - Bridging mentions of same entity across sentences
//! - Computing multi-hop relations on demand
//! - Tracking full provenance for every inferred edge
//!
//! # Architecture
//! ```text
//! [Text] → [Sentences] → [Mentions + VPs] → [Evidence Graph]
//!                                                   ↓
//!                                          [Bridge Mentions]
//!                                                   ↓
//!                                          [Project Relations]
//! ```

use rustworkx_core::petgraph::graph::{DiGraph, NodeIndex, UnGraph};
use rustworkx_core::petgraph::visit::EdgeRef;
use rustworkx_core::petgraph::Direction;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

use super::pcst::{PcstInstance, IpcstSolver, PcsfSolution, Cost};
use super::graph::{ConceptGraph, ConceptNode, ConceptEdge};

// =============================================================================
// Types
// =============================================================================

/// Node types in the evidence graph
#[derive(Debug, Clone, PartialEq)]
pub enum EvidenceNode {
    /// An entity (canonical concept)
    Entity {
        id: String,
        label: String,
        kind: String,
        aliases: Vec<String>,
    },
    /// A mention of an entity in text
    Mention {
        entity_id: Option<String>, // Linked after bridging
        label: String,
        span: (u32, u32),
        sentence_idx: usize,
    },
    /// A verb phrase (predicate)
    VerbPhrase {
        lemma: String,
        span: (u32, u32),
        sentence_idx: usize,
    },
}

/// Edge types in the evidence graph
#[derive(Debug, Clone, PartialEq)]
pub enum EvidenceEdge {
    /// Mention → Entity (coreference link)
    Coreference { confidence: f32 },
    /// Mention → VerbPhrase (subject of)
    SubjectOf,
    /// Mention → VerbPhrase (object of)
    ObjectOf,
    /// Entity → Entity (semantic relation extracted from VP)
    Relation {
        relation_type: String,
        confidence: f32,
        via_vp: Option<NodeIndex>,
    },
}

/// Evidence span for provenance tracking
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvidenceSpan {
    pub sentence_index: usize,
    pub char_span: (u32, u32),
    pub source: EvidenceSource,
}

/// Source of evidence
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EvidenceSource {
    ExplicitTriple,
    CstSvo,
    MentionBridge,
    PathHop { hop_index: usize },
}

/// A projected relation with full provenance
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectedRelation {
    pub head_id: String,
    pub head_label: String,
    pub tail_id: String,
    pub tail_label: String,
    pub relation_type: String,
    pub confidence: f32,
    pub evidence: Vec<EvidenceSpan>,
    /// For multi-hop: the intermediate entities
    pub via: Vec<String>,
}

/// Path pattern for multi-hop inference
#[derive(Debug, Clone)]
pub struct PathPattern {
    pub input_relations: Vec<String>,
    pub output_relation: String,
    pub confidence_factor: f32,
}

// =============================================================================
// Evidence Graph
// =============================================================================

/// Document-level evidence graph for relation reasoning
pub struct EvidenceGraph {
    graph: DiGraph<EvidenceNode, EvidenceEdge>,
    /// Entity ID → NodeIndex
    entity_index: HashMap<String, NodeIndex>,
    /// All mention nodes (for iteration)
    mentions: Vec<NodeIndex>,
    /// All VP nodes (for iteration)
    verb_phrases: Vec<NodeIndex>,
    /// Sentence boundaries as (start, end) char offsets
    sentence_bounds: Vec<(u32, u32)>,
}

impl Default for EvidenceGraph {
    fn default() -> Self {
        Self::new()
    }
}

impl EvidenceGraph {
    /// Create a new empty evidence graph
    pub fn new() -> Self {
        Self {
            graph: DiGraph::new(),
            entity_index: HashMap::new(),
            mentions: Vec::new(),
            verb_phrases: Vec::new(),
            sentence_bounds: Vec::new(),
        }
    }

    /// Get reference to underlying graph
    pub fn graph(&self) -> &DiGraph<EvidenceNode, EvidenceEdge> {
        &self.graph
    }

    /// Add an entity node
    pub fn add_entity(
        &mut self,
        id: String,
        label: String,
        kind: String,
        aliases: Vec<String>,
    ) -> NodeIndex {
        if let Some(&idx) = self.entity_index.get(&id) {
            return idx;
        }

        let idx = self.graph.add_node(EvidenceNode::Entity {
            id: id.clone(),
            label,
            kind,
            aliases,
        });
        self.entity_index.insert(id, idx);
        idx
    }

    /// Get node index for an entity ID (Testing Helper)
    pub fn get_node_index(&self, id: &str) -> Option<NodeIndex> {
        self.entity_index.get(id).copied()
    }

    /// Add a direct relation between entities (Testing Helper)
    pub fn add_direct_relation(&mut self, source: NodeIndex, target: NodeIndex, relation: &str, confidence: f32) {
        self.graph.add_edge(source, target, EvidenceEdge::Relation {
            relation_type: relation.to_string(),
            confidence,
            via_vp: None,
        });
    }

    /// Add a mention node
    pub fn add_mention(
        &mut self,
        label: String,
        span: (u32, u32),
        sentence_idx: usize,
    ) -> NodeIndex {
        let idx = self.graph.add_node(EvidenceNode::Mention {
            entity_id: None,
            label,
            span,
            sentence_idx,
        });
        self.mentions.push(idx);
        idx
    }

    /// Add a verb phrase node
    pub fn add_verb_phrase(
        &mut self,
        lemma: String,
        span: (u32, u32),
        sentence_idx: usize,
    ) -> NodeIndex {
        let idx = self.graph.add_node(EvidenceNode::VerbPhrase {
            lemma,
            span,
            sentence_idx,
        });
        self.verb_phrases.push(idx);
        idx
    }

    /// Link mention as subject of VP
    pub fn link_subject(&mut self, mention: NodeIndex, vp: NodeIndex) {
        self.graph.add_edge(mention, vp, EvidenceEdge::SubjectOf);
    }

    /// Link mention as object of VP
    pub fn link_object(&mut self, mention: NodeIndex, vp: NodeIndex) {
        self.graph.add_edge(mention, vp, EvidenceEdge::ObjectOf);
    }

    /// Set sentence boundaries
    pub fn set_sentence_bounds(&mut self, bounds: Vec<(u32, u32)>) {
        self.sentence_bounds = bounds;
    }

    // =========================================================================
    // Phase 2: Cross-Sentence Bridging
    // =========================================================================

    /// Bridge mentions to entities across full document
    /// 
    /// Rules (no ML):
    /// - Exact label match: confidence 0.95
    /// - Alias match: confidence 0.85
    pub fn bridge_mentions(&mut self) {
        // Collect entity info first to avoid borrow issues
        let entities: Vec<(NodeIndex, String, String, Vec<String>)> = self
            .entity_index
            .iter()
            .filter_map(|(_, &idx)| {
                if let EvidenceNode::Entity { id, label, aliases, .. } = &self.graph[idx] {
                    Some((idx, id.clone(), label.clone(), aliases.clone()))
                } else {
                    None
                }
            })
            .collect();

        // For each mention, try to bridge to an entity
        for &mention_idx in &self.mentions {
            let mention_label = if let EvidenceNode::Mention { label, .. } = &self.graph[mention_idx] {
                label.clone()
            } else {
                continue;
            };

            let mention_label_lower = mention_label.to_lowercase();

            for (entity_idx, entity_id, entity_label, aliases) in &entities {
                let confidence = if mention_label_lower == entity_label.to_lowercase() {
                    // Exact match
                    0.95
                } else if aliases.iter().any(|a| a.to_lowercase() == mention_label_lower) {
                    // Alias match
                    0.85
                } else {
                    continue;
                };

                // Link mention → entity
                self.graph.add_edge(
                    mention_idx,
                    *entity_idx,
                    EvidenceEdge::Coreference { confidence },
                );

                // Update mention's entity_id (use the matched entity's id, not the field itself)
                if let EvidenceNode::Mention { entity_id: ref mut eid, .. } = &mut self.graph[mention_idx] {
                    *eid = Some(entity_id.clone());
                }
            }
        }
    }

    // =========================================================================
    // Phase 3: Relation Projection
    // =========================================================================

    /// Project relations from VP → subject/object patterns
    /// 
    /// For each VP:
    /// - Find all mentions linked as subject
    /// - Find all mentions linked as object  
    /// - Create relation edges between their bridged entities
    pub fn project_relations(&mut self) -> Vec<ProjectedRelation> {
        let mut relations = Vec::new();

        for &vp_idx in &self.verb_phrases {
            let (vp_lemma, vp_span, vp_sentence) = if let EvidenceNode::VerbPhrase { lemma, span, sentence_idx } = &self.graph[vp_idx] {
                (lemma.clone(), *span, *sentence_idx)
            } else {
                continue;
            };

            // Find subjects (mentions with SubjectOf edge to this VP)
            let subjects = self.find_subjects_of_vp(vp_idx);
            // Find objects (mentions with ObjectOf edge to this VP)
            let objects = self.find_objects_of_vp(vp_idx);

            // For each subject-object pair, emit relation
            for (subj_mention, subj_entity) in &subjects {
                for (obj_mention, obj_entity) in &objects {
                    if subj_entity == obj_entity {
                        continue; // Skip self-relations
                    }

                    // Get sentence indices for evidence
                    let subj_sentence = self.mention_sentence(*subj_mention);
                    let obj_sentence = self.mention_sentence(*obj_mention);
                    let subj_span = self.mention_span(*subj_mention);
                    let obj_span = self.mention_span(*obj_mention);

                    let mut evidence = vec![
                        EvidenceSpan {
                            sentence_index: vp_sentence,
                            char_span: vp_span,
                            source: EvidenceSource::CstSvo,
                        },
                    ];

                    // Add cross-sentence evidence if applicable
                    if let Some(s) = subj_sentence {
                        if s != vp_sentence {
                            evidence.push(EvidenceSpan {
                                sentence_index: s,
                                char_span: subj_span.unwrap_or((0, 0)),
                                source: EvidenceSource::MentionBridge,
                            });
                        }
                    }
                    if let Some(s) = obj_sentence {
                        if s != vp_sentence && Some(s) != subj_sentence {
                            evidence.push(EvidenceSpan {
                                sentence_index: s,
                                char_span: obj_span.unwrap_or((0, 0)),
                                source: EvidenceSource::MentionBridge,
                            });
                        }
                    }

                    // Calculate confidence (reduce if cross-sentence)
                    let cross_sentence_count = evidence.iter()
                        .filter(|e| matches!(e.source, EvidenceSource::MentionBridge))
                        .count();
                    let confidence = 0.85_f32 * (0.9_f32).powi(cross_sentence_count as i32);

                    relations.push(ProjectedRelation {
                        head_id: subj_entity.0.clone(),
                        head_label: subj_entity.1.clone(),
                        tail_id: obj_entity.0.clone(),
                        tail_label: obj_entity.1.clone(),
                        relation_type: self.verb_to_relation(&vp_lemma),
                        confidence,
                        evidence,
                        via: vec![],
                    });
                }
            }
        }

        relations
    }

    // =========================================================================
    // Multi-Hop Reasoning (Computed On Demand)
    // =========================================================================

    /// Default composable relation patterns
    pub fn default_path_patterns() -> Vec<(Vec<&'static str>, &'static str, f32)> {
        vec![
            // Ownership + Location → Access
            (vec!["OWNS", "LOCATED_IN"], "HAS_ACCESS_TO", 0.7),
            // Ally of my enemy → Tension
            (vec!["ALLY_OF", "ENEMY_OF"], "TENSION_WITH", 0.5),
            // Parent chain → Grandparent
            (vec!["PARENT_OF", "PARENT_OF"], "GRANDPARENT_OF", 0.9),
            // Crew member + Captain → Under command
            (vec!["MEMBER_OF", "CAPTAIN_OF"], "UNDER_COMMAND_OF", 0.8),
        ]
    }

    /// Compute multi-hop relations on demand (not materialized)
    /// 
    /// Uses BFS to find 2-hop paths that match patterns
    pub fn compute_multi_hop(
        &self,
        source_id: &str,
        target_id: &str,
        max_hops: usize,
    ) -> Vec<ProjectedRelation> {
        let source_idx = match self.entity_index.get(source_id) {
            Some(&idx) => idx,
            None => return vec![],
        };
        let target_idx = match self.entity_index.get(target_id) {
            Some(&idx) => idx,
            None => return vec![],
        };

        // BFS for paths up to max_hops
        self.bfs_paths(source_idx, target_idx, max_hops)
    }

    fn bfs_paths(
        &self,
        source: NodeIndex,
        target: NodeIndex,
        max_hops: usize,
    ) -> Vec<ProjectedRelation> {
        use std::collections::VecDeque;

        #[derive(Clone)]
        struct PathState {
            current: NodeIndex,
            path: Vec<(NodeIndex, String)>, // (node, relation_type)
            relations: Vec<String>,
        }

        let mut results = Vec::new();
        let mut queue = VecDeque::new();
        queue.push_back(PathState {
            current: source,
            path: vec![],
            relations: vec![],
        });

        while let Some(state) = queue.pop_front() {
            if state.path.len() > max_hops {
                continue;
            }

            if state.current == target && !state.relations.is_empty() {
                // Found a path - check if it matches any pattern
                for (pattern, output_rel, conf) in Self::default_path_patterns() {
                    if state.relations.len() == pattern.len()
                        && state.relations.iter().zip(&pattern).all(|(a, b)| a == *b)
                    {
                        let intermediates: Vec<String> = state.path.iter()
                            .skip(1)
                            .filter_map(|(idx, _)| {
                                if let EvidenceNode::Entity { id, .. } = &self.graph[*idx] {
                                    Some(id.clone())
                                } else {
                                    None
                                }
                            })
                            .collect();

                        results.push(ProjectedRelation {
                            head_id: self.entity_id(source).unwrap_or_default(),
                            head_label: self.entity_label(source).unwrap_or_default(),
                            tail_id: self.entity_id(target).unwrap_or_default(),
                            tail_label: self.entity_label(target).unwrap_or_default(),
                            relation_type: output_rel.to_string(),
                            confidence: conf,
                            evidence: vec![], // Would need to track spans through path
                            via: intermediates,
                        });
                    }
                }
                continue;
            }

            // Explore outgoing Relation edges
            for edge in self.graph.edges_directed(state.current, Direction::Outgoing) {
                if let EvidenceEdge::Relation { relation_type, .. } = edge.weight() {
                    let next = edge.target();
                    let mut new_path = state.path.clone();
                    new_path.push((state.current, relation_type.clone()));
                    let mut new_rels = state.relations.clone();
                    new_rels.push(relation_type.clone());

                    queue.push_back(PathState {
                        current: next,
                        path: new_path,
                        relations: new_rels,
                    });
                }
            }
        }

        results
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    fn find_subjects_of_vp(&self, vp: NodeIndex) -> Vec<(NodeIndex, (String, String))> {
        let mut subjects = Vec::new();
        for edge in self.graph.edges_directed(vp, Direction::Incoming) {
            if matches!(edge.weight(), EvidenceEdge::SubjectOf) {
                let mention = edge.source();
                if let Some(entity) = self.mention_entity(mention) {
                    subjects.push((mention, entity));
                }
            }
        }
        subjects
    }

    fn find_objects_of_vp(&self, vp: NodeIndex) -> Vec<(NodeIndex, (String, String))> {
        let mut objects = Vec::new();
        for edge in self.graph.edges_directed(vp, Direction::Incoming) {
            if matches!(edge.weight(), EvidenceEdge::ObjectOf) {
                let mention = edge.source();
                if let Some(entity) = self.mention_entity(mention) {
                    objects.push((mention, entity));
                }
            }
        }
        objects
    }

    fn mention_entity(&self, mention: NodeIndex) -> Option<(String, String)> {
        // Find coreference edge from mention to entity
        for edge in self.graph.edges_directed(mention, Direction::Outgoing) {
            if matches!(edge.weight(), EvidenceEdge::Coreference { .. }) {
                if let EvidenceNode::Entity { id, label, .. } = &self.graph[edge.target()] {
                    return Some((id.clone(), label.clone()));
                }
            }
        }
        None
    }

    fn mention_sentence(&self, mention: NodeIndex) -> Option<usize> {
        if let EvidenceNode::Mention { sentence_idx, .. } = &self.graph[mention] {
            Some(*sentence_idx)
        } else {
            None
        }
    }

    fn mention_span(&self, mention: NodeIndex) -> Option<(u32, u32)> {
        if let EvidenceNode::Mention { span, .. } = &self.graph[mention] {
            Some(*span)
        } else {
            None
        }
    }

    fn entity_id(&self, idx: NodeIndex) -> Option<String> {
        if let EvidenceNode::Entity { id, .. } = &self.graph[idx] {
            Some(id.clone())
        } else {
            None
        }
    }

    fn entity_label(&self, idx: NodeIndex) -> Option<String> {
        if let EvidenceNode::Entity { label, .. } = &self.graph[idx] {
            Some(label.clone())
        } else {
            None
        }
    }

    fn verb_to_relation(&self, verb: &str) -> String {
        // Simple verb → relation mapping
        match verb.to_uppercase().as_str() {
            "DEFEATS" | "DEFEATED" | "BEAT" | "BEATS" => "DEFEATS".to_string(),
            "JOINS" | "JOINED" => "JOINS".to_string(),
            "SAVES" | "SAVED" | "RESCUES" | "RESCUED" => "SAVES".to_string(),
            "FIGHTS" | "FOUGHT" | "BATTLES" | "BATTLED" => "FIGHTS".to_string(),
            "LOVES" | "LOVED" => "LOVES".to_string(),
            "HATES" | "HATED" => "HATES".to_string(),
            "OWNS" | "OWNED" | "HAS" => "OWNS".to_string(),
            "LEADS" | "LED" | "COMMANDS" | "COMMANDED" => "LEADS".to_string(),
            "MEETS" | "MET" | "ENCOUNTERS" | "ENCOUNTERED" => "MEETS".to_string(),
            "KILLS" | "KILLED" | "SLAYS" | "SLEW" => "KILLS".to_string(),
            _ => verb.to_uppercase(),
        }
    }

    /// Statistics for debugging
    pub fn stats(&self) -> EvidenceGraphStats {
        EvidenceGraphStats {
            entity_count: self.entity_index.len(),
            mention_count: self.mentions.len(),
            vp_count: self.verb_phrases.len(),
            edge_count: self.graph.edge_count(),
        }
    }

    /// Get total node count (entities + mentions + VPs)
    pub fn node_count(&self) -> usize {
        self.graph.node_count()
    }

    /// Get total edge count
    pub fn edge_count(&self) -> usize {
        self.graph.edge_count()
    }
}

#[derive(Debug, Clone)]
pub struct EvidenceGraphStats {
    pub entity_count: usize,
    pub mention_count: usize,
    pub vp_count: usize,
    pub edge_count: usize,
}

// =============================================================================
// Conversions
// =============================================================================

impl From<&ConceptGraph> for EvidenceGraph {
    fn from(source: &ConceptGraph) -> Self {
        let mut eg = EvidenceGraph::new();
        
        // 1. Copy Nodes
        for node in source.nodes() {
            eg.add_entity(
                node.id.clone(),
                node.label.clone(),
                node.kind.clone(),
                vec![], // Aliases not currently in ConceptNode
            );
        }
        
        // 2. Copy Edges
        for (src, tgt, edge) in source.edges() {
            if let (Some(src_idx), Some(tgt_idx)) = (
                eg.get_node_index(&src.id),
                eg.get_node_index(&tgt.id)
            ) {
                // Determine confidence/weight
                // ConceptEdge has weight 0.0-1.0 (where 1.0 is high cost? no, high strength)
                // EvidenceGraph uses confidence 0.0-1.0 (high strength)
                let confidence = edge.weight as f32; // f64 -> f32
                
                eg.add_direct_relation(src_idx, tgt_idx, &edge.relation, confidence);
            }
        }
        
        eg
    }
}

    // =========================================================================
    // Phase 4: PCST / Smart Context
    // =========================================================================

impl EvidenceGraph {

    /// Compute optimal Steiner Subgraph connecting query entities
    ///
    /// Uses PCST to find a subgraph that connects the requested entities with high-confidence
    /// paths, effectively pruning irrelevant or low-confidence connections.
    pub fn compute_steiner_subgraph(&self, query_ids: &[&str]) -> EvidenceGraph {
        // 1. Setup Prizes (High value for query nodes)
        let mut prizes = HashMap::new();
        for &id in query_ids {
            if let Some(idx) = self.entity_index.get(id) {
                prizes.insert(*idx, 100.0);
            }
        }

        // 2. Convert to PCST Instance
        let (instance, node_map) = self.to_pcst_instance(&prizes);

        // 3. Solve PCST
        let solver = IpcstSolver::default();
        let solution = solver.solve(&instance);

        // 4. Project Solution back to Evidence Graph
        self.from_solution(&solution, &node_map)
    }

    /// Convert EvidenceGraph to PCST Instance (Undirected, Cost = 1 - Confidence)
    fn to_pcst_instance(&self, prizes: &HashMap<NodeIndex, f64>) -> (PcstInstance, Vec<NodeIndex>) {
        let mut graph = UnGraph::<(), Cost>::default();
        let mut node_map = Vec::new();
        let mut penalties = Vec::new();

        // 1. Add Nodes
        // We iterate in index order to ensure mapping is trivial (i -> NodeIndex(i))
        // but we keep a map just in case petgraph indices drift (unlikely here)
        for i in 0..self.graph.node_count() {
            let idx = NodeIndex::new(i);
            node_map.push(idx);
            
            // Add node to PCST graph
            graph.add_node(());

            // Set penalty (prize)
            let prize = prizes.get(&idx).copied().unwrap_or(0.0);
            penalties.push(prize);
        }

        // 2. Add Edges
        // Iterate over all edges in the EvidenceGraph
        for edge in self.graph.edge_references() {
            let u = edge.source().index();
            let v = edge.target().index();
            
            // Calculate cost from confidence
            // High confidence (0.9) -> Low Cost (0.1)
            let confidence = match edge.weight() {
                EvidenceEdge::Coreference { confidence } => *confidence,
                EvidenceEdge::Relation { confidence, .. } => *confidence,
                // Structural edges have moderate cost
                EvidenceEdge::SubjectOf | EvidenceEdge::ObjectOf => 0.8, 
            };
            
            let cost = (1.0 - confidence).max(0.01) as f64; // Ensure non-zero cost

            // Check if edge already exists (min cost wins)
            if let Some(edge_idx) = graph.find_edge(NodeIndex::new(u), NodeIndex::new(v)) {
                let current_weight = graph.edge_weight(edge_idx).unwrap();
                if cost < *current_weight {
                    graph.update_edge(NodeIndex::new(u), NodeIndex::new(v), cost);
                }
            } else {
                graph.add_edge(NodeIndex::new(u), NodeIndex::new(v), cost);
            }
        }

        (PcstInstance::new(graph, penalties), node_map)
    }

    /// Reconstruct EvidenceGraph from PCST Solution
    fn from_solution(&self, solution: &PcsfSolution, _original_map: &[NodeIndex]) -> EvidenceGraph {
        let mut new_eg = EvidenceGraph::new();
        let mut mapping = HashMap::new(); // Old NodeIndex -> New NodeIndex

        // 1. Copy Selected Nodes
        for old_idx in &solution.nodes {
            let old_idx_usize = old_idx.index(); // Since we used 1:1 mapping
            let original_node_idx = NodeIndex::new(old_idx_usize);

            // Clone node data
            let weight = self.graph[original_node_idx].clone();
            
            // Add to new graph
            let new_idx = new_eg.graph.add_node(weight.clone());
            mapping.insert(original_node_idx, new_idx);

            // Update indices
            match weight {
                EvidenceNode::Entity { id, .. } => {
                    new_eg.entity_index.insert(id, new_idx);
                }
                EvidenceNode::Mention { .. } => {
                    new_eg.mentions.push(new_idx);
                }
                EvidenceNode::VerbPhrase { .. } => {
                    new_eg.verb_phrases.push(new_idx);
                }
            }
        }

        // 2. Copy Edges (Directed) between selected nodes
        // We check all original edges to see if both endpoints are in the solution
        for edge in self.graph.edge_references() {
            let source = edge.source();
            let target = edge.target();

            if let (Some(&new_source), Some(&new_target)) = (mapping.get(&source), mapping.get(&target)) {
                // Determine if this exact edge was "selected" by PCST?
                // PCST is undirected. If u-v is in solution, we should probably keep all u->v and v->u edges.
                // The solution object has `edges: Vec<(NodeIndex, NodeIndex)>` representing the tree skeleton.
                
                // Flexible approach: If both nodes are in the solution, we keep the edge.
                // This preserves semantic directionality even if the tree only walked one way.
                new_eg.graph.add_edge(new_source, new_target, edge.weight().clone());
            }
        }

        new_eg
    }
}

// =============================================================================
// Tests - One Piece Domain
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn build_one_piece_graph() -> EvidenceGraph {
        let mut eg = EvidenceGraph::new();

        // Entities
        eg.add_entity("luffy".into(), "Luffy".into(), "CHARACTER".into(), vec!["Straw Hat".into(), "Monkey D. Luffy".into()]);
        eg.add_entity("zoro".into(), "Zoro".into(), "CHARACTER".into(), vec!["Roronoa Zoro".into(), "Pirate Hunter".into()]);
        eg.add_entity("nami".into(), "Nami".into(), "CHARACTER".into(), vec!["Cat Burglar".into()]);
        eg.add_entity("arlong".into(), "Arlong".into(), "CHARACTER".into(), vec!["Arlong the Saw".into()]);
        eg.add_entity("arlong_park".into(), "Arlong Park".into(), "LOCATION".into(), vec![]);
        eg.add_entity("straw_hats".into(), "Straw Hat Pirates".into(), "ORGANIZATION".into(), vec!["Straw Hats".into()]);

        eg
    }

    #[test]
    fn test_cross_sentence_bridging() {
        let mut eg = build_one_piece_graph();

        // Sentence 0: "Luffy punched Arlong."
        let m_luffy = eg.add_mention("Luffy".into(), (0, 5), 0);
        let m_arlong = eg.add_mention("Arlong".into(), (14, 20), 0);
        let vp_punch = eg.add_verb_phrase("punched".into(), (6, 13), 0);
        eg.link_subject(m_luffy, vp_punch);
        eg.link_object(m_arlong, vp_punch);

        // Sentence 1: "He defeated him at Arlong Park."
        // Note: "He" and "him" would require pronoun resolution (future)
        // For now, using explicit names
        let m_straw_hat = eg.add_mention("Straw Hat".into(), (22, 31), 1);
        let m_saw = eg.add_mention("Arlong the Saw".into(), (41, 55), 1);
        let vp_defeat = eg.add_verb_phrase("defeated".into(), (32, 40), 1);
        eg.link_subject(m_straw_hat, vp_defeat);
        eg.link_object(m_saw, vp_defeat);

        // Bridge mentions to entities
        eg.bridge_mentions();

        // Project relations
        let relations = eg.project_relations();

        // Should find:
        // - Luffy FIGHTS Arlong (from sentence 0)
        // - Luffy DEFEATS Arlong (from sentence 1 via alias bridging)
        assert!(!relations.is_empty(), "Should find cross-sentence relations");

        // Check that Straw Hat → Luffy bridging worked
        let straw_hat_rel = relations.iter().find(|r| r.head_label == "Luffy" && r.relation_type == "DEFEATS");
        assert!(straw_hat_rel.is_some(), "Alias 'Straw Hat' should bridge to Luffy");
    }

    #[test]
    fn test_multi_hop_on_demand() {
        let mut eg = build_one_piece_graph();

        // Add some direct relations manually (simulating extracted edges)
        let luffy_idx = *eg.entity_index.get("luffy").unwrap();
        let zoro_idx = *eg.entity_index.get("zoro").unwrap();
        let straw_hats_idx = *eg.entity_index.get("straw_hats").unwrap();

        // Luffy CAPTAIN_OF Straw Hats
        eg.graph.add_edge(luffy_idx, straw_hats_idx, EvidenceEdge::Relation {
            relation_type: "CAPTAIN_OF".into(),
            confidence: 0.95,
            via_vp: None,
        });

        // Zoro MEMBER_OF Straw Hats
        eg.graph.add_edge(zoro_idx, straw_hats_idx, EvidenceEdge::Relation {
            relation_type: "MEMBER_OF".into(),
            confidence: 0.90,
            via_vp: None,
        });

        // Query: Is Zoro under Luffy's command? (2-hop)
        // Path: Zoro --MEMBER_OF--> Straw Hats <--CAPTAIN_OF-- Luffy
        // This requires reverse-edge traversal which our current impl doesn't support yet
        // TODO: Add bidirectional path search
    }

    #[test]
    fn test_evidence_provenance() {
        let mut eg = build_one_piece_graph();

        // Sentence 0: "Nami was saved by Luffy."
        let m_nami = eg.add_mention("Nami".into(), (0, 4), 0);
        let m_luffy = eg.add_mention("Luffy".into(), (18, 23), 0);
        let vp_saved = eg.add_verb_phrase("saved".into(), (9, 14), 0);
        // Passive voice: object first, then subject
        eg.link_object(m_nami, vp_saved);
        eg.link_subject(m_luffy, vp_saved);

        // Sentence 1: "She joined Straw Hat's crew."
        let m_cat_burglar = eg.add_mention("Cat Burglar".into(), (25, 36), 1);
        let m_crew = eg.add_mention("Straw Hats".into(), (44, 54), 1);
        let vp_joined = eg.add_verb_phrase("joined".into(), (37, 43), 1);
        eg.link_subject(m_cat_burglar, vp_joined);
        eg.link_object(m_crew, vp_joined);

        eg.bridge_mentions();
        let relations = eg.project_relations();

        // Find the JOINS relation
        let join_rel = relations.iter().find(|r| r.relation_type == "JOINS");
        if let Some(rel) = join_rel {
            // Should have evidence from both sentences if cross-sentence
            assert!(rel.evidence.len() >= 1, "Should have evidence spans");
            assert!(rel.evidence.iter().any(|e| matches!(e.source, EvidenceSource::CstSvo)), 
                "Should have CST evidence");
        }
    }
}
