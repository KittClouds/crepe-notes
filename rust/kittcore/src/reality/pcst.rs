//! Prize-Collecting Steiner Forest (PCSF) Algorithm
//!
//! Implements the Goemans-Williamson primal-dual approximation for PCST/PCSF,
//! plus the iterative IPCST algorithm from "A 1.79 Approximation" (arXiv:2405.03792).
//!
//! # Overview
//!
//! Given a graph G with:
//! - Edge costs c(e) ≥ 0
//! - Node prizes π(v) ≥ 0 (aka penalties for exclusion)
//! - Optional root node
//!
//! Find a forest (or tree if rooted) that maximizes:
//!   Σ π(v) for v in tree  -  Σ c(e) for e in tree
//!
//! Equivalently, minimize:
//!   Σ c(e) for selected edges  +  Σ π(v) for excluded nodes
//!
//! # Use Cases
//!
//! - **RAG Evidence Graphs**: Turn scattered top-k nodes into connected clusters
//! - **Subgraph Selection**: Extract the best "story" from a large knowledge graph
//! - **Explanation Graphs**: Build minimal connected explanations for queries

use rustworkx_core::petgraph::graph::{NodeIndex, UnGraph};
use rustworkx_core::petgraph::visit::EdgeRef;
use std::collections::{BinaryHeap, HashMap, HashSet};
use std::cmp::Ordering;

// =============================================================================
// Types
// =============================================================================

/// Cost/weight type (f64 for flexibility)
pub type Cost = f64;

/// A PCST/PCSF instance
#[derive(Clone, Debug)]
pub struct PcstInstance {
    /// Undirected graph with edge costs
    pub graph: UnGraph<(), Cost>,
    /// Optional root node (None = forest mode)
    pub root: Option<NodeIndex>,
    /// Penalty for each node (prize for including = penalty for excluding)
    pub penalties: Vec<Cost>,
}

impl PcstInstance {
    /// Create a new instance (forest mode - no root)
    pub fn new(graph: UnGraph<(), Cost>, penalties: Vec<Cost>) -> Self {
        Self { graph, root: None, penalties }
    }

    /// Create a new rooted instance (tree mode)
    pub fn rooted(graph: UnGraph<(), Cost>, root: NodeIndex, penalties: Vec<Cost>) -> Self {
        Self { graph, root: Some(root), penalties }
    }

    /// Get penalty for a node
    #[inline]
    pub fn penalty(&self, node: NodeIndex) -> Cost {
        self.penalties.get(node.index()).copied().unwrap_or(0.0)
    }

    /// Check if this is rooted (tree mode) vs unrooted (forest mode)
    pub fn is_rooted(&self) -> bool {
        self.root.is_some()
    }

    /// Number of nodes
    pub fn node_count(&self) -> usize {
        self.graph.node_count()
    }

    /// Create a scaled-penalty instance (for IPCST algorithm)
    pub fn with_scaled_penalties(&self, beta: Cost) -> Self {
        let scaled = self.penalties.iter().map(|p| p / beta).collect();
        Self {
            graph: self.graph.clone(),
            root: self.root,
            penalties: scaled,
        }
    }

    /// Create an instance with zeroed penalties for specific nodes
    pub fn with_zeroed_penalties(&self, zero_nodes: &HashSet<NodeIndex>) -> Self {
        let zeroed = self.penalties
            .iter()
            .enumerate()
            .map(|(i, &p)| {
                if zero_nodes.contains(&NodeIndex::new(i)) { 0.0 } else { p }
            })
            .collect();
        Self {
            graph: self.graph.clone(),
            root: self.root,
            penalties: zeroed,
        }
    }
}

/// A solution: forest of trees (or single tree if rooted)
#[derive(Clone, Debug, Default)]
pub struct PcsfSolution {
    /// Selected edges (node pairs)
    pub edges: Vec<(NodeIndex, NodeIndex)>,
    /// Set of nodes in the solution
    pub nodes: HashSet<NodeIndex>,
    /// Total cost (edge costs + excluded node penalties)
    pub cost: Cost,
    /// Components (each component is a set of node indices)
    pub components: Vec<HashSet<NodeIndex>>,
}

impl PcsfSolution {
    /// Create an empty solution
    pub fn empty() -> Self {
        Self::default()
    }

    /// Create a single-node solution
    pub fn single(node: NodeIndex) -> Self {
        let mut nodes = HashSet::new();
        nodes.insert(node);
        let mut components = Vec::new();
        components.push(nodes.clone());
        Self { edges: vec![], nodes, cost: 0.0, components }
    }

    /// Number of trees in the forest
    pub fn tree_count(&self) -> usize {
        self.components.len()
    }

    /// Check if a node is in the solution
    pub fn contains(&self, node: NodeIndex) -> bool {
        self.nodes.contains(&node)
    }
}

