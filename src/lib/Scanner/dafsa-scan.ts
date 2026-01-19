/**
 * DAFSA-based Entity Scanner
 * 
 * Uses cspell-trie-lib for efficient token-boundary matching.
 * Alternative to AllProfanity's Aho-Corasick for A/B testing.
 * 
 * Features:
 * - Token-boundary matching
 * - Auto-generated aliases (last name, first+last, etc.)
 * - Possessive handling ("Luffy's" → "Luffy")
 * - Pre-compiled trie serializable to NebulaDB
 */

import { buildTrie, Trie, serializeTrie, importTrie, type TrieNode } from 'cspell-trie-lib';
import type { DecorationSpan, EntityKind, RegisteredEntity } from './types';

// =============================================================================
// Constants
// =============================================================================

const MAX_PHRASE_LENGTH = 4; // Max tokens per entity name
const STOP_WORDS = /^(mr|mrs|ms|dr|prof|sir|lady|lord|king|queen|the|of|and|a|an)$/i;

// Possessive suffixes to strip during lookup
const POSSESSIVE_SUFFIXES = ["'s", "'s", "s'", "'"];

// =============================================================================
// Types
// =============================================================================

type EntityInfo = {
    id: string;
    label: string;
    kind: EntityKind;
};

type Token = {
    t: string;      // normalized token
    raw: string;    // original text (for possessive detection)
    start: number;  // byte offset in original text
    end: number;    // byte offset in original text
};

type PhraseMatch = {
    phrase: string;
    from: number;
    to: number;
    entityInfos: EntityInfo[];
};

// =============================================================================
// Normalization
// =============================================================================

