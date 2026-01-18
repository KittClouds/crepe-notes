/**
 * RAPTOR Clustering Logic
 * Extracting math and clustering algorithms for testability.
 */

// ============================================================================
// Types
// ============================================================================

export interface ClusterNode {
    id: string;
    level: number;
    embedding: number[];
    children: string[]; // Child IDs
    payload?: any;
}

export interface ClusteringConfig {
    maxClusterSize: number; // e.g. 20
    overlapThreshold: number; // e.g. 0.2
}

// ============================================================================
// Math Helpers
// ============================================================================

export function dot(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
    return sum;
}

export function magnitude(a: number[]): number {
    return Math.sqrt(dot(a, a));
}

export function cosineSimilarity(a: number[], b: number[]): number {
    const ma = magnitude(a);
    const mb = magnitude(b);
    if (ma === 0 || mb === 0) return 0;
    return dot(a, b) / (ma * mb);
}

// 1 - cosine
export function cosineDistance(a: number[], b: number[]): number {
    return 1 - cosineSimilarity(a, b);
}

export function addVectors(a: number[], b: number[]): number[] {
    return a.map((v, i) => v + b[i]);
}

export function scaleVector(a: number[], s: number): number[] {
    return a.map(v => v * s);
}

export function getCentroid(vectors: number[][]): number[] {
    if (vectors.length === 0) return [];
    const dim = vectors[0].length;
    let sum = new Array(dim).fill(0);
    for (const v of vectors) sum = addVectors(sum, v);
    return scaleVector(sum, 1 / vectors.length);
}

// ============================================================================
// Clustering Algorithms
// ============================================================================

/**
 * Basic K-Means implementation with cosine distance
 */
export function kMeans(vectors: number[][], k: number, maxIter: number = 20): { centroids: number[][]; assignments: number[][] } {
    if (vectors.length === 0) return { centroids: [], assignments: [] };
    if (k >= vectors.length) {
        // More clusters than points -> each point is a cluster
        return {
            centroids: vectors,
            assignments: vectors.map((_, i) => [i]) // Each vector assigned to its own index
        };
    }

    // Init centroids (random)
    let centroids = vectors.slice(0, k); // Simple init: take first k (better: random sample)

    // Random shuffle for better init (Fisher-Yates)
    const indices = Array.from({ length: vectors.length }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    centroids = indices.slice(0, k).map(i => vectors[i]);

    let assignments: number[][] = Array(k).fill([]).map(() => []);

    for (let iter = 0; iter < maxIter; iter++) {
        // Assign points to nearest centroid
        const newAssignments: number[][] = Array(k).fill([]).map(() => []);

        for (let i = 0; i < vectors.length; i++) {
            const vec = vectors[i];
            let minDist = Infinity;
            let clusterIdx = 0;

            for (let c = 0; c < k; c++) {
                const dist = cosineDistance(vec, centroids[c]);
                if (dist < minDist) {
                    minDist = dist;
                    clusterIdx = c;
                }
            }
            newAssignments[clusterIdx].push(i);
        }

        // Update centroids
        let changed = false;
        const newCentroids: number[][] = [];

        for (let c = 0; c < k; c++) {
            const assignedIndices = newAssignments[c];
            if (assignedIndices.length === 0) {
                // Empty cluster (orphan). Re-init from random point to avoid collapse
                const randomIdx = Math.floor(Math.random() * vectors.length);
                newCentroids.push(vectors[randomIdx]);
            } else {
                const clusterVectors = assignedIndices.map(idx => vectors[idx]);
                const centroid = getCentroid(clusterVectors);
                newCentroids.push(centroid);

                // Check if centroid moved significantly
                if (cosineDistance(centroid, centroids[c]) > 0.0001) {
                    changed = true;
                }
            }
        }

        centroids = newCentroids;
        assignments = newAssignments;

        if (!changed) break;
    }

    return { centroids, assignments };
}

/**
 * Soft Node Assignment
 * Assigns a vector to multiple centroids if it's close enough.
 */
export function softAssign(vector: number[], centroids: number[][], threshold: number): number[] {
    // Calculate all distances
    const dists = centroids.map((c, i) => ({ index: i, dist: cosineDistance(vector, c) }));
    dists.sort((a, b) => a.dist - b.dist);

    if (dists.length === 0) return [];

    const closest = dists[0];
    const assignments = [closest.index];

    // Simple heuristic: If next closest is "very close" to closest, add it.
    for (let i = 1; i < dists.length; i++) {
        const d = dists[i].dist;

        let shouldInclude = false;
        if (closest.dist < 0.001) {
            if (d < 0.001 + threshold) shouldInclude = true;
        } else {
            // Relative comparison
            if (d <= closest.dist * (1 + threshold)) shouldInclude = true;
        }

        if (shouldInclude) {
            assignments.push(dists[i].index);
        } else {
            // Since sorted, later ones won't match either
            break;
        }
    }

    return assignments;
}
