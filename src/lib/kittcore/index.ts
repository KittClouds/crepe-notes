/**
 * KittCore WASM Service
 * 
 * TypeScript interface to the KittCore WASM worker.
 * Handles worker lifecycle, message passing, and type-safe responses.
 * 
 * NOTE: Worker is wired up to the real Rust WASM module.
 * Entity embedding uses CrossDoc worker (MDBR-Leaf, off main thread).
 */

// Cross-doc imports - crossDocService handles embedding in separate worker
import {
    crossDocService,
    discoverClusters,
    persistClusters,
    type LinkingConfig,
    DEFAULT_LINKING_CONFIG
} from '@/lib/crossdoc';
import { cozoDb } from '@/lib/cozo/db';
import { CROSSDOC_QUERIES } from '@/lib/cozo/schema/layer2-crossdoc';

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

export interface DiscoveryCandidate {
    token: string;
    kind: number; // 255 = None, else EntityKind
    score: number;
    status: number; // 0=Watching, 1=Promoted, 2=Ignored
}

export interface WorkerStatus {
    initialized: boolean;
    wasmLoaded: boolean;
    entitiesHydrated: number;
    version: string;
}

export class KittCoreService {
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
                // Create worker - path relative from this file to worker in src/workers/
                this.worker = new Worker(
                    new URL('../../workers/kittcore.worker.ts', import.meta.url),
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
        console.log(`[KittCore] scan(): contentLen=${content?.length}, entities=${entities?.length}`);
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
     * Scan for implicit entity mentions using Rust DAFSA (A/B Test)
     */
    async scanImplicitRust(content: string): Promise<any[]> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'SCAN_IMPLICIT_RUST',
            payload: { content }
        });
        return result.spans;
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
     * Scan for discovery candidates (Shared Memory)
     */
    async scanDiscovery(content: string): Promise<DiscoveryCandidate[]> {
        await this.ensureInitialized();
        console.time('scanDiscovery');
        try {
            const result = await this.sendMessage({
                type: 'SCAN_DISCOVERY',
                payload: { content }
            });
            console.timeEnd('scanDiscovery');
            const candidates = result.candidates || [];
            if (candidates.length > 0) {
                console.log(`[Discovery:Service] Received ${candidates.length} candidates from worker`, candidates.map((c: any) => c.token));
            } else {
                console.log(`[Discovery:Service] Received 0 candidates from worker`);
            }
            return candidates;
        } catch (err) {
            console.timeEnd('scanDiscovery');
            console.error('[KittCore] Discovery Scan failed:', err);
            return [];
        }
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

    // ========================================================================
    // Cross-Document Entity Linking (Delegated to CrossDoc Worker)
    // ========================================================================

    /**
     * Process extracted entities - delegates to CrossDoc worker
     * Embeddings run off main thread using MDBR-Leaf (256d, lightweight)
     */
    async processExtractedEntities(
        noteId: string,
        noteTitle: string,
        entities: Array<{ id: string; label: string; kind: string; contextBefore?: string; contextAfter?: string }>
    ): Promise<{ embedded: number; cooccurrences: number }> {
        // Delegate to CrossDoc service (runs in separate worker)
        return await crossDocService.processEntities(noteId, noteTitle, entities);
    }

    /**
     * Run entity linking/clustering on main thread
     */
    async runLinking(config?: Partial<LinkingConfig>): Promise<{
        clusters: any[];
        stats: { entities: number; clusters: number; timeMs: number };
    }> {
        const startTime = performance.now();
        const linkingConfig: LinkingConfig = {
            ...DEFAULT_LINKING_CONFIG,
            ...(config || {}),
        };

        console.log('[KittCore] Running entity linking on main thread...');

        // Get all entities with vectors from CozoDB
        const vectorsResult = cozoDb.runQuery(CROSSDOC_QUERIES.getAllVectors, {});
        if (!vectorsResult.ok || !vectorsResult.rows) {
            throw new Error('Failed to fetch entities for linking');
        }

        const entities = vectorsResult.rows.map((row: any[]) => ({
            id: row[0],
            label: row[0], // TODO: get actual label from entity store
            normalized: row[0].toLowerCase(),
            sourceNote: row[2] || '',
        }));

        // Discover clusters
        const clusters = await discoverClusters(entities, linkingConfig);

        // Persist to CozoDB
        await persistClusters(clusters);

        const elapsedMs = performance.now() - startTime;
        console.log(`[KittCore] Linking complete: ${clusters.length} clusters in ${elapsedMs.toFixed(1)}ms`);

        return {
            clusters,
            stats: {
                entities: entities.length,
                clusters: clusters.length,
                timeMs: elapsedMs,
            }
        };
    }

    /**
     * Get entity clusters from CozoDB
     */
    async getClusters(entityId?: string): Promise<any[]> {
        let clusters: any[] = [];

        if (entityId) {
            const result = cozoDb.runQuery(CROSSDOC_QUERIES.getClusterForEntity, { node_id: entityId });
            if (result.ok && result.rows) {
                clusters = result.rows.map((row: any[]) => ({
                    clusterId: row[0],
                    canonicalId: row[1],
                    canonicalName: row[2],
                    confidence: row[3],
                }));
            }
        } else {
            const result = cozoDb.runQuery(CROSSDOC_QUERIES.getAllClusters, {});
            if (result.ok && result.rows) {
                clusters = result.rows.map((row: any[]) => ({
                    clusterId: row[0],
                    canonicalId: row[1],
                    canonicalName: row[2],
                    confidence: row[3],
                }));
            }
        }

        return clusters;
    }

    /**
     * Save confirmed candidates to CozoDB for persistence
     */
    async saveCandidates(candidates: DiscoveryCandidate[]): Promise<void> {
        if (candidates.length === 0) return;

        console.log(`[KittCore] Persisting ${candidates.length} candidates...`);

        const rows = candidates.map(c => [
            c.token,
            c.kind,
            c.score,
            c.status,
            Date.now(), // last_seen
            Date.now(), // first_seen (if new)
            1           // count (increment if exists)
        ]);

        // UPSERT logic: if token exists, update last_seen/status/score/count
        const query = `
            ?[token, kind, score, status, last_seen, first_seen, count] <- $rows

            :put discovery_candidates { 
                token, 
                kind, 
                score, 
                status, 
                last_seen, 
                first_seen, 
                count 
            }
        `;

        try {
            const result = cozoDb.runQuery(query, { rows });
            if (!result.ok) {
                console.error('[KittCore] Failed to save candidates:', result.message);
            }
        } catch (err) {
            console.error('[KittCore] Error saving candidates:', err);
        }
    }

}

// Singleton export
export const kittCore = new KittCoreService();
