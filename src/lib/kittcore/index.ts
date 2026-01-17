/**
 * KittCore WASM Service
 * 
 * TypeScript interface to the KittCore WASM worker.
 * Handles worker lifecycle, message passing, and type-safe responses.
 * 
 * NOTE: Worker is wired up to the real Rust WASM module.
 */

// Message types (should match the worker)
export interface EntityInput {
    label: string;
    start: number;
    end: number;
}

export interface EntityDefinition {
    id: string;
    label: string;
    kind: string;
    aliases?: string[];
}

export interface EntitySpan {
    id: string;
    label: string;
    start: number;
    end: number;
}

export interface ScanResult {
    syntax_matches: SyntaxMatch[];
    implicit_mentions: ImplicitMention[];
    relations: ExtractedRelation[];
    triples: ExtractedTriple[];
    temporal_mentions: TemporalMention[];
    stats: ScanStats;
}

export interface SyntaxMatch {
    kind: string;
    text: string;
    start: number;
    end: number;
}

export interface ImplicitMention {
    entity_id: string;
    entity_label: string;
    matched_text: string;
    start: number;
    end: number;
    match_type: string;
}

export interface ExtractedRelation {
    source_id: string;
    target_id: string;
    kind: string;
    confidence: number;
}

export interface ExtractedTriple {
    subject: string;
    predicate: string;
    object: string;
    start: number;
    end: number;
}

export interface TemporalMention {
    text: string;
    kind: string;
    start: number;
    end: number;
}

export interface ScanStats {
    syntax_count: number;
    implicit_count: number;
    relation_count: number;
    triple_count: number;
    temporal_count: number;
    duration_ms: number;
}

export interface WorkerStatus {
    initialized: boolean;
    wasmLoaded: boolean;
    entitiesHydrated: number;
    version: string;
}

class KittCoreService {
    private worker: Worker | null = null;
    private initPromise: Promise<void> | null = null;
    private messageId = 0;
    private pendingMessages = new Map<number, {
        resolve: (value: any) => void;
        reject: (error: Error) => void;
    }>();

    /**
     * Initialize the KittCore worker
     */
    async init(): Promise<string> {
        if (this.initPromise) {
            await this.initPromise;
            return 'already initialized';
        }

        this.initPromise = new Promise((resolve, reject) => {
            try {
                // Create worker
                this.worker = new Worker(
                    new URL('./kittcore.worker.ts', import.meta.url),
                    { type: 'module' }
                );

                // Set up message handler
                this.worker.onmessage = (e) => this.handleMessage(e);

                this.worker.onerror = (e) => {
                    console.error('[KittCore] Worker error:', e);
                    reject(new Error(`Worker error: ${e.message}`));
                };

                // Send init message
                this.sendMessage({ type: 'INIT' }).then((result: any) => {
                    console.log('[KittCore] Initialized:', result.version);
                    resolve();
                }).catch(reject);

            } catch (e) {
                reject(e);
            }
        });

        await this.initPromise;
        return 'initialized';
    }

    /**
     * Send a message and wait for response
     */
    private sendMessage(message: any): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.worker) {
                reject(new Error('Worker not initialized'));
                return;
            }

            const id = this.messageId++;
            this.pendingMessages.set(id, { resolve, reject });

            // Post message with ID for correlation
            this.worker.postMessage({ ...message, _id: id });

            // Timeout after 30 seconds
            setTimeout(() => {
                if (this.pendingMessages.has(id)) {
                    this.pendingMessages.delete(id);
                    reject(new Error('Message timeout'));
                }
            }, 30000);
        });
    }

    /**
     * Handle incoming messages from worker
     */
    private handleMessage(e: MessageEvent) {
        const { type, payload, _id } = e.data;

        // Route to pending promise if we have an ID
        // Note: Worker doesn't send _id back currently, so we match by response type
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
     * Hydrate the scanner with entity definitions for implicit matching
     */
    async hydrateEntities(entities: EntityDefinition[]): Promise<number> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'HYDRATE_ENTITIES',
            payload: { entities }
        });
        return result.count;
    }

    /**
     * Full document scan - extracts syntax, implicit mentions, relations, triples, temporal
     */
    async scan(content: string, entities: EntityInput[] = []): Promise<ScanResult> {
        await this.ensureInitialized();
        return await this.sendMessage({
            type: 'SCAN',
            payload: { content, entities }
        });
    }

    /**
     * Scan for implicit entity mentions only
     */
    async scanImplicit(content: string): Promise<ImplicitMention[]> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'SCAN_IMPLICIT',
            payload: { content }
        });
        return result.mentions;
    }

    /**
     * Extract relationships between entities
     */
    async extractRelations(content: string, entities: EntitySpan[]): Promise<ExtractedRelation[]> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'EXTRACT_RELATIONS',
            payload: { content, entities }
        });
        return result.relations;
    }

    /**
     * Extract triple patterns ([[A->B->C]])
     */
    async extractTriples(content: string): Promise<ExtractedTriple[]> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'EXTRACT_TRIPLES',
            payload: { content }
        });
        return result.triples;
    }

    /**
     * Scan for temporal expressions
     */
    async scanTemporal(content: string): Promise<TemporalMention[]> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'SCAN_TEMPORAL',
            payload: { content }
        });
        return result.mentions;
    }

    /**
     * Get worker status
     */
    async getStatus(): Promise<WorkerStatus> {
        await this.ensureInitialized();
        return await this.sendMessage({ type: 'GET_STATUS' });
    }

    /**
     * Test the worker with a simple greet
     */
    async greet(name: string): Promise<string> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'GREET',
            payload: { name }
        });
        return result.message;
    }

    /**
     * Get version info
     */
    async version(): Promise<{ version: string; timestamp: string }> {
        await this.ensureInitialized();
        return await this.sendMessage({ type: 'VERSION' });
    }

    private async ensureInitialized(): Promise<void> {
        if (!this.initPromise) {
            await this.init();
        } else {
            await this.initPromise;
        }
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
export const kittCore = new KittCoreService();
