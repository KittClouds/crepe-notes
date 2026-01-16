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

// Collapse overlapping fuzzy spans into ambiguous ones
function collapseAmbiguousSameRange(spans: DecorationSpan[], text: string): DecorationSpan[] {
    const byKey = new Map<string, DecorationSpan[]>();
    for (const s of spans) {
        const k = `${s.from}:${s.to}`;
        const arr = byKey.get(k) ?? [];
        arr.push(s);
        byKey.set(k, arr);
    }

    const out: DecorationSpan[] = [];
    for (const arr of byKey.values()) {
        if (arr.length === 1) { out.push(arr[0]); continue; }

        const candidateIds = arr.map(a => a.entityId).filter(Boolean) as string[];
        const candidateLabels = arr.map(a => a.label);

        out.push({
            type: 'entity_implicit',
            from: arr[0].from,
            to: arr[0].to,
            label: text.slice(arr[0].from, arr[0].to),
            kind: arr[0].kind,
            resolved: false,
            candidateIds,
            candidateLabels
        });
    }
    return out;
}

function scanFuzzy(
    text: string,
    idx: FuzzyIndex,
    entityMap: Map<string, EntityInfo[]> // Updated to match ImplicitCore's map type, though we might only need simple lookup
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
                resolved: true,
                entityId: e.id
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
                resolved: true,
                entityId: e.id
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
                    resolved: true,
                    entityId: e.id
                });
            }
        }
    }

    return collapseAmbiguousSameRange(spans, text);
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
        const acronym = parts
            .filter(p => p && !STOP.test(p))
            .map(p => p[0])
            .join('')
            .toUpperCase();

        if (acronym.length >= 2) aliases.push(acronym);
        if (last.length >= 3) aliases.push(last);
    }

    return [...new Set(aliases)];
}

export type DisambigOptions = {
    windowTokens?: number;     // context window on each side
    delta?: number;            // required margin between best and 2nd best
    minScore?: number;         // minimum best score to resolve
    wAnchor?: number;          // weight for anchor hits
    wOverlap?: number;         // weight for token overlap
    wPrior?: number;           // weight for priors
};

function spanTokenWindow(toks: Tok[], from: number, to: number, w: number): Tok[] {
    let lo = toks.findIndex(t => t.end > from);
    if (lo < 0) lo = toks.length;
    let hi = lo;
    while (hi < toks.length && toks[hi].start < to) hi++;

    const a = Math.max(0, lo - w);
    const b = Math.min(toks.length, hi + w);
    return toks.slice(a, b);
}

function scoreCandidate(
    cand: FuzzyEntity,
    win: Tok[],
    priors?: Map<string, number>,
    opt?: DisambigOptions
): number {
    const o = opt ?? {};
    const wAnchor = o.wAnchor ?? 6;
    const wOverlap = o.wOverlap ?? 2;
    const wPrior = o.wPrior ?? 4;

    const winSet = new Set(win.map(t => t.t));

    let anchorHits = 0;
    for (const a of cand.anchors) if (winSet.has(a)) anchorHits++;

    let overlap = 0;
    for (const t of cand.tokens) if (winSet.has(t)) overlap++;

    const prior = priors?.get(cand.id) ?? 0;

    return anchorHits * wAnchor + overlap * wOverlap + prior * wPrior;
}

export function disambiguateSpans(
    text: string,
    spans: DecorationSpan[],
    idx: FuzzyIndex,
    priors?: Map<string, number>,
    opt?: DisambigOptions
): DecorationSpan[] {
    const windowTokens = opt?.windowTokens ?? 8;
    const delta = opt?.delta ?? 3;
    const minScore = opt?.minScore ?? 8;

    const toks = tokenizeWithOffsets(text);
    if (toks.length === 0) return spans;

    return spans.map(span => {
        if (span.type !== 'entity_implicit') return span;
        if (span.resolved !== false) return span;
        if (!span.candidateIds || span.candidateIds.length < 2) return span;

        const win = spanTokenWindow(toks, span.from, span.to, windowTokens);

        const scored: { id: string; score: number; e: FuzzyEntity }[] = [];
        for (const id of span.candidateIds) {
            const e = idx.entities.get(id);
            if (!e) continue;
            scored.push({ id, score: scoreCandidate(e, win, priors, opt), e });
        }
        if (scored.length < 2) return span;

        scored.sort((a, b) => b.score - a.score);
        const best = scored[0];
        const second = scored[1];

        if (best.score < minScore) return span;
        if (best.score - second.score < delta) return span;

        return {
            ...span,
            resolved: true,
            entityId: best.id,
            label: best.e.label,
            kind: best.e.kind,
            candidateIds: undefined,
            candidateLabels: undefined,
        };
    });
}

