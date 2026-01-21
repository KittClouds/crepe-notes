// src/lib/crossdoc/hybrid-linker.ts
// Hybrid Entity Linker - ported from legacy_v1/src-tauri/src/crossdoc/hybrid.rs
//
// Combines string similarity and semantic embeddings for cross-document entity linking.

// LEGACY REMOVED: import { cozoDb } from '@/lib/cozo/db';
// LEGACY REMOVED: import { CROSSDOC_QUERIES } from '@/lib/cozo/schema/layer2-crossdoc';

// ============================================================================
// Types
// ============================================================================

export interface LinkingConfig {
    stringThreshold: number;     // Default: 0.85
    semanticThreshold: number;   // Default: 0.75
    caseInsensitive: boolean;    // Default: true
    stringWeight: number;        // Weight for string similarity (default: 0.4)
    semanticWeight: number;      // Weight for semantic similarity (default: 0.6)
}

export const DEFAULT_LINKING_CONFIG: LinkingConfig = {
    stringThreshold: 0.85,
    semanticThreshold: 0.75,
    caseInsensitive: true,
    stringWeight: 0.4,
    semanticWeight: 0.6,
};

export interface ClusterMember {
    nodeId: string;
    label: string;
    sourceNote: string;
    similarity: number;
}

export interface EntityCluster {
    clusterId: string;
    canonicalId: string;
    canonicalName: string;
    members: ClusterMember[];
    confidence: number;
}

export interface LinkingStats {
    candidatePairs: number;
    clustersFormed: number;
    cooccurrenceEdges: number;
    processingTimeMs: number;
}

// ============================================================================
// String Similarity (Levenshtein + Jaro-Winkler)
// ============================================================================

/**
 * Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

/**
 * Normalized Levenshtein similarity (0 to 1)
 */
export function levenshteinSimilarity(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1.0;
    const dist = levenshteinDistance(a, b);
    return 1.0 - (dist / maxLen);
}

/**
 * Jaro similarity between two strings
 */
function jaroSimilarity(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0.0;

    const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
    const s1Matches = new Array(s1.length).fill(false);
    const s2Matches = new Array(s2.length).fill(false);

    let matches = 0;
    let transpositions = 0;

    for (let i = 0; i < s1.length; i++) {
        const start = Math.max(0, i - matchWindow);
        const end = Math.min(i + matchWindow + 1, s2.length);

        for (let j = start; j < end; j++) {
            if (s2Matches[j] || s1.charAt(i) !== s2.charAt(j)) continue;
            s1Matches[i] = true;
            s2Matches[j] = true;
            matches++;
            break;
        }
    }

    if (matches === 0) return 0.0;

    let k = 0;
    for (let i = 0; i < s1.length; i++) {
        if (!s1Matches[i]) continue;
        while (!s2Matches[k]) k++;
        if (s1.charAt(i) !== s2.charAt(k)) transpositions++;
        k++;
    }

    return (
        (matches / s1.length +
            matches / s2.length +
            (matches - transpositions / 2) / matches) /
        3
    );
}

/**
 * Jaro-Winkler similarity (boosted for common prefix)
 */
export function jaroWinklerSimilarity(s1: string, s2: string, prefixScale = 0.1): number {
    const jaro = jaroSimilarity(s1, s2);

    // Common prefix length (max 4)
    let prefixLen = 0;
    const maxPrefix = Math.min(4, Math.min(s1.length, s2.length));
    for (let i = 0; i < maxPrefix; i++) {
        if (s1.charAt(i) === s2.charAt(i)) {
            prefixLen++;
        } else {
            break;
        }
    }

    return jaro + prefixLen * prefixScale * (1 - jaro);
}

/**
 * Combined string similarity (average of Levenshtein and Jaro-Winkler)
 */
export function stringSimilarity(a: string, b: string, caseInsensitive = true): number {
    const s1 = caseInsensitive ? a.toLowerCase() : a;
    const s2 = caseInsensitive ? b.toLowerCase() : b;

    const lev = levenshteinSimilarity(s1, s2);
    const jw = jaroWinklerSimilarity(s1, s2);

    return (lev + jw) / 2;
}

// ============================================================================
// Importance Scoring (GraphRAG-inspired)
// ============================================================================

/**
 * Calculate entity importance score.
 * Combines TF-IDF-like weighting with mention frequency.
 * 
 * @param docFreq - Number of documents entity appears in
 * @param mentions - Total mention count across all docs
 * @param totalDocs - Total documents in corpus
 */
