import { AllProfanity } from 'allprofanity';
import type { DecorationSpan, EntityKind, RegisteredEntity } from './types';

const STOP = /^(mr|mrs|ms|dr|prof|sir|lady|lord|king|queen|the|of|and)$/i;

type Tok = { t: string; start: number; end: number };

function normalizeRaw(s: string): string {
    return s
        .toLowerCase()
        .replace(/[\u2019']/g, "'")
        .replace(/[^a-z0-9'\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenizeWithOffsets(text: string): Tok[] {
    const toks: Tok[] = [];
    const re = /[A-Za-z0-9']+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const raw = m[0];
        const t = normalizeRaw(raw);
        if (!t || STOP.test(t)) continue;
        toks.push({ t, start: m.index, end: m.index + raw.length });
    }
    return toks;
}

// Damerau-Levenshtein with early-exit cutoff (small + fast).
function dlWithin(a: string, b: string, max: number): boolean {
    if (a === b) return true;
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return false;

    // Small strings only; if huge, just bail conservative.
    if (la > 32 || lb > 32) return false;

    const dp: number[][] = Array.from({ length: la + 1 }, () => Array(lb + 1).fill(0));
    for (let i = 0; i <= la; i++) dp[i][0] = i;
    for (let j = 0; j <= lb; j++) dp[0][j] = j;

    for (let i = 1; i <= la; i++) {
        let rowMin = Number.POSITIVE_INFINITY;
        for (let j = 1; j <= lb; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            let v = Math.min(
                dp[i - 1][j] + 1,        // del
                dp[i][j - 1] + 1,        // ins
                dp[i - 1][j - 1] + cost  // sub
            );
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                v = Math.min(v, dp[i - 2][j - 2] + 1); // transpose
            }
            dp[i][j] = v;
            rowMin = Math.min(rowMin, v);
        }
        if (rowMin > max) return false;
    }
    return dp[la][lb] <= max;
}

function tokMatch(a: string, b: string): boolean {
    if (a === b) return true;
    const max =
        Math.max(a.length, b.length) <= 5 ? 1 :
            Math.max(a.length, b.length) <= 10 ? 2 : 2;
    return dlWithin(a, b, max);
}

type FuzzyEntity = {
    id: string;
    label: string;
    kind: EntityKind;
    tokens: string[];      // normalized, stop-words removed
    uniqueShort: string[]; // e.g. "monkey d" only if unique
    anchors: string[];     // rare tokens chosen at hydrate time
};

type FuzzyIndex = {
    entities: Map<string, FuzzyEntity>;
    anchorToIds: Map<string, string[]>;
    uniquePhraseToId: Map<string, string>; // "monkey d" -> entityId
    uniqueTokenToId: Map<string, string>;  // "luffy" -> entityId (only if unique)
};

function buildFuzzyIndex(reg: RegisteredEntity[]): FuzzyIndex {
    // 1) tokenize each label
    const tmp: { e: RegisteredEntity; tokens: string[] }[] = reg.map(e => {
        const toks = normalizeRaw(e.label).split(' ').filter(t => t && !STOP.test(t));
        return { e, tokens: toks };
    });

    // 2) token doc frequency
    const df = new Map<string, number>();
    for (const { tokens } of tmp) {
        const uniq = new Set(tokens);
        for (const t of uniq) df.set(t, (df.get(t) ?? 0) + 1);
    }

    // 3) build unique short forms map (2-grams) + unique token map (1-grams)
    const shortCounts = new Map<string, number>();
    const shortOwner = new Map<string, string>();

    const tokenCounts = new Map<string, number>();
    const tokenOwner = new Map<string, string>();

    function considerUniqueShort(phrase: string, id: string) {
        const k = normalizeRaw(phrase);
        if (!k) return;
        shortCounts.set(k, (shortCounts.get(k) ?? 0) + 1);
        if (!shortOwner.has(k)) shortOwner.set(k, id);
    }

    function considerUniqueToken(tok: string, id: string) {
        const k = normalizeRaw(tok);
        if (!k || STOP.test(k) || k.length < 3) return;
        tokenCounts.set(k, (tokenCounts.get(k) ?? 0) + 1);
        if (!tokenOwner.has(k)) tokenOwner.set(k, id);
    }

    for (const { e, tokens } of tmp) {
        if (tokens.length >= 2 && e.kind === "CHARACTER") {
            // first + last
            considerUniqueShort(`${tokens[0]} ${tokens[tokens.length - 1]}`, e.id);
            // first + middle-initial-ish (e.g. monkey d)
            considerUniqueShort(`${tokens[0]} ${tokens[1]}`, e.id);

            // single-token uniqueness: last name/token tends to be the useful shorthand (“luffy”)
            considerUniqueToken(tokens[tokens.length - 1], e.id);
            // optionally also first token (often too collision-prone, but uniqueness keeps it safe)
            considerUniqueToken(tokens[0], e.id);
        }
    }

    const uniquePhraseToId = new Map<string, string>();
    for (const [k, c] of shortCounts.entries()) {
        if (c === 1) uniquePhraseToId.set(k, shortOwner.get(k)!);
    }

    const uniqueTokenToId = new Map<string, string>();
    for (const [k, c] of tokenCounts.entries()) {
        if (c === 1) uniqueTokenToId.set(k, tokenOwner.get(k)!);
    }

    // 4) finalize entities + anchors (pick rarest 1–2 tokens)
    const entities = new Map<string, FuzzyEntity>();
    const anchorToIds = new Map<string, string[]>();

    // Precompute per-entity uniqueShort without scanning whole map per entity
    const idToUniqueShort = new Map<string, string[]>();
    for (const [phrase, id] of uniquePhraseToId.entries()) {
        const arr = idToUniqueShort.get(id) ?? [];
        arr.push(phrase);
        idToUniqueShort.set(id, arr);
    }

    for (const { e, tokens } of tmp) {
        const uniqTokens = [...new Set(tokens)];
        const sortedByRarity = uniqTokens.sort((a, b) => (df.get(a)! - df.get(b)!));
        const anchors = sortedByRarity.slice(0, 2); // 1–2 anchors

        const uniqueShort = idToUniqueShort.get(e.id) ?? [];
        const fe: FuzzyEntity = { id: e.id, label: e.label, kind: e.kind, tokens, uniqueShort, anchors };
        entities.set(e.id, fe);

        for (const a of anchors) {
            const arr = anchorToIds.get(a) ?? [];
            arr.push(e.id);
            anchorToIds.set(a, arr);
        }
    }

    return { entities, anchorToIds, uniquePhraseToId, uniqueTokenToId };
}

function scanFuzzy(
    text: string,
    idx: FuzzyIndex,
    _entityMap: Map<string, { id: string; label: string; kind: EntityKind }>
): DecorationSpan[] {
    const toks = tokenizeWithOffsets(text);
    if (toks.length === 0) return [];

    const spans: DecorationSpan[] = [];

    // Fast path A: unique single-token shorthands (e.g., "luffy") if unambiguous
    for (let i = 0; i < toks.length; i++) {
        const id = idx.uniqueTokenToId.get(toks[i].t);
        if (id) {
            const e = idx.entities.get(id);
            if (!e) continue;
            spans.push({
                type: 'entity_implicit',
                from: toks[i].start,
                to: toks[i].end,
                label: e.label,
                kind: e.kind,
                resolved: true
            });
        }
    }

    // Fast path B: unique short phrases like "monkey d" (2-grams)
    for (let i = 0; i + 1 < toks.length; i++) {
        const phrase = `${toks[i].t} ${toks[i + 1].t}`;
        const id = idx.uniquePhraseToId.get(phrase);
        if (id) {
            const e = idx.entities.get(id);
            if (!e) continue;
            spans.push({
                type: 'entity_implicit',
                from: toks[i].start,
                to: toks[i + 1].end,
                label: e.label,
                kind: e.kind,
                resolved: true
            });
        }
    }

    // Anchor-gated fuzzy matching
    const WINDOW = 4;

    for (let i = 0; i < toks.length; i++) {
        const hitIds = idx.anchorToIds.get(toks[i].t);
        if (!hitIds) continue;

        for (const id of hitIds) {
            const e = idx.entities.get(id);
            if (!e) continue;

            const lo = Math.max(0, i - WINDOW);
            const hi = Math.min(toks.length, i + WINDOW + 1);

            // Try best contiguous slice that MUST include the anchor position i.
            let best: { score: number; from: number; to: number } | null = null;

            for (let a = lo; a <= i; a++) {
                for (let b = i + 1; b <= hi; b++) {
                    const slice = toks.slice(a, b).map(x => x.t);
                    if (slice.length > e.tokens.length) continue;

                    let matches = 0;

                    // greedy order match: walk entity tokens in order
                    let p = 0;
                    for (const w of slice) {
                        for (; p < e.tokens.length; p++) {
                            if (tokMatch(w, e.tokens[p])) {
                                matches++;
                                p++;
                                break;
                            }
                        }
                    }

                    // Hard gates (tightness)
                    const needs = (e.kind === 'CHARACTER') ? 2 : 2;
                    if (matches < needs) continue;

                    // extra gate: if PERSON/CHARACTER, strongly prefer last-token match
                    const last = e.tokens[e.tokens.length - 1];
                    const hasLast = slice.some(w => tokMatch(w, last));
                    if (e.kind === 'CHARACTER' && !hasLast) continue;

                    const score = matches * 10 - Math.abs(e.tokens.length - slice.length) * 2;
                    if (!best || score > best.score) {
                        best = { score, from: toks[a].start, to: toks[b - 1].end };
                    }
                }
            }

            if (best) {
                spans.push({
                    type: 'entity_implicit',
                    from: best.from,
                    to: best.to,
                    label: e.label,
                    kind: e.kind,
                    resolved: true
                });
            }
        }
    }

    return spans;
}

// Helper for smart alias generation
function generateAliases(label: string, kind: EntityKind): string[] {
    const rawParts = label.split(/\s+/).filter(Boolean);
    if (rawParts.length <= 1) return [];

    const parts = rawParts.map(p => normalizeRaw(p)).filter(p => p && !STOP.test(p));
    if (parts.length <= 1) return [];

    const aliases: string[] = [];

    const first = parts[0];
    const last = parts[parts.length - 1];

    if (kind === 'CHARACTER') {
        if (first.length >= 3) aliases.push(first);
        if (last.length >= 3 && last !== first) aliases.push(last);
    } else if (kind === 'FACTION' || kind === 'ORGANIZATION') {
        // Keep acronym; last-token alias is allowed but will be dropped if ambiguous at hydrate-time.
        const acronym = parts
            .filter(p => p && !STOP.test(p))
            .map(p => p[0])
            .join('')
            .toUpperCase();

        if (acronym.length >= 2) aliases.push(acronym);

        if (last.length >= 3) aliases.push(last);
    }

    // De-dupe per-entity
    return [...new Set(aliases)];
}

type EntityInfo = { id: string; label: string; kind: EntityKind };
type PatternEntry = { surface: string; info: EntityInfo };

export class ImplicitCore {
    private filter: AllProfanity;

    // Exact match lookup: normalized(surface) -> entity info (only if unambiguous)
    private entityMap: Map<string, EntityInfo>;

    // Optional: keep track of patterns we intentionally dropped as ambiguous
    private ambiguousPatterns: Set<string>;

    private fuzzyIndex: FuzzyIndex | null = null;

    constructor() {
        this.filter = new AllProfanity({
            algorithm: { matching: 'aho-corasick' },
            performance: { enableCaching: true, cacheSize: 500 },
            // @ts-ignore - Types are outdated but this config works for v2.2
            profanityDetection: {
                enableLeetSpeak: false,
                caseSensitive: false,
                strictMode: true
            }
        });

        this.entityMap = new Map();
        this.ambiguousPatterns = new Set();
    }

    hydrate(entities: RegisteredEntity[]): void {
        this.filter.clearList();
        this.entityMap.clear();
        this.ambiguousPatterns.clear();

        // Build fuzzy index up front (also used for uniqueness fast paths)
        this.fuzzyIndex = buildFuzzyIndex(entities);

        // Two-phase: propose many patterns, then keep only unambiguous normalized keys.
        const normKeyToEntry = new Map<string, PatternEntry | null>();

        const offer = (surface: string, info: EntityInfo) => {
            const normKey = normalizeRaw(surface);
            if (!normKey) return;

            const existing = normKeyToEntry.get(normKey);
            if (!existing) {
                normKeyToEntry.set(normKey, { surface, info });
                return;
            }
            if (existing === null) return;

            if (existing.info.id !== info.id) {
                normKeyToEntry.set(normKey, null);
                this.ambiguousPatterns.add(normKey);
            }
            // else: same entity; keep first surface
        };

        for (const entity of entities) {
            const info: EntityInfo = { id: entity.id, label: entity.label, kind: entity.kind };

            // 1) Primary label (also offer normalized variant for punctuation-insensitive matching)
            offer(entity.label, info);
            const normLabel = normalizeRaw(entity.label);
            if (normLabel && normLabel !== normalizeRaw(entity.label)) {
                // (this condition is effectively redundant; kept harmless)
                offer(normLabel, info);
            } else {
                // still useful to explicitly offer normalized label as a surface form sometimes
                offer(normLabel, info);
            }

            // 2) Explicit aliases (plus normalized variants)
            for (const alias of entity.aliases || []) {
                offer(alias, info);
                offer(normalizeRaw(alias), info);
            }

            // 3) Smart aliases (plus normalized variants)
            for (const alias of generateAliases(entity.label, entity.kind)) {
                offer(alias, info);
                offer(normalizeRaw(alias), info);
            }
        }

        // Finalize dictionary + entityMap (only unambiguous)
        const dictionary: string[] = [];
        for (const [normKey, entry] of normKeyToEntry.entries()) {
            if (!entry) continue;
            if (this.ambiguousPatterns.has(normKey)) continue;

            this.entityMap.set(normKey, entry.info);
            dictionary.push(entry.surface);
        }

        if (dictionary.length > 0) {
            this.filter.loadCustomDictionary('entities', dictionary);
            this.filter.loadLanguage('entities');
        }
    }

    scan(text: string): DecorationSpan[] {
        if (!text) return [];

        let spans: DecorationSpan[] = [];

        // 1) Exact match (AllProfanity strictMode handles word boundaries)
        const result = this.filter.detect(text);
        if (result.hasProfanity) {
            for (const match of result.positions) {
                if (match.start < 0 || match.end > text.length) continue;

                // Normalize the matched surface before lookup (handles casing/punct differences)
                const key = normalizeRaw(match.word);
                const info = this.entityMap.get(key);
                if (!info) continue;

                spans.push({
                    type: 'entity_implicit',
                    from: match.start,
                    to: match.end,
                    label: info.label,
                    kind: info.kind,
                    resolved: true
                });
            }
        }

        // 2) Fuzzy match (two-stage gated)
        if (this.fuzzyIndex) {
            spans.push(...scanFuzzy(text, this.fuzzyIndex, this.entityMap));
        }

        return this.deduplicate(spans);
    }

    scanBatch(items: { id: number; text: string }[]): Map<number, DecorationSpan[]> {
        const results = new Map<number, DecorationSpan[]>();
        for (const item of items) {
            const spans = this.scan(item.text);
            if (spans.length > 0) results.set(item.id, spans);
        }
        return results;
    }

    private deduplicate(spans: DecorationSpan[]): DecorationSpan[] {
        spans.sort((a, b) => a.from - b.from);
        const result: DecorationSpan[] = [];
        if (spans.length === 0) return result;

        let current = spans[0];

        for (let i = 1; i < spans.length; i++) {
            const next = spans[i];

            // overlap: keep longer
            if (next.from < current.to) {
                const currentLen = current.to - current.from;
                const nextLen = next.to - next.from;
                if (nextLen > currentLen) current = next;
            } else {
                result.push(current);
                current = next;
            }
        }

        result.push(current);
        return result;
    }
}