function normalizeRaw(s: string): string {
    return s
        .toLowerCase()
        .replace(/[\u2019']/g, "'")
        .replace(/[^a-z0-9'\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Strip possessive suffixes from a token
 * "luffy's" → "luffy", "luffys" → "luffy"
 */
function stripPossessive(token: string): string {
    const lower = token.toLowerCase();

    // Check explicit possessive suffixes
    for (const suffix of POSSESSIVE_SUFFIXES) {
        if (lower.endsWith(suffix)) {
            return lower.slice(0, -suffix.length);
        }
    }

    // Trailing 's' that looks like possessive (e.g., "luffys")
    if (lower.endsWith('s') && lower.length > 3) {
        return lower.slice(0, -1);
    }

    return lower;
}

function tokenizeWithOffsets(text: string): Token[] {
    const tokens: Token[] = [];
    const re = /[A-Za-z0-9']+/g;
    let m: RegExpExecArray | null;

    while ((m = re.exec(text)) !== null) {
        const raw = m[0];
        const t = normalizeRaw(raw);
        if (!t || STOP_WORDS.test(t)) continue;
        tokens.push({ t, raw, start: m.index, end: m.index + raw.length });
    }

    return tokens;
}

// =============================================================================
// Fuzzy Matching (Damerau-Levenshtein)
// =============================================================================

/**
 * Damerau-Levenshtein distance with early-exit cutoff.
 * Returns true if distance <= max.
 */
function dlWithin(a: string, b: string, max: number): boolean {
    if (a === b) return true;
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return false;

    // Bail on long strings
    if (la > 32 || lb > 32) return false;

    const dp: number[][] = Array.from({ length: la + 1 }, () => Array(lb + 1).fill(0));
    for (let i = 0; i <= la; i++) dp[i][0] = i;
    for (let j = 0; j <= lb; j++) dp[0][j] = j;

    for (let i = 1; i <= la; i++) {
        let rowMin = Number.POSITIVE_INFINITY;
        for (let j = 1; j <= lb; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            let v = Math.min(
                dp[i - 1][j] + 1,        // deletion
                dp[i][j - 1] + 1,        // insertion
                dp[i - 1][j - 1] + cost  // substitution
            );
            // Transposition
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                v = Math.min(v, dp[i - 2][j - 2] + 1);
            }
            dp[i][j] = v;
            rowMin = Math.min(rowMin, v);
        }
        if (rowMin > max) return false; // Early exit
    }
    return dp[la][lb] <= max;
}

/**
 * Check if two tokens match with fuzzy tolerance.
 * Short tokens (<=5 chars): max 1 edit
 * Longer tokens: max 2 edits
 */
function tokMatch(a: string, b: string): boolean {
    if (a === b) return true;
    const max = Math.max(a.length, b.length) <= 5 ? 1 : 2;
    return dlWithin(a, b, max);
}

/**
 * Check if a phrase fuzzy-matches an entity's token sequence.
 */
function fuzzyPhraseMatch(inputTokens: string[], entityTokens: string[]): boolean {
    if (inputTokens.length !== entityTokens.length) return false;
    for (let i = 0; i < inputTokens.length; i++) {
        if (!tokMatch(inputTokens[i], entityTokens[i])) return false;
    }
    return true;
}

// Fuzzy index types
type FuzzyIndex = {
    // Anchor tokens (rare) → entity IDs for candidate filtering
    anchorToIds: Map<string, string[]>;
    // Unique single tokens → direct entity ID
    uniqueTokenToId: Map<string, string>;
    // Entity ID → its token array
    entityTokens: Map<string, string[]>;
};

// =============================================================================
// Auto-Alias Generation
// =============================================================================

/**
 * Generate smart aliases for an entity name
 * "Monkey D. Luffy" → ["luffy", "monkey luffy", "d luffy"]
 */
function generateAutoAliases(label: string, kind: EntityKind): string[] {
    const normalized = normalizeRaw(label);
    const tokens = normalized.split(' ').filter(t => t && !STOP_WORDS.test(t));

    if (tokens.length <= 1) return [];

    const aliases: string[] = [];
    const first = tokens[0];
    const last = tokens[tokens.length - 1];

    // For CHARACTER entities: last name is usually the shorthand
    if (kind === 'CHARACTER') {
        // Last token alone (e.g., "Luffy")
        if (last.length >= 3) {
            aliases.push(last);
        }

        // First + Last (e.g., "Monkey Luffy" from "Monkey D. Luffy")
        if (tokens.length >= 3 && first !== last) {
            aliases.push(`${first} ${last}`);
        }

        // Second-to-last + Last for middle initials (e.g., "D Luffy")
        if (tokens.length >= 3) {
            const secondLast = tokens[tokens.length - 2];
            if (secondLast.length <= 2) { // Likely an initial
                aliases.push(`${secondLast} ${last}`);
            }
        }

        // First token alone if it's substantial
        if (first.length >= 4 && first !== last) {
            aliases.push(first);
        }
    }

    // For FACTION/ORGANIZATION: try acronyms
    if (kind === 'FACTION' || kind === 'ORGANIZATION') {
        const acronym = tokens
            .filter(t => t.length > 0)
            .map(t => t[0])
            .join('');

        if (acronym.length >= 2 && acronym.length <= 5) {
            aliases.push(acronym);
        }

        // Last word (e.g., "Pirates" from "Straw Hat Pirates")
        if (last.length >= 4) {
            aliases.push(last);
        }
    }

    // For LOCATION: first distinct word
    if (kind === 'LOCATION') {
        if (first.length >= 4) {
            aliases.push(first);
        }
    }

    // Dedupe
    return [...new Set(aliases)];
}

// =============================================================================
// DAFSA Core
// =============================================================================

export class DAFSACore {
    private trie: Trie | null = null;
    private phraseToEntities: Map<string, EntityInfo[]> = new Map();
    private serializedTrie: string | null = null;

    // Fuzzy matching index
    private fuzzyIndex: FuzzyIndex = {
        anchorToIds: new Map(),
        uniqueTokenToId: new Map(),
        entityTokens: new Map(),
    };

    // Enable/disable fuzzy matching
    public fuzzyEnabled: boolean = true;

    /**
     * Hydrate the scanner with entities.
     * Builds a DAFSA from normalized entity phrases + auto-aliases + fuzzy index.
     */
    hydrate(entities: RegisteredEntity[]): void {
        this.phraseToEntities.clear();
        this.fuzzyIndex = {
            anchorToIds: new Map(),
            uniqueTokenToId: new Map(),
            entityTokens: new Map(),
        };

        const phrases: string[] = [];
        let autoAliasCount = 0;

        // For fuzzy: track token document frequency
        const tokenDf = new Map<string, number>();
        const tokenOwner = new Map<string, string>(); // for unique token detection

        for (const entity of entities) {
            const info: EntityInfo = {
                id: entity.id,
                label: entity.label,
                kind: entity.kind,
            };

            // Primary: full label
            this.addPhrase(entity.label, info, phrases);

            // Explicit aliases from entity
            for (const alias of entity.aliases || []) {
                this.addPhrase(alias, info, phrases);
            }

            // Auto-generated aliases
            const autoAliases = generateAutoAliases(entity.label, entity.kind);
            for (const alias of autoAliases) {
                this.addPhrase(alias, info, phrases);
                autoAliasCount++;
            }

            // Build fuzzy index: tokenize the label
            const labelTokens = normalizeRaw(entity.label)
                .split(' ')
                .filter(t => t && !STOP_WORDS.test(t));

            this.fuzzyIndex.entityTokens.set(entity.id, labelTokens);

            // Track token frequency for anchor selection
            const uniqueToks = new Set(labelTokens);
            for (const t of uniqueToks) {
                tokenDf.set(t, (tokenDf.get(t) ?? 0) + 1);
                if (!tokenOwner.has(t)) tokenOwner.set(t, entity.id);
            }
        }

        // Build unique token map (tokens appearing in exactly one entity)
        for (const [tok, count] of tokenDf.entries()) {
            if (count === 1) {
                this.fuzzyIndex.uniqueTokenToId.set(tok, tokenOwner.get(tok)!);
            }
        }

        // Build anchor index (pick rarest 1-2 tokens per entity)
        for (const entity of entities) {
            const toks = this.fuzzyIndex.entityTokens.get(entity.id) || [];
            const sorted = [...new Set(toks)].sort((a, b) => (tokenDf.get(a)! - tokenDf.get(b)!));
            const anchors = sorted.slice(0, 2);

            for (const anchor of anchors) {
                const arr = this.fuzzyIndex.anchorToIds.get(anchor) || [];
                arr.push(entity.id);
                this.fuzzyIndex.anchorToIds.set(anchor, arr);
            }
        }

        // Build trie from all phrases
        if (phrases.length > 0) {
            this.trie = buildTrie(phrases);
            // Cache serialized form for persistence
            this.serializedTrie = serializeTrie(this.trie.root, { base: 32 });
        } else {
            this.trie = null;
            this.serializedTrie = null;
        }

        console.log(`[DAFSACore] Hydrated: ${phrases.length} phrases (${autoAliasCount} auto-aliases), ${this.fuzzyIndex.uniqueTokenToId.size} unique tokens, ${this.fuzzyIndex.anchorToIds.size} anchors`);
    }

    /**
     * Restore trie from serialized form (from NebulaDB cache)
     */
    restore(serialized: string, phraseMap: Map<string, EntityInfo[]>): boolean {
        try {
            const root = importTrie(serialized);
            this.trie = new Trie(root);
            this.phraseToEntities = phraseMap;
            console.log('[DAFSACore] Restored from serialized trie');
            return true;
        } catch (err) {
            console.error('[DAFSACore] Failed to restore:', err);
            return false;
        }
    }

    /**
     * Get serialized trie for caching
     */
    getSerialized(): { trie: string; phraseMap: [string, EntityInfo[]][] } | null {
        if (!this.serializedTrie) return null;
        return {
            trie: this.serializedTrie,
            phraseMap: Array.from(this.phraseToEntities.entries()),
        };
    }

    /**
     * Scan text for entity mentions.
     * Uses sliding window over tokens, checking trie for matches.
     * Falls back to fuzzy matching via anchor tokens + DL distance.
     */
    scan(text: string): DecorationSpan[] {
        if (!text || !this.trie) return [];

        const tokens = tokenizeWithOffsets(text);
        if (tokens.length === 0) return [];

        const matches: PhraseMatch[] = [];
        const matchedPositions = new Set<string>(); // Track matched positions to avoid duplicates

        // Sliding window: try phrases of length 1 to MAX_PHRASE_LENGTH
        for (let i = 0; i < tokens.length; i++) {
            let phrase = '';
            let strippedPhrase = '';
            let foundExact = false;

            for (let j = i; j < Math.min(i + MAX_PHRASE_LENGTH, tokens.length); j++) {
                const token = tokens[j].t;
                const strippedToken = stripPossessive(token);

                // Build phrase incrementally (normal and stripped versions)
                phrase = phrase ? `${phrase} ${token}` : token;
                strippedPhrase = strippedPhrase ? `${strippedPhrase} ${strippedToken}` : strippedToken;

                const posKey = `${tokens[i].start}:${tokens[j].end}`;

                // Try exact match first
                if (this.trie.has(phrase)) {
                    const entityInfos = this.phraseToEntities.get(phrase);
                    if (entityInfos && entityInfos.length > 0) {
                        matches.push({
                            phrase,
                            from: tokens[i].start,
                            to: tokens[j].end,
                            entityInfos,
                        });
                        matchedPositions.add(posKey);
                        foundExact = true;
                    }
                }
                // Try stripped (possessive-removed) version as fallback
                else if (strippedPhrase !== phrase && this.trie.has(strippedPhrase)) {
                    const entityInfos = this.phraseToEntities.get(strippedPhrase);
                    if (entityInfos && entityInfos.length > 0) {
                        matches.push({
                            phrase: strippedPhrase,
                            from: tokens[i].start,
                            to: tokens[j].end,
                            entityInfos,
                        });
                        matchedPositions.add(posKey);
                        foundExact = true;
                    }
                }
            }

            // Fuzzy matching fallback for single tokens (if enabled and no exact match)
            if (this.fuzzyEnabled && !foundExact) {
                const token = tokens[i].t;
                const stripped = stripPossessive(token);
                const posKey = `${tokens[i].start}:${tokens[i].end}`;

                if (!matchedPositions.has(posKey) && token.length >= 3) {
                    const fuzzyMatch = this.fuzzyMatchToken(token, stripped);
                    if (fuzzyMatch) {
                        matches.push({
                            phrase: fuzzyMatch.label,
                            from: tokens[i].start,
                            to: tokens[i].end,
                            entityInfos: [fuzzyMatch],
                        });
                        matchedPositions.add(posKey);
                    }
                }
            }
        }

        // Prefer longer matches, deduplicate overlapping
        const spans = this.resolveMatches(matches, text);
        return spans;
    }

    /**
     * Try fuzzy match for a single token.
     * 1. Check unique token map (exact match)
     * 2. Check anchors + verify with DL distance
     */
    private fuzzyMatchToken(token: string, stripped: string): EntityInfo | null {
        // 1. Direct unique token lookup
        let entityId = this.fuzzyIndex.uniqueTokenToId.get(token);
        if (!entityId) {
            entityId = this.fuzzyIndex.uniqueTokenToId.get(stripped);
        }

        if (entityId) {
            const entityToks = this.fuzzyIndex.entityTokens.get(entityId);
            // Only match if the token is the sole token OR fuzzy matches one
            if (entityToks && entityToks.length === 1) {
                return this.getEntityInfoById(entityId);
            }
        }

        // 2. Anchor-based fuzzy lookup
        const candidates = this.fuzzyIndex.anchorToIds.get(token)
            || this.fuzzyIndex.anchorToIds.get(stripped)
            || [];

        for (const candId of candidates) {
            const entityToks = this.fuzzyIndex.entityTokens.get(candId);
            if (entityToks && entityToks.length === 1) {
                // Single-token entity - verify with fuzzy match
                if (tokMatch(token, entityToks[0]) || tokMatch(stripped, entityToks[0])) {
                    return this.getEntityInfoById(candId);
                }
            }
        }

        return null;
    }

    /**
     * Get EntityInfo by entity ID (for fuzzy matching)
     */
    private getEntityInfoById(entityId: string): EntityInfo | null {
        // Search phraseToEntities for entity info
        for (const infos of this.phraseToEntities.values()) {
            const found = infos.find(i => i.id === entityId);
            if (found) return found;
        }
        return null;
    }

    /**
     * Batch scan multiple texts
     */
    scanBatch(items: { id: number; text: string }[]): Map<number, DecorationSpan[]> {
        const results = new Map<number, DecorationSpan[]>();
        for (const item of items) {
            const spans = this.scan(item.text);
            if (spans.length > 0) {
                results.set(item.id, spans);
            }
        }
        return results;
    }

    // =========================================================================
    // Private Helpers
    // =========================================================================

    private addPhrase(surface: string, info: EntityInfo, phrases: string[]): void {
        const normalized = normalizeRaw(surface);
        if (!normalized) return;

        // Check token count
        const tokenCount = normalized.split(' ').filter(t => t && !STOP_WORDS.test(t)).length;
        if (tokenCount === 0 || tokenCount > MAX_PHRASE_LENGTH) return;

        // Track in phrase map
        const existing = this.phraseToEntities.get(normalized);
        if (existing) {
            if (!existing.some(e => e.id === info.id)) {
                existing.push(info);
            }
        } else {
            this.phraseToEntities.set(normalized, [info]);
            phrases.push(normalized);
        }
    }

    private resolveMatches(matches: PhraseMatch[], text: string): DecorationSpan[] {
        if (matches.length === 0) return [];

        // Sort by start position, then by length (longer first)
        matches.sort((a, b) => {
            if (a.from !== b.from) return a.from - b.from;
            return (b.to - b.from) - (a.to - a.from); // Longer first
        });

        const result: DecorationSpan[] = [];
        let lastEnd = -1;

        for (const match of matches) {
            // Skip if this overlaps with a previously accepted match
            if (match.from < lastEnd) continue;

            const entityInfos = match.entityInfos;

            if (entityInfos.length === 1) {
                // Unambiguous match
                const info = entityInfos[0];
                result.push({
                    type: 'entity_implicit',
                    from: match.from,
                    to: match.to,
                    label: info.label,
                    matchedText: text.slice(match.from, match.to),
                    kind: info.kind,
                    resolved: true,
                    entityId: info.id,
                });
            } else {
                // Ambiguous match - multiple entities share this phrase
                result.push({
                    type: 'entity_implicit',
                    from: match.from,
                    to: match.to,
                    label: text.slice(match.from, match.to),
                    matchedText: text.slice(match.from, match.to),
                    kind: entityInfos[0].kind,
                    resolved: false,
                    candidateIds: entityInfos.map(e => e.id),
                    candidateLabels: entityInfos.map(e => e.label),
                });
            }

            lastEnd = match.to;
        }

        return result;
    }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const dafsaCore = new DAFSACore();