type EntityInfo = { id: string; label: string; kind: EntityKind };
type PatternEntry = { surface: string; info: EntityInfo };

export class ImplicitCore {
    private filter: AllProfanity;
    private aliasToCandidates: Map<string, EntityInfo[]> = new Map();
    private aliasSurface: Map<string, string> = new Map();
    private fuzzyIndex: FuzzyIndex | null = null;

    constructor() {
        this.filter = new AllProfanity({
            algorithm: { matching: 'aho-corasick' },
            performance: { enableCaching: true, cacheSize: 500 },
            // @ts-ignore
            profanityDetection: { enableLeetSpeak: false, caseSensitive: false, strictMode: true }
        });
    }

    hydrate(entities: RegisteredEntity[]): void {
        this.filter.clearList();
        this.aliasToCandidates.clear();
        this.aliasSurface.clear();

        this.fuzzyIndex = buildFuzzyIndex(entities);

        const offer = (surface: string, info: EntityInfo) => {
            const key = normalizeRaw(surface);
            if (!key) return;

            if (!this.aliasSurface.has(key)) this.aliasSurface.set(key, surface);

            const arr = this.aliasToCandidates.get(key) ?? [];
            if (!arr.some(x => x.id === info.id)) arr.push(info);
            this.aliasToCandidates.set(key, arr);
        };

        for (const entity of entities) {
            const info: EntityInfo = { id: entity.id, label: entity.label, kind: entity.kind };

            offer(entity.label, info);
            const normLabel = normalizeRaw(entity.label);
            if (normLabel && normLabel !== normalizeRaw(entity.label)) {
                offer(normLabel, info);
            } else {
                offer(normLabel, info);
            }

            for (const alias of entity.aliases || []) {
                offer(alias, info);
                offer(normalizeRaw(alias), info);
            }

            for (const alias of generateAliases(entity.label, entity.kind)) {
                offer(alias, info);
                offer(normalizeRaw(alias), info);
            }
        }

        const dictionary = [...this.aliasSurface.values()];
        if (dictionary.length > 0) {
            this.filter.loadCustomDictionary('entities', dictionary);
            this.filter.loadLanguage('entities');
        }
    }

    scan(text: string): DecorationSpan[] {
        if (!text) return [];

        let spans: DecorationSpan[] = [];

        const result = this.filter.detect(text);
        if (result.hasProfanity) {
            for (const match of result.positions) {
                if (match.start < 0 || match.end > text.length) continue;

                const key = normalizeRaw(match.word);
                const candidates = this.aliasToCandidates.get(key);
                if (!candidates || candidates.length === 0) continue;

                if (candidates.length === 1) {
                    const c = candidates[0];
                    spans.push({
                        type: 'entity_implicit',
                        from: match.start,
                        to: match.end,
                        label: c.label,
                        kind: c.kind,
                        resolved: true,
                        entityId: c.id
                    });
                } else {
                    spans.push({
                        type: 'entity_implicit',
                        from: match.start,
                        to: match.end,
                        label: text.slice(match.start, match.end),
                        kind: candidates[0].kind,
                        resolved: false,
                        candidateIds: candidates.map(c => c.id),
                        candidateLabels: candidates.map(c => c.label)
                    });
                }
            }
        }

        if (this.fuzzyIndex) {
            const fuzzy = scanFuzzy(text, this.fuzzyIndex, this.aliasToCandidates as any);
            spans.push(...fuzzy);
        }

        const merged = this.deduplicate(spans);
        return this.fuzzyIndex
            ? disambiguateSpans(text, merged, this.fuzzyIndex, undefined /* priors */)
            : merged;
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
