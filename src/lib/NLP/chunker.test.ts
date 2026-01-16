
import { describe, it, expect, beforeEach } from 'vitest';
import { Chunker, ChunkKind, POS, type ChunkResult } from './chunker';

// Test suite mirroring the Rust tests
describe('Chunker', () => {
    let chunker: Chunker;

    beforeEach(() => {
        chunker = new Chunker();
    });

    const findChunkByKind = (result: ChunkResult, kind: ChunkKind) => {
        return result.chunks.find(c => c.kind === kind);
    };

    it('should tokenize basic strings', () => {
        const text = "hello world";
        const result = chunker.chunk(text);
        expect(result.tokens).toHaveLength(2);
        expect(result.tokens[0].text).toBe('hello');
        expect(result.tokens[1].text).toBe('world');
    });

    it('should find NP for simple noun "wizard"', () => {
        const text = "wizard";
        const result = chunker.chunk(text);
        const np = findChunkByKind(result, ChunkKind.NounPhrase);
        expect(np).toBeDefined();
        if (np) {
            expect(text.slice(np.head.start, np.head.end)).toBe("wizard");
        }
    });

    it('should find NP for "the wizard"', () => {
        const text = "the wizard";
        const result = chunker.chunk(text);
        const np = findChunkByKind(result, ChunkKind.NounPhrase);
        expect(np).toBeDefined();
        if (np) {
            expect(text.slice(np.head.start, np.head.end)).toBe("wizard");
            expect(text.slice(np.range.start, np.range.end)).toBe("the wizard");
            expect(np.modifiers).toHaveLength(1); // "the"
        }
    });

    it('should find NP for "the ancient wizard"', () => {
        const text = "the ancient wizard";
        const result = chunker.chunk(text);
        const np = findChunkByKind(result, ChunkKind.NounPhrase);
        expect(np).toBeDefined();
        if (np) {
            expect(text.slice(np.head.start, np.head.end)).toBe("wizard");
            expect(text.slice(np.range.start, np.range.end)).toBe("the ancient wizard");
        }
    });

    it('should find VP for "walked"', () => {
        const text = "walked";
        const result = chunker.chunk(text);
        const vp = findChunkByKind(result, ChunkKind.VerbPhrase);
        expect(vp).toBeDefined();
        if (vp) {
            expect(text.slice(vp.head.start, vp.head.end)).toBe("walked");
        }
    });

    it('should find VP for "was walking"', () => {
        const text = "was walking";
        const result = chunker.chunk(text);
        const vp = findChunkByKind(result, ChunkKind.VerbPhrase);
        expect(vp).toBeDefined();
        if (vp) {
            expect(text.slice(vp.head.start, vp.head.end)).toBe("walking");
        }
    });

    it('should find PP for "in the forest"', () => {
        const text = "in the forest";
        const result = chunker.chunk(text);
        const pp = findChunkByKind(result, ChunkKind.PrepPhrase);
        expect(pp).toBeDefined();

        // In the Rust code, PP modifiers = [NP Head, ...NP modifiers], it essentially wraps the NP
        // Check structural correctness
        if (pp) {
            expect(text.slice(pp.head.start, pp.head.end)).toBe("in");
            // should encompass the whole phrase
            expect(text.slice(pp.range.start, pp.range.end)).toBe("in the forest");
        }
    });

    it('should handle full sentence: "the old wizard walked through the dark forest"', () => {
        const text = "the old wizard walked through the dark forest";
        const result = chunker.chunk(text);

        const nps = result.chunks.filter(c => c.kind === ChunkKind.NounPhrase);
        // Depending on greediness and PP wrapping, we might see fewer top-level NPs if they are consumed by PPs.
        // Rust implementation logic: try_prep_phrase consumes a following NP. 
        // So "through the dark forest" becomes a PP, "the dark forest" inside it is consumed.
        // "the old wizard" -> NP
        // "walked" -> VP
        // "through the dark forest" -> PP

        // So we expect 1 NP (the subject), 1 VP, 1 PP.

        expect(nps.length).toBeGreaterThanOrEqual(1);

        const vps = result.chunks.filter(c => c.kind === ChunkKind.VerbPhrase);
        expect(vps).toHaveLength(1);

        const pps = result.chunks.filter(c => c.kind === ChunkKind.PrepPhrase);
        expect(pps).toHaveLength(1);
    });
});