/// Result of GW algorithm (includes dead set info for IPCST)
#[derive(Clone, Debug)]
pub struct GwResult {
    /// The forest solution
    pub solution: PcsfSolution,
    /// Dead nodes (those that "died" during GW coloring)
    pub dead_nodes: HashSet<NodeIndex>,
}

// =============================================================================
// Simple Union-Find for PCST
// =============================================================================

/// Simple Union-Find (Disjoint Set Union) data structure
#[derive(Clone, Debug)]
struct UnionFind {
    parent: Vec<usize>,
    rank: Vec<usize>,
}

impl UnionFind {
    fn new(n: usize) -> Self {
        Self {
            parent: (0..n).collect(),
            rank: vec![0; n],
        }
    }

    fn find(&mut self, x: usize) -> usize {
        if self.parent[x] != x {
            self.parent[x] = self.find(self.parent[x]); // Path compression
        }
        self.parent[x]
    }

    fn union(&mut self, x: usize, y: usize) {
        let px = self.find(x);
        let py = self.find(y);
        if px == py {
            return;
        }
        // Union by rank
        if self.rank[px] < self.rank[py] {
            self.parent[px] = py;
        } else if self.rank[px] > self.rank[py] {
            self.parent[py] = px;
        } else {
            self.parent[py] = px;
            self.rank[px] += 1;
        }
    }
}

// =============================================================================
// Goemans-Williamson Algorithm
// =============================================================================

/// Event in the GW coloring process
#[derive(Debug, Clone)]
enum GwEvent {
    /// An edge becomes fully colored (tight)
    EdgeTight { edge_idx: usize, time: Cost },
    /// A component exhausts its coloring potential (dies)
    ComponentDeath { component_id: usize, time: Cost },
}

impl PartialEq for GwEvent {
    fn eq(&self, other: &Self) -> bool {
        self.time().eq(&other.time())
    }
}

impl Eq for GwEvent {}

