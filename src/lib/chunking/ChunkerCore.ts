/**
 * ChunkerCore - Centralized Text Chunking Service
 * 
 * High-performance chunking using Mastra SentenceTransformer.
 * Supports multiple chunking strategies for different use cases:
 * - TTS: Sentence-boundary chunking for natural speech flow
 * - RAG: Semantic chunking with overlap for retrieval quality
 * - Custom: User-defined sizes
 */

import { SentenceTransformer } from '@/lib/mastra/transformers/sentence';

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
    /** Overlap size for RAG strategy */
    overlap?: number;
    /** Language for segmentation (default: 'en') */
    locale?: string;
}

/** Strategy presets */
const STRATEGY_PRESETS: Record<Exclude<ChunkStrategy, 'custom'>, ChunkOptions> = {
    /** TTS: Natural sentence boundaries, moderate size for speech synthesis */
    tts: {
        maxSize: 1500,
        maxSentences: 8,
        overlap: 0,
        locale: 'en',
    },
    /** RAG: Semantic boundaries with larger chunks for retrieval context */
    rag: {
        maxSize: 512,
        maxSentences: 6,
        overlap: 100, // Important for RAG!
        locale: 'en',
    },
    /** Paragraph: Split on double newlines only */
    paragraph: {
        maxSize: 4096,
        overlap: 0,
        locale: 'en',
    },
    /** Sentence: One sentence per chunk */
    sentence: {
        maxSize: 2048,
        maxSentences: 1,
        overlap: 0,
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
        console.log('[ChunkerCore] Initialized (Mastra SentenceTransformer)');
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
     * Chunk by sentences using Mastra SentenceTransformer
     */
    private chunkBySentence(text: string, options: ChunkOptions): Chunk[] {
        const maxSize = options.maxSize ?? 1500;
        const overlap = options.overlap ?? 0;

        // Use Mastra SentenceTransformer
        const transformer = new SentenceTransformer({
            maxSize,
            overlap,
            targetSize: Math.floor(maxSize * 0.8),
        });

        const chunkTexts = transformer.splitText({ text });

        // Convert to Chunk[] with position metadata
        const chunks: Chunk[] = [];
        let searchStart = 0;

        for (let i = 0; i < chunkTexts.length; i++) {
            const chunkText = chunkTexts[i];
            // Find actual position in original text
            // Note: With overlap, chunks may share text, so we search from the last found position
            const startOffset = text.indexOf(chunkText.substring(0, 50), searchStart);
            const endOffset = startOffset !== -1
                ? startOffset + chunkText.length
                : searchStart + chunkText.length;

            chunks.push({
                text: chunkText,
                index: i,
                startOffset: startOffset !== -1 ? startOffset : searchStart,
                endOffset,
            });

            // Move search start forward, but account for overlap by not moving too far
            if (startOffset !== -1) {
                searchStart = startOffset + Math.max(1, chunkText.length - overlap);
            }
        }

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
