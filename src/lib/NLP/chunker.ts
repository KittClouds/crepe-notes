
// Chunker - NP/VP/PP Detection (Port of src-tauri/src/chunker.rs)
// Rule-based shallow parser for identifying phrases without neural models.

export enum ChunkKind {
    NounPhrase = 'NP',
    VerbPhrase = 'VP',
    PrepPhrase = 'PP',
    AdjPhrase = 'ADJP',
    Clause = 'CLAUSE',
}

export interface TextRange {
    start: number;
    end: number;
}

export interface Chunk {
    kind: ChunkKind;
    range: TextRange;
    head: TextRange;
    modifiers: TextRange[];
}

export enum POS {
    Noun = 'Noun',
    Pronoun = 'Pronoun',
    ProperNoun = 'ProperNoun',
    Verb = 'Verb',
    Auxiliary = 'Auxiliary',
    Modal = 'Modal',
    Adjective = 'Adjective',
    Adverb = 'Adverb',
    Determiner = 'Determiner',
    Preposition = 'Preposition',
    Conjunction = 'Conjunction',
    RelativePronoun = 'RelativePronoun',
    Punctuation = 'Punctuation',
    Other = 'Other',
}

export interface Token {
    text: string;
    pos: POS;
    range: TextRange;
}

export interface ChunkResult {
    chunks: Chunk[];
    tokens: Token[];
}

export class Chunker {
    private lexicon: Map<string, POS>;

    constructor() {
        this.lexicon = new Map();
        this.loadDefaultLexicon();
    }

    public chunk(text: string): ChunkResult {
        // Step 1: Tokenize
        const tokenRanges = this.tokenize(text);

        // Step 2: Tag POS
        const tokens = this.tagTokens(tokenRanges, text);

        // Step 3: Chunk
        const chunks = this.findChunks(tokens);

        return {
            chunks,
            tokens,
        };
    }

