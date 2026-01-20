/**
 * Rust CozoDB Boot Cache
 * 
 * localStorage-based cache for Rust CozoDB entities.
 * Enables sub-millisecond startup for Rust data.
 */

const CACHE_KEY = 'rustCozoBootCache';
const CACHE_VERSION = 1;
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface RustCozoBootCache {
    version: number;
    timestamp: number;
    nodeCount: number;
    edgeCount: number;
    // Lightweight entity list for scanner pre-warming
    entities: Array<{ id: string; label: string; kind: string }>;
}

/**
 * Load Rust Cozo boot cache from localStorage
 */
export function loadRustCozoBootCache(): RustCozoBootCache | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;

        const cache = JSON.parse(raw) as RustCozoBootCache;

        // Version mismatch
        if (cache.version !== CACHE_VERSION) {
            console.log('[RustCozoBootCache] Version mismatch, invalidating');
            localStorage.removeItem(CACHE_KEY);
            return null;
        }

        // Cache expired
        if (Date.now() - cache.timestamp > CACHE_MAX_AGE_MS) {
            console.log('[RustCozoBootCache] Cache expired, invalidating');
            localStorage.removeItem(CACHE_KEY);
            return null;
        }

        console.log(`[RustCozoBootCache] Loaded ${cache.nodeCount} nodes, ${cache.edgeCount} edges from cache`);
        return cache;
    } catch (e) {
        console.warn('[RustCozoBootCache] Failed to load:', e);
        return null;
    }
}

/**
 * Save Rust Cozo boot cache to localStorage
 */
export function saveRustCozoBootCache(
    entities: Array<{ id: string; label: string; kind: string }>,
    edgeCount: number = 0
): void {
    try {
        const cache: RustCozoBootCache = {
            version: CACHE_VERSION,
            timestamp: Date.now(),
            nodeCount: entities.length,
            edgeCount,
            entities
        };

        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        console.log(`[RustCozoBootCache] Saved ${entities.length} nodes, ${edgeCount} edges to cache`);
    } catch (e) {
        console.warn('[RustCozoBootCache] Failed to save:', e);
    }
}

/**
 * Build cache from KittCore export data
 */
export function buildRustCozoBootCache(exportJson: string | null): RustCozoBootCache | null {
    if (!exportJson) return null;

    try {
        const data = JSON.parse(exportJson);

        const nodes = data.nodes?.rows || [];
        const edges = data.edges?.rows || [];

        const entities = nodes.map((row: any[]) => ({
            id: row[0],
            label: row[1],
            kind: row[2]
        }));

        return {
            version: CACHE_VERSION,
            timestamp: Date.now(),
            nodeCount: entities.length,
            edgeCount: edges.length,
            entities
        };
    } catch (e) {
        console.warn('[RustCozoBootCache] Failed to build:', e);
        return null;
    }
}
