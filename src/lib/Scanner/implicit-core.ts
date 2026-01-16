
import { AllProfanity } from 'allprofanity';
import type { DecorationSpan, EntityKind, RegisteredEntity } from './types';

// Helper for smart alias generation (Ported from Rust)
function generateAliases(label: string, kind: string): string[] {
    const parts = label.split(/\s+/);
    const aliases: string[] = [];

    if (parts.length <= 1) return aliases;

    const isTitle = (w: string) => /^(mr|mrs|ms|dr|prof|sir|lady|lord|king|queen|the|of|and)$/i.test(w);

    if (kind === 'CHARACTER' || kind === 'PERSON') {
        const first = parts[0];
        const last = parts[parts.length - 1];

        // First Name (if substantial)
        if (first.length >= 3 && !isTitle(first)) {
            aliases.push(first);
        }
        // Last Name (if different and substantial)
        if (last.length >= 3 && last !== first && !isTitle(last)) {
            aliases.push(last);
        }
    } else if (kind === 'FACTION' || kind === 'ORGANIZATION' || kind === 'GROUP') {
        // Factions: Last word (e.g. "Pirates" - maybe too common? but adhering to rust logic)
        const last = parts[parts.length - 1];
        if (last.length >= 3 && !isTitle(last)) {
            aliases.push(last);
        }

        // Acronyms (e.g. "KOG" for "Knights of God")
        if (parts.length >= 3) {
            const acronym = parts
                .filter(p => !isTitle(p)) // simple acronym skip
                .map(p => p[0])
                .join('')
                .toUpperCase();

            if (acronym.length >= 2) {
                aliases.push(acronym);
            }
        }
    }

    return aliases;
}

export class ImplicitCore {
    private filter: AllProfanity;
    private entityMap: Map<string, { id: string, label: string, kind: EntityKind }>;


    constructor() {
        // Initialize AllProfanity with v2.2 options
        this.filter = new AllProfanity({
            algorithm: {
                matching: 'aho-corasick' // O(n) scanning
            },
            performance: {
                enableCaching: true, // Speed up repeated scans
                cacheSize: 500
            },
            profanityDetection: {
                enableLeetSpeak: false, // We want exact names mainly
                caseSensitive: false,   // Case insensitive matching
                strictMode: true        // STRICT MODE: Enforce word boundaries automatically
            }
        });

        this.entityMap = new Map();
    }

    hydrate(entities: RegisteredEntity[]): void {
        this.filter.clearList();
        this.entityMap.clear();

        const dictionary: string[] = [];

        for (const entity of entities) {
            // 1. Primary Label
            this.addPattern(entity.label, entity);
            dictionary.push(entity.label);

            // 2. Explicit Aliases
            for (const alias of entity.aliases || []) {
                this.addPattern(alias, entity);
                dictionary.push(alias);
            }

            // 3. Smart Aliases
            const smartAliases = generateAliases(entity.label, entity.kind);
            for (const alias of smartAliases) {
                // Avoid duplicates
                if (!this.entityMap.has(alias.toLowerCase())) {
                    this.addPattern(alias, entity);
                    dictionary.push(alias);
                }
            }
        }

        // Load into AllProfanity as a custom dictionary
        if (dictionary.length > 0) {
            this.filter.loadCustomDictionary('entities', dictionary);
            this.filter.loadLanguage('entities');
        }
    }

    private addPattern(pattern: string, entity: RegisteredEntity) {
        // Map lowercase pattern to entity data for lookup after detection
        this.entityMap.set(pattern.toLowerCase(), {
            id: entity.id,
            label: entity.label,
            kind: entity.kind
        });
    }

    scan(text: string): DecorationSpan[] {
        if (!text) return [];

        // Use detect() to get positions
        // strictMode is ON, so boundaries are handled by AllProfanity
        const result = this.filter.detect(text);

        if (!result.hasProfanity) return [];

        const spans: DecorationSpan[] = [];

        for (const match of result.positions) {
            // 1. Sanity Check: Index alignment
            if (match.start < 0 || match.end > text.length) continue;

            const pattern = match.word;
            const info = this.entityMap.get(pattern.toLowerCase());

            if (info) {
                spans.push({
                    type: 'entity_implicit',
                    from: match.start,
                    to: match.end,
                    label: info.label, // Resolve to primary label
                    kind: info.kind,
                    // matchedText: text.substring(match.start, match.end),
                    resolved: true
                });
            }
        }

        return this.deduplicate(spans);
    }

    scanBatch(items: { id: number, text: string }[]): Map<number, DecorationSpan[]> {
        const results = new Map<number, DecorationSpan[]>();
        for (const item of items) {
            const spans = this.scan(item.text);
            if (spans.length > 0) {
                results.set(item.id, spans);
            }
        }
        return results;
    }

    private deduplicate(spans: DecorationSpan[]): DecorationSpan[] {
        // Sort by start position
        spans.sort((a, b) => a.from - b.from);

        const result: DecorationSpan[] = [];
        if (spans.length === 0) return result;

        let current = spans[0];

        for (let i = 1; i < spans.length; i++) {
            const next = spans[i];

            // Check overlap
            if (next.from < current.to) {
                // Overlap! Keep the longer one.
                const currentLen = current.to - current.from;
                const nextLen = next.to - next.from;

                if (nextLen > currentLen) {
                    current = next;
                }
                // Else keep current
            } else {
                result.push(current);
                current = next;
            }
        }
        result.push(current);

        return result;
    }
}
