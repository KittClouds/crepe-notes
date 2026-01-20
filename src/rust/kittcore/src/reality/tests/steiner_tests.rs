use crate::reality::evidence_graph::*;
use rustworkx_core::petgraph::graph::NodeIndex;

#[test]
fn test_compute_steiner_subgraph_smart_context() {
    let mut eg = EvidenceGraph::new();

    // 1. Create Nodes
    // We explicitly use string literals and to_string() to be safe.
    
    // Query Nodes (Prize = High)
    let q1 = eg.add_entity(
        "query_a".to_string(),
        "Query A".to_string(),
        "Concept".to_string(),
        vec![],
    );
    let q2 = eg.add_entity(
        "query_b".to_string(),
        "Query B".to_string(),
        "Concept".to_string(),
        vec![],
    );

    // Bridge Node (Cost = Low)
    let bridge = eg.add_entity(
        "bridge".to_string(),
        "Bridge".to_string(),
        "Entity".to_string(),
        vec![],
    );

    // Distractor Node (Cost = High)
    let distractor = eg.add_entity(
        "distractor".to_string(),
        "Distractor".to_string(),
        "Entity".to_string(),
        vec![],
    );

    // 2. Create Relations
    // High Confidence (0.9) -> Low Cost (0.1)
    eg.add_direct_relation(q1, bridge, "RELATED", 0.9);
    eg.add_direct_relation(bridge, q2, "RELATED", 0.9);

    // Low Confidence (0.2) -> High Cost (0.8)
    eg.add_direct_relation(q1, distractor, "RELATED", 0.2);
    eg.add_direct_relation(distractor, q2, "RELATED", 0.2);

    // 3. Compute Subgraph
    // Search for connection between q1 and q2.
    // The algorithm should prefer the path through 'bridge' due to lower cost.
    let subgraph = eg.compute_steiner_subgraph(&["query_a", "query_b"]);

    // 4. Verification
    
    // Debug print
    println!("Subgraph: {} nodes, {} edges", subgraph.node_count(), subgraph.edge_count());
    
    // Check for presence of nodes by ID
    let has_q1 = subgraph.get_node_index("query_a").is_some();
    let has_q2 = subgraph.get_node_index("query_b").is_some();
    let has_bridge = subgraph.get_node_index("bridge").is_some();
    let has_distractor = subgraph.get_node_index("distractor").is_some();

    assert!(has_q1, "Query A missing from result");
    assert!(has_q2, "Query B missing from result");
    assert!(has_bridge, "Bridge missing - PCST failed to find optimal path");
    assert!(!has_distractor, "Distractor included - PCST failed to prune optimized path");
    
    // Simple connectivity assertion
    assert!(subgraph.edge_count() >= 2, "Subgraph should be connected");
}