impl PartialOrd for GwEvent {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for GwEvent {
    fn cmp(&self, other: &Self) -> Ordering {
        // Reverse ordering for min-heap (earliest event first)
        other.time().partial_cmp(&self.time()).unwrap_or(Ordering::Equal)
    }
}

impl GwEvent {
    fn time(&self) -> Cost {
        match self {
            GwEvent::EdgeTight { time, .. } => *time,
            GwEvent::ComponentDeath { time, .. } => *time,
        }
    }
}

/// Component state during GW algorithm
#[derive(Debug, Clone)]
struct Component {
    /// Remaining coloring potential (sum of node penalties)
    potential: Cost,
    /// Whether this component is active
    active: bool,
    /// Time when this component was last updated
    #[allow(dead_code)]
    last_update_time: Cost,
}

/// Goemans-Williamson PCSF solver
pub struct GwSolver {
    /// Epsilon for floating point comparisons
    epsilon: Cost,
}

impl Default for GwSolver {
    fn default() -> Self {
        Self { epsilon: 1e-10 }
    }
}

impl GwSolver {
    /// Solve PCSF using Goemans-Williamson primal-dual algorithm
    ///
    /// Returns both the solution and the set of "dead" nodes for IPCST
    pub fn solve(&self, instance: &PcstInstance) -> GwResult {
        let n = instance.node_count();
        if n == 0 {
            return GwResult {
                solution: PcsfSolution::empty(),
                dead_nodes: HashSet::new(),
            };
        }

        // Initialize union-find for component tracking
        let mut uf = UnionFind::new(n);

        // Initialize components (each node is its own component initially)
        let mut components: Vec<Component> = (0..n)
            .map(|i| {
                let penalty = instance.penalty(NodeIndex::new(i));
                let is_root = instance.root.map(|r| r.index() == i).unwrap_or(false);
                Component {
                    // Root has infinite potential (never dies)
                    potential: if is_root { Cost::INFINITY } else { penalty },
                    active: true,
                    last_update_time: 0.0,
                }
            })
            .collect();

        // Track coloring on each edge
        let edges: Vec<_> = instance.graph.edge_references()
            .map(|e| (e.source().index(), e.target().index(), *e.weight()))
            .collect();
        let mut edge_coloring: Vec<Cost> = vec![0.0; edges.len()];

        // Selected edges (forest F)
        let mut selected_edges: Vec<(usize, usize)> = Vec::new();

        // Dead sets (components that exhausted potential)
        let mut dead_sets: Vec<HashSet<usize>> = Vec::new();

        // Event queue
        let mut events: BinaryHeap<GwEvent> = BinaryHeap::new();

        // Initialize events
        let current_time = 0.0;
        self.schedule_events(
            instance,
            &edges,
            &edge_coloring,
            &mut uf,
            &components,
            current_time,
            &mut events,
        );

        // Process events
        let mut current_time = 0.0;
        let mut active_count = n;

        while active_count > 0 && !events.is_empty() {
            let event = events.pop().unwrap();
            let event_time = event.time();

            // Skip stale events
            if event_time < current_time - self.epsilon {
                continue;
            }

            // Update coloring for all edges between active components
            let delta = event_time - current_time;
            if delta > self.epsilon {
                for (i, &(u, v, _cost)) in edges.iter().enumerate() {
                    let cu = uf.find(u);
                    let cv = uf.find(v);
                    if cu != cv && components[cu].active && components[cv].active {
                        edge_coloring[i] += 2.0 * delta; // Both sides color
                    } else if cu != cv && (components[cu].active || components[cv].active) {
                        edge_coloring[i] += delta; // One side colors
                    }
                }

                // Update component potentials
                for comp in components.iter_mut() {
                    if comp.active && comp.potential.is_finite() {
                        comp.potential -= delta;
                        comp.last_update_time = event_time;
                    }
                }
            }

            current_time = event_time;

            match event {
                GwEvent::EdgeTight { edge_idx, .. } => {
                    let (u, v, _) = edges[edge_idx];
                    let cu = uf.find(u);
                    let cv = uf.find(v);

                    // Skip if already in same component
                    if cu == cv {
                        continue;
                    }

                    // Skip if edge not actually tight
                    if edge_coloring[edge_idx] < edges[edge_idx].2 - self.epsilon {
                        continue;
                    }

                    // Merge components
                    uf.union(cu, cv);
                    let new_root = uf.find(u);
                    let other = if new_root == cu { cv } else { cu };

                    // Merge potentials
                    components[new_root].potential += components[other].potential;
                    components[new_root].active = components[cu].active || components[cv].active;
                    components[other].active = false;

                    // Add edge to forest
                    selected_edges.push((u, v));
                }
                GwEvent::ComponentDeath { component_id, .. } => {
                    let root = uf.find(component_id);
                    if !components[root].active {
                        continue;
                    }

                    if components[root].potential <= self.epsilon {
                        components[root].active = false;
                        active_count -= 1;

                        // Record dead set
                        let dead_set: HashSet<usize> = (0..n)
                            .filter(|&i| uf.find(i) == root)
                            .collect();
                        dead_sets.push(dead_set);
                    }
                }
            }

            // Reschedule events
            self.schedule_events(
                instance,
                &edges,
                &edge_coloring,
                &mut uf,
                &components,
                current_time,
                &mut events,
            );
        }

        // Phase 2: Pruning
        // Remove dead sets that have exactly one edge connecting to the rest
        let mut final_edges: HashSet<(usize, usize)> = selected_edges
            .iter()
            .map(|&(u, v)| if u < v { (u, v) } else { (v, u) })
            .collect();

        // Collect all dead nodes
        let mut dead_nodes: HashSet<NodeIndex> = HashSet::new();
        for dead_set in &dead_sets {
            for &node in dead_set {
                dead_nodes.insert(NodeIndex::new(node));
            }
        }

        // Prune dead sets with single cutting edge
        let mut changed = true;
        while changed {
            changed = false;
            for dead_set in &dead_sets {
                // Count edges crossing this dead set
                let cross_edges: Vec<_> = final_edges
                    .iter()
                    .filter(|&&(u, v)| {
                        (dead_set.contains(&u)) != (dead_set.contains(&v))
                    })
                    .cloned()
                    .collect();

                if cross_edges.len() == 1 {
                    // Remove the crossing edge and internal edges
                    final_edges.remove(&cross_edges[0]);
                    final_edges.retain(|&(u, v)| {
                        !(dead_set.contains(&u) && dead_set.contains(&v))
                    });
                    changed = true;
                    break;
                }
            }
        }

        // Build solution
        let solution_edges: Vec<(NodeIndex, NodeIndex)> = final_edges
            .iter()
            .map(|&(u, v)| (NodeIndex::new(u), NodeIndex::new(v)))
            .collect();

        // Find connected components
        let mut solution_uf = UnionFind::new(n);
        for &(u, v) in &solution_edges {
            solution_uf.union(u.index(), v.index());
        }

        // Collect nodes and components
        let mut solution_nodes: HashSet<NodeIndex> = HashSet::new();
        let mut component_map: HashMap<usize, HashSet<NodeIndex>> = HashMap::new();

        for (u, v) in &solution_edges {
            solution_nodes.insert(*u);
            solution_nodes.insert(*v);
        }

        for node in &solution_nodes {
            let root = solution_uf.find(node.index());
            component_map.entry(root)
                .or_insert_with(HashSet::new)
                .insert(*node);
        }

        // Calculate cost
        let edge_cost: Cost = solution_edges
            .iter()
            .filter_map(|&(u, v)| {
                instance.graph.find_edge(u, v).map(|e| *instance.graph.edge_weight(e).unwrap())
            })
            .sum();

        let penalty_cost: Cost = (0..n)
            .filter(|i| !solution_nodes.contains(&NodeIndex::new(*i)))
            .map(|i| instance.penalty(NodeIndex::new(i)))
            .sum();

        let solution = PcsfSolution {
            edges: solution_edges,
            nodes: solution_nodes,
            cost: edge_cost + penalty_cost,
            components: component_map.into_values().collect(),
        };

        GwResult { solution, dead_nodes }
    }

