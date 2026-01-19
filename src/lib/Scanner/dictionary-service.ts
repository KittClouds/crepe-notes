/**
 * Dictionary Recompilation Service
 * 
 * Watches for entity changes and recompiles the dictionary (debounced).
 * Automatically saves to OPFS cache after recompilation.
 */

import { compileEntityDictionary, loadCompiledDictionary, type CompiledDictionary } from './dictionary-compiler';
import { saveTrieCache, loadTrieCache } from './trie-cache';
import { implicitScanner } from './ImplicitScanner';
import type { RegisteredEntity } from './types';

// =============================================================================
// State
// =============================================================================

let currentDictionary: CompiledDictionary | null = null;
let recompileTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingEntities: RegisteredEntity[] | null = null;

const RECOMPILE_DEBOUNCE_MS = 3000; // 3 seconds

// =============================================================================
// Public API
// =============================================================================

/**
 * Initialize from OPFS cache (called on app boot)
 * Returns true if cache was loaded, false if needs fresh compile
 */
export async function initFromCache(): Promise<boolean> {
    try {
        const cached = await loadTrieCache();
        if (!cached || !cached.trieData) {
            console.log('[DictionaryService] No cache, need fresh compile');
            return false;
        }

        currentDictionary = cached;
        console.log(`[DictionaryService] Loaded from cache: ${cached.phraseCount} phrases, ${cached.entityCount} entities`);
        return true;
    } catch (err) {
        console.error('[DictionaryService] Cache init failed:', err);
        return false;
    }
}

/**
 * Get current compiled dictionary
 */
export function getCurrentDictionary(): CompiledDictionary | null {
    return currentDictionary;
}

/**
 * Schedule recompilation (debounced)
 * Called when entities change
 */
export function scheduleRecompile(entities: RegisteredEntity[]): void {
    pendingEntities = entities;

    if (recompileTimeout) {
        clearTimeout(recompileTimeout);
    }

    recompileTimeout = setTimeout(() => {
        recompileTimeout = null;
        if (pendingEntities) {
            recompileNow(pendingEntities);
            pendingEntities = null;
        }
    }, RECOMPILE_DEBOUNCE_MS);

    console.log(`[DictionaryService] Recompile scheduled in ${RECOMPILE_DEBOUNCE_MS}ms`);
}

/**
 * Force immediate recompilation
 */
export async function recompileNow(entities: RegisteredEntity[]): Promise<CompiledDictionary> {
    // Cancel any pending debounce
    if (recompileTimeout) {
        clearTimeout(recompileTimeout);
        recompileTimeout = null;
    }

    console.log(`[DictionaryService] Recompiling ${entities.length} entities...`);
    const start = performance.now();

    // Compile
    const dictionary = compileEntityDictionary(entities);
    currentDictionary = dictionary;

    const compileTime = performance.now() - start;
    console.log(`[DictionaryService] Compiled in ${compileTime.toFixed(1)}ms`);

    // Save to OPFS (fire and forget)
    saveTrieCache(dictionary).catch(err => {
        console.warn('[DictionaryService] Cache save failed:', err);
    });

    // Notify scanner to use new dictionary
    notifyScannerDictionaryUpdated();

    return dictionary;
}

/**
 * Hydrate scanner from current dictionary
 */
export function hydrateScanner(entityVersion: number): void {
    if (!currentDictionary) {
        console.warn('[DictionaryService] No dictionary, cannot hydrate scanner');
        return;
    }

    // The scanner will need to accept compiled dictionary
    // For now, we still use the normal hydration path
    // This is a hook point for future optimization
    console.log(`[DictionaryService] Dictionary ready: ${currentDictionary.phraseCount} phrases`);
}

// =============================================================================
// Internal
// =============================================================================

function notifyScannerDictionaryUpdated(): void {
    // Future: directly inject compiled trie into worker
    // For now, this is a notification hook
    console.log('[DictionaryService] Scanner dictionary updated');
}
