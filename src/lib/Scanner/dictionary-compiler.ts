/**
 * Dictionary Compiler - Pre-compile entity dictionaries for instant load
 * 
 * Uses cspell-trie-lib to compile entities into a serialized trie format.
 * Compiled trie is stored in OPFS for instant loading on next boot.
 */

import { buildTrie, serializeTrie, importTrie, Trie } from 'cspell-trie-lib';
import type { RegisteredEntity, EntityKind } from './types';

// =============================================================================
// Types
// =============================================================================

export interface CompiledDictionary {
    version: number;
    entityCount: number;
    phraseCount: number;
    compiledAt: number;
    trieData: string;
    phraseMap: [string, PhraseEntity[]][];
}

interface PhraseEntity {
    id: string;
    label: string;
    kind: EntityKind;
}

// =============================================================================
// Auto-Alias Generation (same logic as dafsa-scan.ts)
// =============================================================================

const STOP_WORDS = /^(mr|mrs|ms|dr|prof|sir|lady|lord|king|queen|the|of|and|a|an)$/i;

function normalizePhrase(s: string): string {
    return s
        .toLowerCase()
        .replace(/[\u2019']/g, "'")
        .replace(/[^a-z0-9'\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function generateAutoAliases(label: string, kind: EntityKind): string[] {
    const normalized = normalizePhrase(label);
    const tokens = normalized.split(' ').filter(t => t && !STOP_WORDS.test(t));

    if (tokens.length <= 1) return [];

    const aliases: string[] = [];
    const first = tokens[0];
    const last = tokens[tokens.length - 1];

    // Last token alone
    if (last.length >= 3) {
        aliases.push(last);
    }

    // First + Last
    if (tokens.length >= 3 && first !== last) {
        aliases.push(`${first} ${last}`);
    }

    // First token alone if substantial
    if (first.length >= 4 && first !== last) {
        aliases.push(first);
    }

    // For factions: acronym
    if (kind === 'FACTION' || kind === 'ORGANIZATION') {
        const acronym = tokens.filter(t => t.length > 0).map(t => t[0]).join('');
        if (acronym.length >= 2 && acronym.length <= 5) {
            aliases.push(acronym);
        }
    }

    return [...new Set(aliases)];
}

// =============================================================================
// Compiler
// =============================================================================

const MAX_PHRASE_TOKENS = 4;

/**
 * Compile entities into a pre-built trie dictionary
 */
export function compileEntityDictionary(entities: RegisteredEntity[]): CompiledDictionary {
    const phraseMap = new Map<string, PhraseEntity[]>();
    const allPhrases: string[] = [];

    for (const entity of entities) {
        const entityInfo: PhraseEntity = {
            id: entity.id,
            label: entity.label,
            kind: entity.kind,
        };

        // All phrases to register for this entity
        const phrasesToAdd: string[] = [entity.label];

        // Explicit aliases
        if (entity.aliases) {
            phrasesToAdd.push(...entity.aliases);
        }

        // Auto-generated aliases
        const autoAliases = generateAutoAliases(entity.label, entity.kind);
        phrasesToAdd.push(...autoAliases);

        // Normalize and add each phrase
        for (const phrase of phrasesToAdd) {
            const normalized = normalizePhrase(phrase);
            if (!normalized) continue;

            // Check token count
            const tokenCount = normalized.split(' ').filter(t => t && !STOP_WORDS.test(t)).length;
            if (tokenCount === 0 || tokenCount > MAX_PHRASE_TOKENS) continue;

            // Add to phrase map
            const existing = phraseMap.get(normalized);
            if (existing) {
                if (!existing.some(e => e.id === entityInfo.id)) {
                    existing.push(entityInfo);
                }
            } else {
                phraseMap.set(normalized, [entityInfo]);
                allPhrases.push(normalized);
            }
        }
    }

    // Build and serialize trie
    let trieData = '';
    if (allPhrases.length > 0) {
        const trie = buildTrie(allPhrases);
        trieData = serializeTrie(trie.root, { base: 32 });
    }

    console.log(`[DictionaryCompiler] Compiled ${allPhrases.length} phrases from ${entities.length} entities`);

    return {
        version: Date.now(),
        entityCount: entities.length,
        phraseCount: allPhrases.length,
        compiledAt: Date.now(),
        trieData,
        phraseMap: Array.from(phraseMap.entries()),
    };
}

/**
 * Load a compiled dictionary into a Trie
 */
export function loadCompiledDictionary(compiled: CompiledDictionary): {
    trie: Trie;
    phraseMap: Map<string, PhraseEntity[]>;
} {
    const root = importTrie(compiled.trieData);
    const trie = new Trie(root);
    const phraseMap = new Map(compiled.phraseMap);

    console.log(`[DictionaryCompiler] Loaded ${compiled.phraseCount} phrases`);

    return { trie, phraseMap };
}