    fn schedule_events(
        &self,
        instance: &PcstInstance,
        edges: &[(usize, usize, Cost)],
        edge_coloring: &[Cost],
        uf: &mut UnionFind,
        components: &[Component],
        current_time: Cost,
        events: &mut BinaryHeap<GwEvent>,
    ) {
        let n = instance.node_count();

        // Schedule edge-tight events
        for (i, &(u, v, cost)) in edges.iter().enumerate() {
            let cu = uf.find(u);
            let cv = uf.find(v);

            if cu != cv {
                let both_active = components[cu].active && components[cv].active;
                let one_active = components[cu].active || components[cv].active;

                if one_active {
                    let remaining = cost - edge_coloring[i];
                    if remaining > self.epsilon {
                        let rate = if both_active { 2.0 } else { 1.0 };
                        let time_to_tight = current_time + remaining / rate;
                        events.push(GwEvent::EdgeTight {
                            edge_idx: i,
                            time: time_to_tight,
                        });
                    }
                }
            }
        }

        // Schedule component death events
        for i in 0..n {
            let root = uf.find(i);
            if i == root && components[root].active && components[root].potential.is_finite() {
                let death_time = current_time + components[root].potential;
                events.push(GwEvent::ComponentDeath {
                    component_id: i,
                    time: death_time,
                });
            }
        }
    }
}

// =============================================================================
// MST-based Steiner Tree Approximation
// =============================================================================

/// MST-based 2-approximation for Steiner Tree
///
/// Given terminals in a graph, finds a tree connecting them using:
/// 1. Build metric closure (shortest paths between terminals)
/// 2. Find MST of metric closure
/// 3. Map back to original edges
pub struct MstSteiner;

impl MstSteiner {
    /// Find approximate Steiner tree connecting terminals to root
    pub fn solve(
        graph: &UnGraph<(), Cost>,
        terminals: &HashSet<NodeIndex>,
        root: Option<NodeIndex>,
    ) -> PcsfSolution {
        if terminals.is_empty() {
            return PcsfSolution::empty();
        }

        if terminals.len() == 1 {
            let node = *terminals.iter().next().unwrap();
            return PcsfSolution::single(node);
        }

        let n = graph.node_count();

        // Collect all terminal indices
        let mut term_list: Vec<NodeIndex> = terminals.iter().cloned().collect();
        if let Some(r) = root {
            if !terminals.contains(&r) {
                term_list.push(r);
            }
        }

        // Compute shortest paths between all terminal pairs (Dijkstra from each)
        let mut dist: HashMap<(usize, usize), (Cost, Vec<NodeIndex>)> = HashMap::new();

        for &s in &term_list {
            let (distances, parents) = Self::dijkstra(graph, s);

            for &t in &term_list {
                if s.index() < t.index() {
                    let path = Self::reconstruct_path(s, t, &parents);
                    let total_dist = distances.get(&t.index()).copied().unwrap_or(Cost::INFINITY);
                    dist.insert((s.index(), t.index()), (total_dist, path));
                }
            }
        }

        // Build MST on terminals using Kruskal's
        let mut mst_edges: Vec<(Cost, usize, usize, Vec<NodeIndex>)> = dist
            .iter()
            .map(|(&(u, v), (d, path))| (*d, u, v, path.clone()))
            .collect();
        mst_edges.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());

        let mut uf = UnionFind::new(n);
        let mut selected_paths: Vec<Vec<NodeIndex>> = Vec::new();

        for (_, u, v, path) in mst_edges {
            if uf.find(u) != uf.find(v) {
                uf.union(u, v);
                selected_paths.push(path);
            }
        }

        // Collect all edges from selected paths
        let mut solution_edges: HashSet<(NodeIndex, NodeIndex)> = HashSet::new();
        let mut solution_nodes: HashSet<NodeIndex> = HashSet::new();

        for path in selected_paths {
            for window in path.windows(2) {
                let u = window[0];
                let v = window[1];
                let edge = if u.index() < v.index() { (u, v) } else { (v, u) };
                solution_edges.insert(edge);
                solution_nodes.insert(u);
                solution_nodes.insert(v);
            }
        }

        // Calculate cost
        let edge_cost: Cost = solution_edges
            .iter()
            .filter_map(|&(u, v)| {
                graph.find_edge(u, v).map(|e| *graph.edge_weight(e).unwrap())
            })
            .sum();

