/**
 * Trie Cache - OPFS persistence for compiled entity dictionaries
 * 
 * Stores pre-compiled trie in Origin Private File System for instant boot.
 */

import type { CompiledDictionary } from './dictionary-compiler';

const CACHE_FILENAME = 'entity-dictionary.json';
const CACHE_DIR = 'scanner-cache';

// =============================================================================
// OPFS Helpers
// =============================================================================

async function getOPFSDirectory(): Promise<FileSystemDirectoryHandle | null> {
    try {
        const root = await navigator.storage.getDirectory();
        return await root.getDirectoryHandle(CACHE_DIR, { create: true });
    } catch (err) {
        console.warn('[TrieCache] OPFS not available:', err);
        return null;
    }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Save compiled dictionary to OPFS
 */
export async function saveTrieCache(dictionary: CompiledDictionary): Promise<boolean> {
    try {
        const dir = await getOPFSDirectory();
        if (!dir) return false;

        const file = await dir.getFileHandle(CACHE_FILENAME, { create: true });
        const writable = await file.createWritable();

        const json = JSON.stringify(dictionary);
        await writable.write(json);
        await writable.close();

        console.log(`[TrieCache] Saved ${dictionary.phraseCount} phrases to OPFS`);
        return true;
    } catch (err) {
        console.error('[TrieCache] Save failed:', err);
        return false;
    }
}

/**
 * Load compiled dictionary from OPFS
 */
export async function loadTrieCache(): Promise<CompiledDictionary | null> {
    try {
        const dir = await getOPFSDirectory();
        if (!dir) return null;

        const file = await dir.getFileHandle(CACHE_FILENAME);
        const blob = await file.getFile();
        const json = await blob.text();

        const dictionary: CompiledDictionary = JSON.parse(json);

        console.log(`[TrieCache] Loaded ${dictionary.phraseCount} phrases from OPFS (compiled ${new Date(dictionary.compiledAt).toLocaleString()})`);
        return dictionary;
    } catch (err) {
        // File doesn't exist yet - normal on first run
        if ((err as any)?.name !== 'NotFoundError') {
            console.warn('[TrieCache] Load failed:', err);
        }
        return null;
    }
}

/**
 * Clear the trie cache
 */
export async function clearTrieCache(): Promise<void> {
    try {
        const dir = await getOPFSDirectory();
        if (!dir) return;

        await dir.removeEntry(CACHE_FILENAME);
        console.log('[TrieCache] Cleared');
    } catch (err) {
        // Ignore if file doesn't exist
    }
}

/**
 * Check if cache exists and is recent
 */
export async function isCacheValid(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<boolean> {
    try {
        const dictionary = await loadTrieCache();
        if (!dictionary) return false;

        const age = Date.now() - dictionary.compiledAt;
        return age < maxAgeMs;
    } catch {
        return false;
    }
}
