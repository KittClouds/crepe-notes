/**
 * CrossDoc Service
 * 
 * TypeScript interface to the CrossDoc worker.
 * Handles entity embedding for cross-document linking.
 * Uses lightweight MDBR-Leaf model (256d) - separate from RAG.
 */

// LEGACY REMOVED: import { cozoDb } from '@/lib/cozo/db';
// LEGACY REMOVED: import { CROSSDOC_QUERIES } from '@/lib/cozo/schema/layer2-crossdoc';
import { createCooccurrenceEdges } from '@/lib/crossdoc';

// ============================================================================
// Types
// ============================================================================

export interface ExtractedEntity {
    id: string;
    label: string;
    kind: string;
    contextBefore?: string;
    contextAfter?: string;
}

export interface EntityEmbedding {
    entityId: string;
    embedding: number[];
    contextText: string;
}

export interface CrossDocStatus {
    initialized: boolean;
    modelLoaded: boolean;
    modelId: string;
    dimensions: number;
}

// ============================================================================
// CrossDoc Service Class
// ============================================================================

export class CrossDocService {
    private worker: Worker | null = null;
    private initPromise: Promise<void> | null = null;
    private messageId = 0;
    private pendingMessages = new Map<number, {
        resolve: (value: any) => void;
        reject: (error: Error) => void;
    }>();

    /**
     * Initialize the CrossDoc worker
     */
    async init(): Promise<{ modelId: string; dimensions: number }> {
        if (this.initPromise) {
            await this.initPromise;
            return { modelId: 'MongoDB/mdbr-leaf-ir', dimensions: 256 };
        }

        const result = await new Promise<{ modelId: string; dimensions: number }>((resolve, reject) => {
            this.initPromise = new Promise((res) => {
                try {
                    this.worker = new Worker(
                        new URL('../../workers/crossdoc.worker.ts', import.meta.url),
                        { type: 'module' }
                    );

                    this.worker.onmessage = (e) => this.handleMessage(e);
                    this.worker.onerror = (e) => {
                        console.error('[CrossDocService] Worker error:', e);
                        reject(new Error(`Worker error: ${e.message}`));
                    };

                    this.sendMessage({ type: 'INIT' }).then((payload) => {
                        console.log(`[CrossDocService] Initialized: ${payload.modelId} (${payload.dimensions}d)`);
                        resolve(payload);
                        res();
                    }).catch(reject);

                } catch (e) {
                    reject(e);
                }
            });
        });

        return result;
    }

    /**
     * Send message to worker and wait for response
     */
    private sendMessage(message: any): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.worker && message.type !== 'INIT') {
                reject(new Error('Worker not initialized'));
                return;
            }

            const id = this.messageId++;
            this.pendingMessages.set(id, { resolve, reject });

            this.worker?.postMessage({ ...message, _id: id });

            // Timeout after 60 seconds (model loading can take time)
            setTimeout(() => {
                if (this.pendingMessages.has(id)) {
                    this.pendingMessages.delete(id);
                    reject(new Error('Message timeout'));
                }
            }, 60000);
        });
    }

    /**
     * Handle incoming messages from worker
     */
    private handleMessage(e: MessageEvent) {
        const { type, payload } = e.data;

        const pending = Array.from(this.pendingMessages.entries())[0];
        if (pending) {
            const [id, { resolve, reject }] = pending;
            this.pendingMessages.delete(id);

            if (type === 'ERROR') {
                reject(new Error(payload.message));
            } else {
                resolve(payload);
            }
        }
    }

    /**
     * Ensure worker is initialized
     */
    private async ensureInitialized(): Promise<void> {
        if (!this.initPromise) {
            await this.init();
        } else {
            await this.initPromise;
        }
    }

    /**
     * Process extracted entities - embed and store in CozoDB
     * This is the main entry point after a scan
     */
    async processEntities(
        noteId: string,
        noteTitle: string,
        entities: ExtractedEntity[]
    ): Promise<{ embedded: number; cooccurrences: number }> {
        await this.ensureInitialized();

        // Get embeddings from worker
        const result = await this.sendMessage({
            type: 'EMBED_ENTITIES',
            payload: { noteId, noteTitle, entities }
        });

        const embeddings: EntityEmbedding[] = result.embeddings;

        // LEGACY REMOVED: TS CozoDB vector storage
        // TODO: Migrate to Rust backend for vector persistence
        console.warn('[CrossDocService] Vector storage disabled - requires Rust migration');
        const stored = 0;

        // LEGACY REMOVED: Co-occurrence edges stored in TS CozoDB
        const cooccurrences = 0;

        console.log(`[CrossDocService] Computed ${embeddings.length} embeddings (storage disabled)`);
        return { embedded: stored, cooccurrences };
    }

    /**
     * Embed a single text (for queries/comparisons)
     */
    async embed(text: string): Promise<number[]> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'EMBED_TEXT',
            payload: { text }
        });
        return result.embedding;
    }

    /**
     * Batch embed texts
     */
    async embedBatch(texts: string[]): Promise<number[][]> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'EMBED_BATCH',
            payload: { texts }
        });
        return result.embeddings;
    }

    /**
     * Get worker status
     */
    async getStatus(): Promise<CrossDocStatus> {
        await this.ensureInitialized();
        return await this.sendMessage({ type: 'GET_STATUS' });
    }

    /**
     * Terminate the worker
     */
    terminate(): void {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
            this.initPromise = null;
        }
    }
}

// Singleton export
export const crossDocService = new CrossDocService();