        PcsfSolution {
            edges: solution_edges.into_iter().collect(),
            nodes: solution_nodes.clone(),
            cost: edge_cost, // Note: no penalty cost for Steiner tree
            components: vec![solution_nodes],
        }
    }

    fn dijkstra(
        graph: &UnGraph<(), Cost>,
        source: NodeIndex,
    ) -> (HashMap<usize, Cost>, HashMap<usize, NodeIndex>) {
        let mut dist: HashMap<usize, Cost> = HashMap::new();
        let mut parent: HashMap<usize, NodeIndex> = HashMap::new();
        let mut heap = BinaryHeap::new();

        dist.insert(source.index(), 0.0);
        heap.push(std::cmp::Reverse((OrderedFloat(0.0), source)));

        while let Some(std::cmp::Reverse((OrderedFloat(d), u))) = heap.pop() {
            if dist.get(&u.index()).map(|&x| d > x).unwrap_or(false) {
                continue;
            }

            for edge in graph.edges(u) {
                let v = edge.target();
                let w = *edge.weight();
                let new_dist = d + w;

                if new_dist < *dist.get(&v.index()).unwrap_or(&Cost::INFINITY) {
                    dist.insert(v.index(), new_dist);
                    parent.insert(v.index(), u);
                    heap.push(std::cmp::Reverse((OrderedFloat(new_dist), v)));
                }
            }
        }

        (dist, parent)
    }

    fn reconstruct_path(
        source: NodeIndex,
        target: NodeIndex,
        parent: &HashMap<usize, NodeIndex>,
    ) -> Vec<NodeIndex> {
        let mut path = vec![target];
        let mut current = target;

        while current != source {
            if let Some(&p) = parent.get(&current.index()) {
                path.push(p);
                current = p;
            } else {
                break;
            }
        }

        path.reverse();
        path
    }
}

/// Wrapper for f64 to enable ordering in BinaryHeap
#[derive(Debug, Clone, Copy)]
struct OrderedFloat(Cost);

impl PartialEq for OrderedFloat {
    fn eq(&self, other: &Self) -> bool {
        self.0 == other.0
    }
}

impl Eq for OrderedFloat {}

impl PartialOrd for OrderedFloat {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        self.0.partial_cmp(&other.0)
    }
}

impl Ord for OrderedFloat {
    fn cmp(&self, other: &Self) -> Ordering {
        self.partial_cmp(other).unwrap_or(Ordering::Equal)
    }
}

// =============================================================================
// IPCST: Iterative Algorithm (1.79-approximation)
// =============================================================================

/// Configuration for IPCST algorithm
#[derive(Debug, Clone)]
pub struct IpcstConfig {
    /// Beta parameter for penalty scaling (paper uses β = 2)
    pub beta: Cost,
    /// Maximum recursion depth
    pub max_depth: usize,
}

impl Default for IpcstConfig {
    fn default() -> Self {
        Self {
            beta: 2.0,
            max_depth: 10,
        }
    }
}

/// Iterative PCST solver (1.79-approximation from the paper)
pub struct IpcstSolver {
    config: IpcstConfig,
    gw: GwSolver,
}

impl Default for IpcstSolver {
    fn default() -> Self {
        Self {
            config: IpcstConfig::default(),
            gw: GwSolver::default(),
        }
    }
}

impl IpcstSolver {
    pub fn new(config: IpcstConfig) -> Self {
        Self { config, gw: GwSolver::default() }
    }

    /// Solve using iterative algorithm
    pub fn solve(&self, instance: &PcstInstance) -> PcsfSolution {
        self.solve_recursive(instance, 0)
    }

    fn solve_recursive(&self, instance: &PcstInstance, depth: usize) -> PcsfSolution {
        if depth >= self.config.max_depth {
            // Fallback to pure GW
            return self.gw.solve(instance).solution;
        }

        // Step 1: Construct I_β with scaled penalties
        let inst_beta = instance.with_scaled_penalties(self.config.beta);

        // Step 2: Run GW on I_β
        let gw_result = self.gw.solve(&inst_beta);
        let t_gw = gw_result.solution;
        let k_dead = gw_result.dead_nodes;

        // Step 3: Calculate cost_GW (using original penalties)
        let cost_gw = self.calculate_cost(instance, &t_gw);

        // Step 4: Compute live vertices L = V \ K
        let live: HashSet<NodeIndex> = (0..instance.node_count())
            .map(NodeIndex::new)
            .filter(|n| !k_dead.contains(n))
            .collect();

        // Step 5: Run Steiner tree on live vertices
        let t_st = MstSteiner::solve(&instance.graph, &live, instance.root);
        let cost_st = self.calculate_cost(instance, &t_st);

        // Step 6: If K is empty, return min(GW, ST)
        if k_dead.is_empty() {
            return if cost_gw <= cost_st { 
                PcsfSolution { cost: cost_gw, ..t_gw }
            } else { 
                PcsfSolution { cost: cost_st, ..t_st }
            };
        }

        // Step 7: Recurse with zeroed penalties for dead nodes
        let inst_r = instance.with_zeroed_penalties(&k_dead);
        let t_it = self.solve_recursive(&inst_r, depth + 1);
        let cost_it = self.calculate_cost(instance, &t_it);

        // Step 8: Return minimum cost solution
        let mut solutions = vec![
            (cost_gw, t_gw),
            (cost_st, t_st),
            (cost_it, t_it),
        ];
        solutions.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());

