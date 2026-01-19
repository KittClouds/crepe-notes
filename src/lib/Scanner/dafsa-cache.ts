/**
 * DAFSA Cache - Persist compiled trie to NebulaDB for fast boot
 */

import { scannerCache } from '@/lib/nebuladb/db';
import { DAFSACore } from './dafsa-scan';

const CACHE_KEY = 'dafsa-trie-v1';

type CacheEntry = {
    id: string;
    version: number;
    trieData: string;
    phraseMap: [string, { id: string; label: string; kind: string }[]][];
    entityCount: number;
    createdAt: number;
};

/**
 * Save compiled DAFSA trie to NebulaDB
 */
export async function saveDafsaCache(
    core: DAFSACore,
    entityVersion: number
): Promise<boolean> {
    try {
        const serialized = core.getSerialized();
        if (!serialized) return false;

        const entry: CacheEntry = {
            id: CACHE_KEY,
            version: entityVersion,
            trieData: serialized.trie,
            phraseMap: serialized.phraseMap,
            entityCount: serialized.phraseMap.length,
            createdAt: Date.now(),
        };

        await scannerCache.upsert(entry as any);
        console.log(`[DAFSACache] Saved trie (${serialized.phraseMap.length} phrases)`);
        return true;
    } catch (err) {
        console.error('[DAFSACache] Save failed:', err);
        return false;
    }
}

/**
 * Load cached DAFSA trie from NebulaDB
 */
export async function loadDafsaCache(
    core: DAFSACore,
    expectedVersion: number
): Promise<boolean> {
    try {
        const entries = await scannerCache.find({ id: CACHE_KEY });
        if (entries.length === 0) {
            console.log('[DAFSACache] No cache found');
            return false;
        }

        const entry = entries[0] as unknown as CacheEntry;

        // Version mismatch - stale cache
        if (entry.version !== expectedVersion) {
            console.log(`[DAFSACache] Stale (v${entry.version} != v${expectedVersion})`);
            return false;
        }

        // Restore trie
        const phraseMap = new Map(entry.phraseMap);
        const success = core.restore(entry.trieData, phraseMap as any);

        if (success) {
            console.log(`[DAFSACache] Restored from cache (${entry.entityCount} phrases)`);
        }

        return success;
    } catch (err) {
        console.error('[DAFSACache] Load failed:', err);
        return false;
    }
}

/**
 * Clear DAFSA cache
 */
export async function clearDafsaCache(): Promise<void> {
    try {
        await scannerCache.delete({ id: CACHE_KEY });
        console.log('[DAFSACache] Cleared');
    } catch (err) {
        console.error('[DAFSACache] Clear failed:', err);
    }
}