    private tokenize(text: string): TextRange[] {
        const ranges: TextRange[] = [];
        let start: number | null = null;

        for (let i = 0; i < text.length; i++) {
            const code = text.charCodeAt(i);
            const char = text[i];

            // alphanumeric, apostrophe, or hyphen (basic word chars)
            // simplistic check matching Rust: is_alphanumeric || ' || -
            // In JS regex: /[a-zA-Z0-9'-]/
            const isWordChar = /[a-zA-Z0-9'\-]/.test(char);

            if (isWordChar) {
                if (start === null) {
                    start = i;
                }
            } else {
                if (start !== null) {
                    ranges.push({ start, end: i });
                    start = null;
                }

                // Punctuation check (basic ASCII punctuation)
                // Rust's is_ascii_punctuation matches: ! " # $ % & ' ( ) * + , - . / : ; < = > ? @ [ \ ] ^ _ ` { | } ~
                // We'll mimic roughly with a regex
                if (/[\!"#\$%&'\(\)\*\+,-\.\/:;<=>\?@\[\\\]\^_`\{\|\}~]/.test(char)) {
                    ranges.push({ start: i, end: i + 1 });
                }
            }
        }

        if (start !== null) {
            ranges.push({ start, end: text.length });
        }

        return ranges;
    }

    private tagTokens(tokenRanges: TextRange[], text: string): Token[] {
        return tokenRanges.map(range => {
            const word = text.slice(range.start, range.end);
            const pos = this.lookupPos(word);
            return { text: word, pos, range };
        });
    }

    private lookupPos(word: string): POS {
        const lower = word.toLowerCase();

        // Lexicon lookup
        if (this.lexicon.has(lower)) {
            return this.lexicon.get(lower)!;
        }

        // Simple verb morphology (hardcoded simplistic list in Rust reference was a struct, 
        // here we'll just check some basic endings if not in lexicon, or rely on inferPos)
        // The Rust code had a separate VerbMorphology struct. For simplicity in this port, 
        // we will fold basic checks into inferPos or here.
        // Let's implement inferPos similar to Rust:

        return this.inferPos(word);
    }

    private inferPos(word: string): POS {
        const lower = word.toLowerCase();

        // Punctuation
        if (word.length === 1 && /[\!"#\$%&'\(\)\*\+,-\.\/:;<=>\?@\[\\\]\^_`\{\|\}~]/.test(word)) {
            return POS.Punctuation;
        }

        // Proper noun heuristic: starts with uppercase
        if (word.length > 0 && word[0] === word[0].toUpperCase() && /[A-Z]/.test(word[0])) {
            return POS.ProperNoun;
        }

        if (lower.endsWith('ly')) return POS.Adverb;

        if (lower.endsWith('ing') || lower.endsWith('ed') || lower.endsWith('en')) {
            return POS.Verb;
        }

        if (lower.endsWith('ness') || lower.endsWith('tion') || lower.endsWith('ment') ||
            lower.endsWith('ity') || lower.endsWith('er') || lower.endsWith('or')) {
            return POS.Noun;
        }

        if (lower.endsWith('ful') || lower.endsWith('less') || lower.endsWith('ous') ||
            lower.endsWith('ive') || lower.endsWith('able') || lower.endsWith('ible')) {
            return POS.Adjective;
        }

        return POS.Noun;
    }

    private findChunks(tokens: Token[]): Chunk[] {
        const chunks: Chunk[] = [];
        let i = 0;

        while (i < tokens.length) {
            if (tokens[i].pos === POS.Punctuation) {
                i++;
                continue;
            }

            // Priority order matching
            const pp = this.tryPrepPhrase(tokens, i);
            if (pp) {
                chunks.push(pp.chunk);
                i += pp.consumed;
                continue;
            }

            const vp = this.tryVerbPhrase(tokens, i);
            if (vp) {
                chunks.push(vp.chunk);
                i += vp.consumed;
                continue;
            }

            const np = this.tryNounPhrase(tokens, i);
            if (np) {
                chunks.push(np.chunk);
                i += np.consumed;
                continue;
            }

            const adjp = this.tryAdjPhrase(tokens, i);
            if (adjp) {
                chunks.push(adjp.chunk);
                i += adjp.consumed;
                continue;
            }

            const clause = this.tryClause(tokens, i);
            if (clause) {
                chunks.push(clause.chunk);
                i += clause.consumed;
                continue;
            }

            i++;
        }

        return chunks;
    }

    private tryNounPhrase(tokens: Token[], start: number): { chunk: Chunk, consumed: number } | null {
        let i = start;
        const modifiers: TextRange[] = [];

        // Det?
        if (i < tokens.length && tokens[i].pos === POS.Determiner) {
            modifiers.push(tokens[i].range);
            i++;
        }

        // Adj*
        while (i < tokens.length && tokens[i].pos === POS.Adjective) {
            modifiers.push(tokens[i].range);
            i++;
        }

        // Noun+
        const nounStart = i;
        while (i < tokens.length && this.isNominal(tokens[i].pos)) {
            i++;
        }

        if (i > nounStart) {
            const head = tokens[i - 1].range;
            const range = { start: tokens[start].range.start, end: tokens[i - 1].range.end };
            return {
                chunk: { kind: ChunkKind.NounPhrase, range, head, modifiers },
                consumed: i - start
            };
        }

        return null;
    }

    private tryVerbPhrase(tokens: Token[], start: number): { chunk: Chunk, consumed: number } | null {
        let i = start;
        const modifiers: TextRange[] = [];
        let headIdx: number | null = null;

        // Aux/Modal?
        if (i < tokens.length && (tokens[i].pos === POS.Auxiliary || tokens[i].pos === POS.Modal)) {
            modifiers.push(tokens[i].range);
            i++;
        }

        // Adv*
        while (i < tokens.length && tokens[i].pos === POS.Adverb) {
            modifiers.push(tokens[i].range);
            i++;
        }

        // Verb (Required)
        if (i < tokens.length && tokens[i].pos === POS.Verb) {
            headIdx = i;
            i++;
        } else {
            return null;
        }

        // Adv* (post-verb)
        while (i < tokens.length && tokens[i].pos === POS.Adverb) {
            modifiers.push(tokens[i].range);
            i++;
        }

        if (headIdx !== null) {
            const head = tokens[headIdx].range;
            const range = { start: tokens[start].range.start, end: tokens[i - 1].range.end };
            return {
                chunk: { kind: ChunkKind.VerbPhrase, range, head, modifiers },
                consumed: i - start
            };
        }

        return null;
    }

    private tryPrepPhrase(tokens: Token[], start: number): { chunk: Chunk, consumed: number } | null {
        if (start >= tokens.length || tokens[start].pos !== POS.Preposition) {
            return null;
        }

        const prep = tokens[start];
        const npStart = start + 1;

        const npMatch = this.tryNounPhrase(tokens, npStart);
        if (!npMatch) return null;

        const range = { start: prep.range.start, end: npMatch.chunk.range.end };
        const modifiers = [npMatch.chunk.head, ...npMatch.chunk.modifiers];

        return {
            chunk: { kind: ChunkKind.PrepPhrase, range, head: prep.range, modifiers },
            consumed: 1 + npMatch.consumed
        };
    }

    private tryAdjPhrase(tokens: Token[], start: number): { chunk: Chunk, consumed: number } | null {
        let i = start;
        const modifiers: TextRange[] = [];

        while (i < tokens.length && tokens[i].pos === POS.Adverb) {
            modifiers.push(tokens[i].range);
            i++;
        }

        if (i >= tokens.length || tokens[i].pos !== POS.Adjective) {
            return null;
        }

        const head = tokens[i].range;
        i++;

        // Only make ADJP if there are intensifiers (matching Rust logic)
        if (modifiers.length === 0) return null;

        const range = { start: tokens[start].range.start, end: tokens[i - 1].range.end };
        return {
            chunk: { kind: ChunkKind.AdjPhrase, range, head, modifiers },
            consumed: i - start
        };
    }

    private tryClause(tokens: Token[], start: number): { chunk: Chunk, consumed: number } | null {
        if (start >= tokens.length || tokens[start].pos !== POS.RelativePronoun) {
            return null;
        }

        const rel = tokens[start];
        let i = start + 1;

        const vpMatch = this.tryVerbPhrase(tokens, i);
        if (!vpMatch) return null;

        i += vpMatch.consumed;
        let end = vpMatch.chunk.range.end;

        const npMatch = this.tryNounPhrase(tokens, i);
        if (npMatch) {
            end = npMatch.chunk.range.end;
            i += npMatch.consumed;
        }

        const range = { start: rel.range.start, end };
        return {
            chunk: { kind: ChunkKind.Clause, range, head: vpMatch.chunk.head, modifiers: [rel.range] },
            consumed: i - start
        };
    }

    private isNominal(pos: POS): boolean {
        return pos === POS.Noun || pos === POS.Pronoun || pos === POS.ProperNoun;
    }

    private loadDefaultLexicon() {
        const add = (words: string[], pos: POS) => {
            words.forEach(w => this.lexicon.set(w, pos));
        };

        add(["the", "a", "an", "this", "that", "these", "those", "my", "your",
            "his", "her", "its", "our", "their", "some", "any", "no", "every",
            "each", "all", "both", "few", "many", "much", "most", "other"], POS.Determiner);

        add(["in", "on", "at", "to", "for", "with", "by", "from", "of", "about",
            "into", "through", "during", "before", "after", "above", "below",
            "between", "under", "over", "against", "among", "around", "behind",
            "beside", "beyond", "near", "toward", "towards", "upon", "within",
            "without", "across", "along", "inside", "outside", "throughout"], POS.Preposition);

        add(["is", "are", "was", "were", "be", "been", "being", "am",
            "have", "has", "had", "having", "do", "does", "did", "doing"], POS.Auxiliary);

        add(["can", "could", "will", "would", "shall", "should", "may", "might", "must"], POS.Modal);

        add(["and", "or", "but", "nor", "yet", "so", "for", "because", "although",
            "while", "if", "unless", "until", "since", "when", "where", "whether"], POS.Conjunction);

        add(["i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
            "myself", "yourself", "himself", "herself", "itself", "ourselves", "themselves"], POS.Pronoun);

        add(["who", "whom", "whose", "which", "that"], POS.RelativePronoun);

        add(["old", "new", "good", "bad", "great", "small", "large", "big", "little",
            "young", "long", "short", "high", "low", "early", "late", "first", "last",
            "ancient", "dark", "bright", "powerful", "mighty", "wise", "evil", "grey",
            "black", "white", "red", "blue", "green", "golden", "silver"], POS.Adjective);

        add(["very", "quite", "rather", "really", "too", "so", "just", "only",
            "now", "then", "here", "there", "always", "never", "often", "sometimes",
            "slowly", "quickly", "suddenly", "finally", "already", "still", "even"], POS.Adverb);

        add(["go", "went", "gone", "going", "come", "came", "coming",
            "say", "said", "saying", "see", "saw", "seen", "seeing",
            "know", "knew", "known", "knowing", "take", "took", "taken", "taking",
            "get", "got", "getting", "make", "made", "making",
            "walk", "walked", "walking", "run", "ran", "running",
            "live", "lived", "living", "speak", "spoke", "spoken", "speaking",
            "fight", "fought", "fighting", "kill", "killed", "killing",
            "love", "loved", "loving", "hate", "hated", "hating",
            "rule", "ruled", "ruling", "serve", "served", "serving"], POS.Verb);

        add(["wizard", "king", "queen", "knight", "dragon", "sword", "castle",
            "forest", "tower", "ring", "magic", "battle", "kingdom", "throne",
            "warrior", "mage", "elf", "dwarf", "orc", "goblin", "troll",
            "man", "woman", "child", "hero", "villain", "stranger", "lord", "lady"], POS.Noun);
    }
}