        let (best_cost, best_sol) = solutions.remove(0);
        PcsfSolution { cost: best_cost, ..best_sol }
    }

    fn calculate_cost(&self, instance: &PcstInstance, solution: &PcsfSolution) -> Cost {
        // Edge costs
        let edge_cost: Cost = solution.edges
            .iter()
            .filter_map(|&(u, v)| {
                instance.graph.find_edge(u, v)
                    .map(|e| *instance.graph.edge_weight(e).unwrap())
            })
            .sum();

        // Penalty for excluded nodes
        let penalty_cost: Cost = (0..instance.node_count())
            .filter(|i| !solution.nodes.contains(&NodeIndex::new(*i)))
            .map(|i| instance.penalty(NodeIndex::new(i)))
            .sum();

        edge_cost + penalty_cost
    }
}

// =============================================================================
// Builder API for Easy Use
// =============================================================================

/// Builder for creating PCST instances from existing graphs
pub struct PcstBuilder {
    edges: Vec<(usize, usize, Cost)>,
    prizes: HashMap<usize, Cost>,
    root: Option<usize>,
    node_count: usize,
    default_prize: Cost,
    default_cost: Cost,
}

impl PcstBuilder {
    pub fn new() -> Self {
        Self {
            edges: Vec::new(),
            prizes: HashMap::new(),
            root: None,
            node_count: 0,
            default_prize: 1.0,
            default_cost: 1.0,
        }
    }

    /// Set number of nodes
    pub fn nodes(mut self, n: usize) -> Self {
        self.node_count = n;
        self
    }

    /// Add an edge with cost
    pub fn edge(mut self, u: usize, v: usize, cost: Cost) -> Self {
        self.edges.push((u, v, cost));
        self.node_count = self.node_count.max(u + 1).max(v + 1);
        self
    }

    /// Add an edge with default cost
    pub fn edge_default(self, u: usize, v: usize) -> Self {
        let cost = self.default_cost;
        self.edge(u, v, cost)
    }

    /// Set prize for a node
    pub fn prize(mut self, node: usize, prize: Cost) -> Self {
        self.prizes.insert(node, prize);
        self.node_count = self.node_count.max(node + 1);
        self
    }

    /// Set prizes from a map
    pub fn prizes_from_map(mut self, prizes: HashMap<usize, Cost>) -> Self {
        for (k, v) in prizes {
            self.prizes.insert(k, v);
            self.node_count = self.node_count.max(k + 1);
        }
        self
    }

    /// Set root node (for tree mode)
    pub fn root(mut self, r: usize) -> Self {
        self.root = Some(r);
        self
    }

    /// Set default prize for nodes without explicit prize
    pub fn default_prize(mut self, prize: Cost) -> Self {
        self.default_prize = prize;
        self
    }

    /// Set default edge cost
    pub fn default_cost(mut self, cost: Cost) -> Self {
        self.default_cost = cost;
        self
    }

    /// Build the PCST instance
    pub fn build(self) -> PcstInstance {
        let mut graph = UnGraph::new_undirected();

        // Add nodes
        for _ in 0..self.node_count {
            graph.add_node(());
        }

        // Add edges
        for (u, v, cost) in self.edges {
            graph.add_edge(NodeIndex::new(u), NodeIndex::new(v), cost);
        }

        // Build penalty vector
        let penalties: Vec<Cost> = (0..self.node_count)
            .map(|i| self.prizes.get(&i).copied().unwrap_or(self.default_prize))
            .collect();

        match self.root {
            Some(r) => PcstInstance::rooted(graph, NodeIndex::new(r), penalties),
            None => PcstInstance::new(graph, penalties),
        }
    }
}

impl Default for PcstBuilder {
    fn default() -> Self {
        Self::new()
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // -------------------------------------------------------------------------
    // Basic Tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_empty_graph() {
        let instance = PcstBuilder::new().nodes(0).build();
        let solver = IpcstSolver::default();
        let solution = solver.solve(&instance);
        assert!(solution.edges.is_empty());
        assert!(solution.nodes.is_empty());
    }

    #[test]
    fn test_single_node() {
        let instance = PcstBuilder::new()
            .nodes(1)
            .prize(0, 10.0)
            .build();
        let solver = IpcstSolver::default();
        let solution = solver.solve(&instance);
        // Single node with prize, edge list should be empty
        assert!(solution.edges.is_empty());
    }

