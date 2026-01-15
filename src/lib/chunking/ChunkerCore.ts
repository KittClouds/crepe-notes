/**
 * ChunkerCore - Centralized Text Chunking Service
 * 
 * High-performance chunking using native Intl.Segmenter.
 * Supports multiple chunking strategies for different use cases:
 * - TTS: Sentence-boundary chunking for natural speech flow
 * - RAG: Semantic chunking with overlap for retrieval quality
 * - Custom: User-defined sizes
 */

// ============================================================================
// Types
// ============================================================================

/** Chunk with position metadata */
export interface Chunk {
    text: string;
    index: number;
    startOffset: number;
    endOffset: number;
}

/** Predefined chunking strategies */
export type ChunkStrategy = 'tts' | 'rag' | 'paragraph' | 'sentence' | 'custom';

/** Options for chunking */
export interface ChunkOptions {
    /** Maximum chunk size in characters */
    maxSize?: number;
    /** Maximum sentences per chunk (for sentence-based strategies) */
    maxSentences?: number;
    /** Language for segmentation (default: 'en') */
    locale?: string;
}

/** Strategy presets */
const STRATEGY_PRESETS: Record<Exclude<ChunkStrategy, 'custom'>, ChunkOptions> = {
    /** TTS: Natural sentence boundaries, moderate size for speech synthesis */
    tts: {
        maxSize: 1500,
        maxSentences: 8,
        locale: 'en',
    },
    /** RAG: Semantic boundaries with larger chunks for retrieval context */
    rag: {
        maxSize: 512,
        maxSentences: 6,
        locale: 'en',
    },
    /** Paragraph: Split on double newlines only */
    paragraph: {
        maxSize: 4096,
        locale: 'en',
    },
    /** Sentence: One sentence per chunk */
    sentence: {
        maxSize: 2048,
        maxSentences: 1,
        locale: 'en',
    },
};

// ============================================================================
// ChunkerCore Singleton
// ============================================================================

class ChunkerCoreImpl {
    private initialized = false;

    /**
     * Initialize the chunker. Using native APIs, so this is instant.
     */
    async init(): Promise<void> {
        this.initialized = true;
        console.log('[ChunkerCore] Initialized (native Intl.Segmenter)');
    }

    /**
     * Check if the chunker is ready to use.
     */
    isReady(): boolean {
        return this.initialized;
    }

    /**
     * Chunk text using a predefined strategy.
     */
    chunkWithStrategy(
        text: string,
        strategy: ChunkStrategy,
        overrides?: Partial<ChunkOptions>
    ): Chunk[] {
        // Auto-init since we're using native APIs
        if (!this.initialized) {
            this.initialized = true;
        }

        if (!text || text.trim().length === 0) {
            return [];
        }

        const preset = strategy === 'custom' ? {} : STRATEGY_PRESETS[strategy];
        const options = { ...preset, ...overrides };

        if (strategy === 'paragraph') {
            return this.chunkByParagraph(text, options);
        }

        return this.chunkBySentence(text, options);
    }

    /**
     * Chunk by sentences using Intl.Segmenter
     */
    private chunkBySentence(text: string, options: ChunkOptions): Chunk[] {
        const maxSize = options.maxSize ?? 1500;
        const maxSentences = options.maxSentences ?? 8;
        const locale = options.locale ?? 'en';

        const segmenter = new Intl.Segmenter(locale, { granularity: 'sentence' });
        const segments = Array.from(segmenter.segment(text));

        const chunks: Chunk[] = [];
        let buffer = '';
        let bufferStart = 0;
        let sentenceCount = 0;

        const flush = () => {
            const trimmed = buffer.trim();
            if (trimmed.length > 0) {
                chunks.push({
                    text: trimmed,
                    index: chunks.length,
                    startOffset: bufferStart,
                    endOffset: bufferStart + buffer.length,
                });
            }
            buffer = '';
            sentenceCount = 0;
        };

        for (const seg of segments) {
            const sentence = seg.segment;
            const nextBuffer = buffer + sentence;

            // Check if adding this sentence exceeds limits
            if (
                (nextBuffer.length > maxSize && buffer.length > 0) ||
                sentenceCount >= maxSentences
            ) {
                flush();
                bufferStart = seg.index;
            }

            if (buffer === '') {
                bufferStart = seg.index;
            }
            buffer += sentence;
            sentenceCount++;
        }

        flush();
        return chunks;
    }

    /**
     * Chunk by paragraphs (double newlines)
     */
    private chunkByParagraph(text: string, options: ChunkOptions): Chunk[] {
        const maxSize = options.maxSize ?? 4096;
        const paragraphs = text.split(/\n\s*\n/);

        const chunks: Chunk[] = [];
        let currentOffset = 0;

        for (const para of paragraphs) {
            const trimmed = para.trim();
            if (trimmed.length === 0) {
                // Skip empty paragraphs but track offset
                currentOffset = text.indexOf(para, currentOffset) + para.length;
                continue;
            }

            // Find actual position in original text
            const startOffset = text.indexOf(para, currentOffset);
            const endOffset = startOffset + para.length;

            // If paragraph exceeds max size, break it into sentences
            if (trimmed.length > maxSize) {
                const subChunks = this.chunkBySentence(trimmed, { ...options, maxSize });
                for (const sub of subChunks) {
                    chunks.push({
                        text: sub.text,
                        index: chunks.length,
                        startOffset: startOffset + sub.startOffset,
                        endOffset: startOffset + sub.endOffset,
                    });
                }
            } else {
                chunks.push({
                    text: trimmed,
                    index: chunks.length,
                    startOffset,
                    endOffset,
                });
            }

            currentOffset = endOffset;
        }

        return chunks;
    }

    /**
     * Chunk text with explicit options (low-level API).
     */
    chunkWithOptions(text: string, options: ChunkOptions): Chunk[] {
        return this.chunkBySentence(text, options);
    }

    /**
     * Convenience: Chunk for TTS playback.
     */
    chunkForTTS(text: string, maxSize?: number): Chunk[] {
        return this.chunkWithStrategy(text, 'tts', maxSize ? { maxSize } : undefined);
    }

    /**
     * Convenience: Chunk for RAG indexing.
     */
    chunkForRAG(text: string, maxSize?: number): Chunk[] {
        return this.chunkWithStrategy(text, 'rag', maxSize ? { maxSize } : undefined);
    }

    /**
     * Convenience: Split into paragraphs.
     */
    chunkIntoParagraphs(text: string): Chunk[] {
        return this.chunkWithStrategy(text, 'paragraph');
    }

    /**
     * Convenience: Split into sentences.
     */
    chunkIntoSentences(text: string): Chunk[] {
        return this.chunkWithStrategy(text, 'sentence');
    }

    /**
     * Get just the text strings (no metadata).
     */
    chunkToStrings(text: string, strategy: ChunkStrategy, options?: Partial<ChunkOptions>): string[] {
        return this.chunkWithStrategy(text, strategy, options).map(c => c.text);
    }
}

// Export singleton instance
export const ChunkerCore = new ChunkerCoreImpl();

// Also export the class for testing
export { ChunkerCoreImpl };
