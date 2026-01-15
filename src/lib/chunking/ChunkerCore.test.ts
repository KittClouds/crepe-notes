import { ChunkerCore } from './ChunkerCore';
import { describe, it, expect, beforeAll } from 'vitest';

describe('ChunkerCore (Mastra Backend)', () => {
    beforeAll(async () => {
        await ChunkerCore.init();
    });

    it('should be ready after init', () => {
        expect(ChunkerCore.isReady()).toBe(true);
    });

    it('should chunk text for TTS', () => {
        const text = "Hello world. This is a test. Another sentence here. And one more for good measure.";
        const chunks = ChunkerCore.chunkForTTS(text);

        expect(chunks.length).toBeGreaterThan(0);
        expect(chunks[0].text).toBeTruthy();
        expect(chunks[0].index).toBe(0);
        expect(typeof chunks[0].startOffset).toBe('number');
        expect(typeof chunks[0].endOffset).toBe('number');
    });

    it('should chunk text for RAG with overlap', () => {
        const text = "Sentence one. Sentence two. Sentence three. Sentence four. Sentence five. Sentence six. Sentence seven.";
        const chunks = ChunkerCore.chunkForRAG(text, 50);

        expect(chunks.length).toBeGreaterThan(0);
        // RAG should have overlap, so total text from chunks may exceed original
    });

    it('should chunk into paragraphs', () => {
        const text = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.";
        const chunks = ChunkerCore.chunkIntoParagraphs(text);

        expect(chunks.length).toBe(3);
        expect(chunks[0].text).toBe("First paragraph.");
        expect(chunks[1].text).toBe("Second paragraph.");
        expect(chunks[2].text).toBe("Third paragraph.");
    });

    it('should chunk into sentences', () => {
        const text = "First sentence. Second sentence. Third sentence.";
        const chunks = ChunkerCore.chunkIntoSentences(text);

        expect(chunks.length).toBeGreaterThan(0);
    });

    it('should return empty array for empty text', () => {
        expect(ChunkerCore.chunkForTTS('')).toEqual([]);
        expect(ChunkerCore.chunkForTTS('   ')).toEqual([]);
    });

    it('chunkToStrings should return just text', () => {
        const text = "Hello. World.";
        const strings = ChunkerCore.chunkToStrings(text, 'sentence');

        expect(Array.isArray(strings)).toBe(true);
        expect(typeof strings[0]).toBe('string');
    });
});