export function calculateImportance(
    docFreq: number,
    mentions: number,
    totalDocs: number
): number {
    if (totalDocs === 0 || docFreq === 0) return 0;

    // IDF component: rarer across docs = more important
    const idf = Math.log((totalDocs + 1) / (docFreq + 1)) + 1;

    // TF component: more mentions = more important (with diminishing returns)
    const tf = Math.log(mentions + 1);

    // Combine with normalization
    return (tf * idf) / Math.log(totalDocs + 2);
}

// ============================================================================
// Hybrid Similarity
// ============================================================================

/**
 * Calculate hybrid similarity combining string and semantic scores.
 * 
 * @param strScore - String similarity score (0-1)
 * @param vecScore - Semantic/vector similarity score (0-1), null if no embedding
 * @param config - Linking configuration
 */
export function hybridSimilarity(
    strScore: number,
    vecScore: number | null,
    config: LinkingConfig = DEFAULT_LINKING_CONFIG
): number {
    if (vecScore === null) {
        // No semantic score available, use string only
        return strScore;
    }

    // Weighted combination
    return strScore * config.stringWeight + vecScore * config.semanticWeight;
}

// ============================================================================
// Candidate Generation
// ============================================================================

interface EntityCandidate {
    id: string;
    label: string;
    normalized: string;
    sourceNote: string;
}

/**
 * Find entities similar by string matching
 */
async function findStringCandidates(
    entity: EntityCandidate,
    allEntities: EntityCandidate[],
    config: LinkingConfig
): Promise<Array<{ id: string; similarity: number }>> {
    const candidates: Array<{ id: string; similarity: number }> = [];

    for (const other of allEntities) {
        if (other.id === entity.id) continue;

        const sim = stringSimilarity(entity.normalized, other.normalized, config.caseInsensitive);
        if (sim >= config.stringThreshold) {
            candidates.push({ id: other.id, similarity: sim });
        }
    }

    return candidates;
}

/**
 * Find entities similar by vector embedding
 */
async function findVectorCandidates(
    entityId: string,
    k: number = 10,
    dimension: number = 384
): Promise<Array<{ id: string; similarity: number }>> {
    // LEGACY REMOVED: TS CozoDB vector search
    // TODO: Migrate to Rust backend
    console.warn('[HybridLinker] findVectorCandidates disabled - requires Rust migration');
    return [];
}

// ============================================================================
// Cluster Discovery (Union-Find)
// ============================================================================

class UnionFind {
    private parent: Map<string, string> = new Map();
    private rank: Map<string, number> = new Map();

    find(x: string): string {
        if (!this.parent.has(x)) {
            this.parent.set(x, x);
            this.rank.set(x, 0);
        }
        if (this.parent.get(x) !== x) {
            this.parent.set(x, this.find(this.parent.get(x)!)); // Path compression
        }
        return this.parent.get(x)!;
    }

    union(x: string, y: string): void {
        const rootX = this.find(x);
        const rootY = this.find(y);

        if (rootX === rootY) return;

        const rankX = this.rank.get(rootX) || 0;
        const rankY = this.rank.get(rootY) || 0;

        if (rankX < rankY) {
            this.parent.set(rootX, rootY);
        } else if (rankX > rankY) {
            this.parent.set(rootY, rootX);
        } else {
            this.parent.set(rootY, rootX);
            this.rank.set(rootX, rankX + 1);
        }
    }

    getComponents(): Map<string, string[]> {
        const components = new Map<string, string[]>();
        for (const node of this.parent.keys()) {
            const root = this.find(node);
            if (!components.has(root)) {
                components.set(root, []);
            }
            components.get(root)!.push(node);
        }
        return components;
    }
}

/**
 * Discover entity clusters using hybrid similarity.
 * 
 * @param entities - Entities to cluster
 * @param config - Linking configuration
 */