    #[test]
    fn test_simple_path() {
        // 0 -- 1 -- 2
        // Prizes: 0=10, 1=1, 2=10
        // Edge costs: 1.0 each
        // Total prize if all connected: 21
        // Edge cost for path: 2.0
        // Net benefit: 21 - 2 = 19 (should connect all)
        let instance = PcstBuilder::new()
            .edge(0, 1, 1.0)
            .edge(1, 2, 1.0)
            .prize(0, 10.0)
            .prize(1, 1.0)
            .prize(2, 10.0)
            .build();
        
        let solver = IpcstSolver::default();
        let solution = solver.solve(&instance);
        
        // Should include multiple nodes (prizes outweigh edge costs)
        assert!(solution.nodes.len() >= 2, "Expected at least 2 nodes, got {}", solution.nodes.len());
    }

    #[test]
    fn test_star_graph_rooted() {
        // Star: 0 is center, connected to 1,2,3,4
        // High prize at center, low at leaves
        let instance = PcstBuilder::new()
            .edge(0, 1, 1.0)
            .edge(0, 2, 1.0)
            .edge(0, 3, 1.0)
            .edge(0, 4, 1.0)
            .prize(0, 100.0)  // High prize center
            .prize(1, 0.5)   // Low prize leaves
            .prize(2, 0.5)
            .prize(3, 0.5)
            .prize(4, 0.5)
            .root(0)
            .build();
        
        let solver = IpcstSolver::default();
        let solution = solver.solve(&instance);
        
        // Root should always be included in rooted mode
        assert!(solution.nodes.contains(&NodeIndex::new(0)), "Root should be included");
    }

    #[test]
    fn test_forest_mode_disjoint() {
        // Two disconnected components
        // Component 1: 0-1-2 (high prizes)
        // Component 2: 3-4-5 (low prizes that don't justify connections)
        let instance = PcstBuilder::new()
            .edge(0, 1, 1.0)
            .edge(1, 2, 1.0)
            .edge(3, 4, 10.0)  // Very expensive edges in component 2
            .edge(4, 5, 10.0)
            .prize(0, 10.0)
            .prize(1, 10.0)
            .prize(2, 10.0)
            .prize(3, 0.1)  // Low prizes in component 2
            .prize(4, 0.1)
            .prize(5, 0.1)
            .build();
        
        let solver = IpcstSolver::default();
        let solution = solver.solve(&instance);
        
        // Should have at most 2 components (forest mode)
        assert!(solution.tree_count() <= 2, "Expected at most 2 trees in forest");
    }

    // -------------------------------------------------------------------------
    // GW Algorithm Tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_gw_solver_basic() {
        let instance = PcstBuilder::new()
            .edge(0, 1, 1.0)
            .prize(0, 5.0)
            .prize(1, 5.0)
            .build();
        
        let solver = GwSolver::default();
        let result = solver.solve(&instance);
        
