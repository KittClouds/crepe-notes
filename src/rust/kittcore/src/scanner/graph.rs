use std::collections::{HashMap, HashSet};
use crate::scanner::discovery::CanonToken;

/// A lightweight, zero-dependency Co-occurrence Graph.
/// Uses an Adjacency List: Node -> Set of Neighbors
pub struct CooccurrenceGraph {
    pub adj: HashMap<CanonToken, HashSet<CanonToken>>,
}

impl CooccurrenceGraph {
    pub fn new() -> Self {
        Self {
            adj: HashMap::new(),
        }
    }

    /// Add an undirected edge between two tokens
    pub fn add_edge(&mut self, a: &CanonToken, b: &CanonToken) {
        if a == b { return; } // No self-loops

        // Add a -> b
        self.adj.entry(a.clone())
            .or_default()
            .insert(b.clone());

        // Add b -> a
        self.adj.entry(b.clone())
            .or_default()
            .insert(a.clone());
    }

    /// Get the degree of the node (number of neighbors)
    pub fn get_degree(&self, token: &CanonToken) -> usize {
        self.adj.get(token).map(|neighbors| neighbors.len()).unwrap_or(0)
    }

    pub fn node_count(&self) -> usize {
        self.adj.len()
    }
    
    pub fn edge_count(&self) -> usize {
        // Sum of degrees / 2
        self.adj.values().map(|s| s.len()).sum::<usize>() / 2
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    fn token(s: &str) -> CanonToken {
        CanonToken(Arc::from(s))
    }

    #[test]
    fn test_graph_creation() {
        let mut g = CooccurrenceGraph::new();
        let luffy = token("luffy");
        let zoro = token("zoro");
        
        g.add_edge(&luffy, &zoro);
        
        assert_eq!(g.node_count(), 2);
        assert_eq!(g.get_degree(&luffy), 1);
        assert_eq!(g.get_degree(&zoro), 1);
        
        // Idempotency
        g.add_edge(&luffy, &zoro);
        assert_eq!(g.get_degree(&luffy), 1);
    }
    
    #[test]
    fn test_degree_centrality() {
        let mut g = CooccurrenceGraph::new();
        let center = token("center");
        let leaf1 = token("leaf1");
        let leaf2 = token("leaf2");
        
        g.add_edge(&center, &leaf1);
        g.add_edge(&center, &leaf2);
        
        assert_eq!(g.get_degree(&center), 2);
        assert_eq!(g.get_degree(&leaf1), 1);
    }
}


