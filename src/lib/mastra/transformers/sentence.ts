import type { SentenceChunkOptions } from '../types';
import { TextTransformer } from './text';

export class SentenceTransformer extends TextTransformer {
    protected minSize: number;
    // protected maxSize: number; // Inherited from TextTransformer
    protected targetSize: number;
    protected sentenceEnders: string[];
    protected fallbackToWords: boolean;
    protected fallbackToCharacters: boolean;

    constructor(options: SentenceChunkOptions) {
        const maxSize = options.maxSize ?? 4000;
        // Ensure overlap doesn't exceed maxSize for parent validation
        const parentOverlap = Math.min(options.overlap ?? 0, maxSize - 1);

        const baseOptions = {
            ...options,
            maxSize,
            overlap: parentOverlap, // Use adjusted overlap for parent
        };

        super(baseOptions);

        this.maxSize = maxSize;
        this.minSize = options.minSize ?? 50;
        this.targetSize = options.targetSize ?? Math.floor(this.maxSize * 0.8);
        this.sentenceEnders = options.sentenceEnders ?? ['.', '!', '?'];
        this.fallbackToWords = options.fallbackToWords ?? true;
        this.fallbackToCharacters = options.fallbackToCharacters ?? true;

        // Override with original overlap for our sentence logic
        this.overlap = options.overlap ?? 0;
    }

    splitText({ text }: { text: string }): string[] {
        if (!text) return [];

        // Use fast native segmenter
        const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
        const segments = segmenter.segment(text);

        const sentences: string[] = [];
        for (const { segment } of segments) {
            const trimmed = segment.trim();
            if (trimmed.length > 0) {
                sentences.push(trimmed);
            }
        }

        const chunks = this.groupSentencesIntoChunks(sentences);

        return chunks.filter(chunk => chunk.trim().length > 0);
    }

    /**
     * Group sentences into chunks with integrated overlap processing
     */
    private groupSentencesIntoChunks(sentences: string[]): string[] {
        const chunks: string[] = [];
        let currentChunk: string[] = [];
        let currentSize = 0;

        const separator = ' ';

        for (const sentence of sentences) {
            const sentenceLength = this.lengthFunction(sentence);
            const separatorLength = currentChunk.length > 0 ? this.lengthFunction(separator) : 0;
            const totalLength = currentSize + sentenceLength + separatorLength;

            // Handle oversized sentences with fallback strategies
            if (sentenceLength > this.maxSize) {
                if (currentChunk.length > 0) {
                    chunks.push(currentChunk.join(separator));
                    currentChunk = [];
                    currentSize = 0;
                }

                const fallbackChunks = this.handleOversizedSentence(sentence);
                chunks.push(...fallbackChunks);
                continue;
            }

            // If adding this sentence would exceed maxSize, finalize current chunk
            if (currentChunk.length > 0 && totalLength > this.maxSize) {
                chunks.push(currentChunk.join(separator));

                // OPTIMIZED Overlapper
                const overlapResult = this.calculateSentenceOverlap(currentChunk, separator);
                currentChunk = overlapResult.chunk;
                currentSize = overlapResult.size;
            }

            currentChunk.push(sentence);
            currentSize += sentenceLength + separatorLength;

            // If we've reached our target size, consider finalizing the chunk
            if (currentSize >= this.targetSize) {
                chunks.push(currentChunk.join(separator));

                const overlapResult = this.calculateSentenceOverlap(currentChunk, separator);
                currentChunk = overlapResult.chunk;
                currentSize = overlapResult.size;
            }
        }

        if (currentChunk.length > 0) {
            chunks.push(currentChunk.join(separator));
        }

        return chunks;
    }

    // Optimized overlap calculation: builds result directly instead of unshifting
    private calculateSentenceOverlap(currentChunk: string[], separator: string): { chunk: string[], size: number } {
        if (this.overlap === 0 || currentChunk.length === 0) {
            return { chunk: [], size: 0 };
        }

        const overlapSentences: string[] = [];
        let overlapSize = 0;

        // Work backwards through sentences to build overlap
        // Iterate from end to start
        for (let i = currentChunk.length - 1; i >= 0; i--) {
            const sentence = currentChunk[i];
            if (!sentence) continue;

            const sentenceLength = this.lengthFunction(sentence);
            // If this is the *first* element we are adding to overlap (which was the LAST in chunks), sep is 0? 
            // original logic: "separatorLength = overlapSentences.length > 0 ? ..."
            // Since we reconstruct the chunk in order later, we push to front (unshift) OR we push then reverse.
            // Array.unshift is O(N). Let's just collect them then reverse at the end.

            // But we need to check size as we go.

            const potentialSeparatorLen = overlapSentences.length > 0 ? this.lengthFunction(separator) : 0;

            if (overlapSize + sentenceLength + potentialSeparatorLen > this.overlap) {
                break;
            }

            overlapSentences.push(sentence);
            overlapSize += sentenceLength + potentialSeparatorLen;
        }

        // Since we collected from the end backwards, we need to reverse to get original order
        overlapSentences.reverse();

        return { chunk: overlapSentences, size: overlapSize };
    }

    // Remove unused legacy helpers
    // delete detectSentenceBoundaries
    // delete isRealSentenceBoundary
    // delete isCommonAbbreviation
    // delete calculateSentenceOverlap (old signature)
    // delete calculateChunkSize (no longer needed if we return size)

    /**
     * Handle oversized sentences with fallback strategies
     */
    private handleOversizedSentence(sentence: string): string[] {
        // First fallback
        if (this.fallbackToWords) {
            const wordChunks = this.splitSentenceIntoWords(sentence);
            if (wordChunks.length > 1) {
                return wordChunks;
            }
        }

        // Second fallback
        if (this.fallbackToCharacters) {
            return this.splitSentenceIntoCharacters(sentence);
        }

        // Last resort
        console.warn(
            `Sentence exceeds maxSize (${this.maxSize}) and fallbacks are disabled: "${sentence.substring(0, 50)}..."`,
        );
        return [sentence];
    }

    private splitSentenceIntoWords(sentence: string): string[] {
        const words = sentence.split(/\s+/);
        const chunks: string[] = [];
        let currentChunk = '';

        for (const word of words) {
            const testChunk = currentChunk ? currentChunk + ' ' + word : word;

            if (this.lengthFunction(testChunk) <= this.maxSize) {
                currentChunk = testChunk;
            } else {
                if (currentChunk) {
                    chunks.push(currentChunk);
                }

                if (this.lengthFunction(word) > this.maxSize) {
                    if (this.fallbackToCharacters) {
                        chunks.push(...this.splitSentenceIntoCharacters(word));
                    } else {
                        chunks.push(word);
                    }
                    currentChunk = '';
                } else {
                    currentChunk = word;
                }
            }
        }

        if (currentChunk) {
            chunks.push(currentChunk);
        }

        return chunks;
    }

    private splitSentenceIntoCharacters(text: string): string[] {
        const chunks: string[] = [];
        let currentChunk = '';

        for (const char of text) {
            if (this.lengthFunction(currentChunk + char) <= this.maxSize) {
                currentChunk += char;
            } else {
                if (currentChunk) {
                    chunks.push(currentChunk);
                }
                currentChunk = char;
            }
        }

        if (currentChunk) {
            chunks.push(currentChunk);
        }

        return chunks;
    }
}
