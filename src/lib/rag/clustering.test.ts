import { describe, it, expect } from 'vitest';
import { kMeans, softAssign, cosineDistance, getCentroid } from './clustering';

describe('RAPTOR Clustering Logic', () => {

    // Helper: Create vector
    const v = (...args: number[]) => args;

    describe('Math Helpers', () => {
        it('calculates cosine distance correctly', () => {
            const a = v(1, 0, 0);
            const b = v(0, 1, 0);
            const c = v(1, 0, 0);

            expect(cosineDistance(a, c)).toBeCloseTo(0); // Identical
            expect(cosineDistance(a, b)).toBeCloseTo(1); // Orthogonal
        });

        it('calculates centroid correctly', () => {
            const vectors = [
                v(1, 1),
                v(3, 3)
            ];
            const centroid = getCentroid(vectors);
            expect(centroid[0]).toBeCloseTo(2);
            expect(centroid[1]).toBeCloseTo(2);
        });
    });

    describe('K-Means', () => {
        it('clusters simple 2D points (Angularly Distinct)', () => {
            // Group 1: near X-axis (1, 0)
            // Group 2: near Y-axis (0, 1)
            const vectors = [
                v(1, 0.05), v(0.9, 0.1), // Cluster A (X-dominant)
                v(0.05, 1), v(0.1, 0.9)  // Cluster B (Y-dominant)
            ];

            const { centroids, assignments } = kMeans(vectors, 2, 10);

            expect(centroids.length).toBe(2);
            // Expect 2 assignments for each cluster
            expect(assignments.some(a => a.length === 2)).toBe(true);

            // assignments[0] should contain indices of one group
            // assignments[1] should contain indices of the other
            const groupA = [0, 1];
            const groupB = [2, 3];

            // Check if indices are separated
            const firstClusterIndices = assignments[0];
            const secondClusterIndices = assignments[1];

            const isSeparated =
                (firstClusterIndices.includes(0) && firstClusterIndices.includes(1) && !firstClusterIndices.includes(2)) ||
                (secondClusterIndices.includes(0) && secondClusterIndices.includes(1) && !secondClusterIndices.includes(2));

            expect(isSeparated).toBe(true);
        });

        it('handles single cluster case (k=1)', () => {
            const vectors = [v(1, 1), v(2, 2)];
            const { centroids, assignments } = kMeans(vectors, 1);

            expect(centroids.length).toBe(1);
            expect(assignments[0].length).toBe(2);
        });
    });

    describe('Soft Assignment', () => {
        it('assigns to both centroids when equidistant (within threshold)', () => {
            const c1 = v(1, 0);
            const c2 = v(0, 1); // Point at (1,1) is approx equidistant in angular space? 
            // Cosine dist from (1,1) to (1,0) is 1 - cos(45) = 1 - 0.707 = 0.293
            // Cosine dist from (1,1) to (0,1) is same.

            const point = v(1, 1);
            const centroids = [c1, c2];

            // threshold 0.1 means allow up to 1.1x the best distance
            // Since distances are identical, it effectively allows both
            const assignments = softAssign(point, centroids, 0.1);

            expect(assignments).toContain(0);
            expect(assignments).toContain(1);
            expect(assignments.length).toBe(2);
        });

        it('assigns only to nearest when distinct', () => {
            const c1 = v(1, 0.1); // Very close
            const c2 = v(0, 1);   // Far

            const point = v(1, 0);
            const centroids = [c1, c2];

            // dist to c1 ~ 0
            // dist to c2 ~ 1
            // threshold 0.5 -> 1.5 * 0 = 0. Still well below 1.

            const assignments = softAssign(point, centroids, 0.5);
            expect(assignments).toEqual([0]);
        });
    });
});