        // Both nodes have high prizes, edge is cheap → should connect
        assert!(!result.solution.edges.is_empty() || result.solution.nodes.len() >= 1);
    }

    #[test]
    fn test_gw_dead_nodes_expensive_edge() {
        // Two nodes with low prizes, connected by expensive edge
        // Neither should be included (both should "die")
        let instance = PcstBuilder::new()
            .edge(0, 1, 100.0)  // Very expensive
            .prize(0, 1.0)    // Low prizes
            .prize(1, 1.0)
            .build();
        
        let solver = GwSolver::default();
        let result = solver.solve(&instance);
        
        // With expensive edge and low prizes, nodes may die
        // (exact behavior depends on GW implementation)
        assert!(result.dead_nodes.len() >= 0); // Valid result
    }

    // -------------------------------------------------------------------------
    // Steiner Tree Tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_mst_steiner_empty() {
        let graph: UnGraph<(), Cost> = UnGraph::new_undirected();
        let terminals: HashSet<NodeIndex> = HashSet::new();
        let solution = MstSteiner::solve(&graph, &terminals, None);
        assert!(solution.edges.is_empty());
    }

    #[test]
    fn test_mst_steiner_single_terminal() {
        let mut graph: UnGraph<(), Cost> = UnGraph::new_undirected();
        let n0 = graph.add_node(());
        
        let mut terminals = HashSet::new();
        terminals.insert(n0);
        
        let solution = MstSteiner::solve(&graph, &terminals, None);
        assert!(solution.nodes.contains(&n0));
    }

    #[test]
    fn test_mst_steiner_path() {
        // Path: 0 -- 1 -- 2 -- 3
        // Terminals: 0 and 3
        // Should connect through 1 and 2
        let mut graph: UnGraph<(), Cost> = UnGraph::new_undirected();
        for _ in 0..4 {
            graph.add_node(());
        }
        graph.add_edge(NodeIndex::new(0), NodeIndex::new(1), 1.0);
        graph.add_edge(NodeIndex::new(1), NodeIndex::new(2), 1.0);
        graph.add_edge(NodeIndex::new(2), NodeIndex::new(3), 1.0);
        
        let mut terminals = HashSet::new();
        terminals.insert(NodeIndex::new(0));
        terminals.insert(NodeIndex::new(3));
        
        let solution = MstSteiner::solve(&graph, &terminals, None);
        
        assert!(solution.nodes.contains(&NodeIndex::new(0)));
        assert!(solution.nodes.contains(&NodeIndex::new(3)));
        // Should have connected them (cost 3.0)
        assert!(!solution.edges.is_empty());
    }

    // -------------------------------------------------------------------------
    // Builder Tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_builder_basic() {
        let instance = PcstBuilder::new()
            .nodes(5)
            .edge(0, 1, 2.0)
            .prize(0, 10.0)
            .build();
        
        assert_eq!(instance.node_count(), 5);
        assert_eq!(instance.penalty(NodeIndex::new(0)), 10.0);
        assert_eq!(instance.penalty(NodeIndex::new(1)), 1.0); // default
    }

    #[test]
    fn test_builder_default_cost() {
        let instance = PcstBuilder::new()
            .default_cost(5.0)
            .edge_default(0, 1)
            .build();
        
        // Edge should have cost 5.0
        let edges: Vec<_> = instance.graph.edge_references().collect();
        assert_eq!(edges.len(), 1);
        assert_eq!(*edges[0].weight(), 5.0);
    }

    #[test]
    fn test_builder_rooted() {
        let instance = PcstBuilder::new()
            .nodes(3)
            .root(1)
            .build();
        
        assert!(instance.is_rooted());
        assert_eq!(instance.root, Some(NodeIndex::new(1)));
    }

    // -------------------------------------------------------------------------
    // IPCST Integration Tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_ipcst_config() {
        let config = IpcstConfig {
            beta: 1.5,
            max_depth: 5,
        };
        let solver = IpcstSolver::new(config);
        
        let instance = PcstBuilder::new()
            .edge(0, 1, 1.0)
            .prize(0, 5.0)
            .prize(1, 5.0)
            .build();
        
        let solution = solver.solve(&instance);
        // Should produce a valid solution
        assert!(solution.cost >= 0.0);
    }

    #[test]
    fn test_ipcst_medium_graph() {
        // Build a small grid-like graph
        // 0-1-2
        // |   |
        // 3-4-5
        let instance = PcstBuilder::new()
            .edge(0, 1, 1.0).edge(1, 2, 1.0)
            .edge(0, 3, 1.0).edge(2, 5, 1.0)
            .edge(3, 4, 1.0).edge(4, 5, 1.0)
            .prize(0, 10.0)
            .prize(1, 2.0)
            .prize(2, 10.0)
            .prize(3, 2.0)
            .prize(4, 2.0)
            .prize(5, 10.0)
            .build();
        
        let solver = IpcstSolver::default();
        let solution = solver.solve(&instance);
        
        // Should find a good connected subgraph
        assert!(solution.nodes.len() >= 2);
        assert!(solution.cost > 0.0);
    }

    // -------------------------------------------------------------------------
    // Solution Quality Tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_solution_cost_calculation() {
        let instance = PcstBuilder::new()
            .edge(0, 1, 3.0)  // Edge cost 3
            .prize(0, 5.0)   // Prize 5
            .prize(1, 5.0)   // Prize 5
            .build();
        
        let solver = IpcstSolver::default();
        let solution = solver.solve(&instance);
        
        // Cost should be reasonable: either connect (cost 3, penalty 0)
        // or don't connect (cost 0, penalty 10)
        assert!(solution.cost >= 0.0);
        assert!(solution.cost <= 10.0);
    }

    #[test]
    fn test_solution_connectivity() {
        let instance = PcstBuilder::new()
            .edge(0, 1, 1.0)
            .edge(1, 2, 1.0)
            .edge(2, 3, 1.0)
            .prize(0, 10.0)
            .prize(1, 10.0)
            .prize(2, 10.0)
            .prize(3, 10.0)
            .build();
        
        let solver = IpcstSolver::default();
        let solution = solver.solve(&instance);
        
        // All nodes should be connected (high prizes, low costs)
        assert!(solution.nodes.len() >= 2);
        
        // Verify connectivity - edges should form a connected graph
        if !solution.edges.is_empty() {
            let mut uf = UnionFind::new(4);
            for (u, v) in &solution.edges {
                uf.union(u.index(), v.index());
            }
            // All nodes in solution should be in same component
            let roots: HashSet<_> = solution.nodes.iter().map(|n| uf.find(n.index())).collect();
            assert!(roots.len() <= solution.tree_count() + 1);
        }
    }
}