export async function discoverClusters(
    entities: EntityCandidate[],
    config: LinkingConfig = DEFAULT_LINKING_CONFIG
): Promise<EntityCluster[]> {
    const startTime = performance.now();
    const uf = new UnionFind();
    const similarities = new Map<string, Map<string, number>>(); // pairwise similarities

    console.log(`[HybridLinker] Discovering clusters for ${entities.length} entities...`);

    // Phase 1: Find candidate pairs
    for (const entity of entities) {
        // String-based candidates
        const strCandidates = await findStringCandidates(entity, entities, config);

        // Vector-based candidates (if embeddings exist)
        const vecCandidates = await findVectorCandidates(entity.id);

        // Merge candidates and compute hybrid scores
        const candidateMap = new Map<string, { strScore: number; vecScore: number | null }>();

        for (const c of strCandidates) {
            candidateMap.set(c.id, { strScore: c.similarity, vecScore: null });
        }

        for (const c of vecCandidates) {
            const existing = candidateMap.get(c.id);
            if (existing) {
                existing.vecScore = c.similarity;
            } else if (c.similarity >= config.semanticThreshold) {
                candidateMap.set(c.id, { strScore: 0, vecScore: c.similarity });
            }
        }

        // Compute hybrid scores and union high-confidence pairs
        for (const [candidateId, scores] of candidateMap) {
            const hybrid = hybridSimilarity(scores.strScore, scores.vecScore, config);

            // Store for later cluster metadata
            if (!similarities.has(entity.id)) {
                similarities.set(entity.id, new Map());
            }
            similarities.get(entity.id)!.set(candidateId, hybrid);

            // Union if above threshold
            const threshold = scores.vecScore !== null
                ? Math.min(config.stringThreshold, config.semanticThreshold)
                : config.stringThreshold;

            if (hybrid >= threshold) {
                uf.union(entity.id, candidateId);
            }
        }
    }

    // Phase 2: Form clusters
    const components = uf.getComponents();
    const clusters: EntityCluster[] = [];
    const entityMap = new Map(entities.map(e => [e.id, e]));

    for (const [root, memberIds] of components) {
        if (memberIds.length < 2) continue; // Skip singletons

        // Elect canonical entity (highest importance or first alphabetically)
        const members = memberIds
            .map(id => entityMap.get(id))
            .filter((e): e is EntityCandidate => e !== undefined);

        // Sort by label length (shorter = more canonical), then alphabetically
        members.sort((a, b) => {
            if (a.label.length !== b.label.length) {
                return a.label.length - b.label.length;
            }
            return a.label.localeCompare(b.label);
        });

        const canonical = members[0];

        // Calculate cluster confidence (average pairwise similarity)
        let totalSim = 0;
        let pairCount = 0;
        for (const m of members) {
            const sims = similarities.get(m.id);
            if (sims) {
                for (const [otherId, sim] of sims) {
                    if (memberIds.includes(otherId)) {
                        totalSim += sim;
                        pairCount++;
                    }
                }
            }
        }
        const avgConfidence = pairCount > 0 ? totalSim / pairCount : 0.8;

        clusters.push({
            clusterId: `cluster_${canonical.id}`,
            canonicalId: canonical.id,
            canonicalName: canonical.label,
            members: members.map(m => ({
                nodeId: m.id,
                label: m.label,
                sourceNote: m.sourceNote,
                similarity: similarities.get(canonical.id)?.get(m.id) ?? 1.0,
            })),
            confidence: avgConfidence,
        });
    }

    const elapsed = performance.now() - startTime;
    console.log(`[HybridLinker] Discovered ${clusters.length} clusters in ${elapsed.toFixed(1)}ms`);

    return clusters;
}

// ============================================================================
// Co-occurrence Edges
// ============================================================================

/**
 * Create or update co-occurrence edges between entities.
 * Called when entities appear in the same context (document, sentence, etc.)
 * 
 * @param entityIds - Entity IDs that co-occur
 * @param weightDelta - Weight to add (default 1.0)
 */
export async function createCooccurrenceEdges(
    entityIds: string[],
    weightDelta: number = 1.0
): Promise<number> {
    // LEGACY REMOVED: TS CozoDB co-occurrence edge creation
    // TODO: Migrate to Rust backend
    console.warn('[HybridLinker] createCooccurrenceEdges disabled - requires Rust migration');
    return 0;
}

// ============================================================================
// Persist Clusters to CozoDB
// ============================================================================

/**
 * Save discovered clusters to CozoDB
 */
export async function persistClusters(clusters: EntityCluster[]): Promise<void> {
    // LEGACY REMOVED: TS CozoDB cluster persistence
    // TODO: Migrate to Rust backend
    console.warn('[HybridLinker] persistClusters disabled - requires Rust migration');
}
