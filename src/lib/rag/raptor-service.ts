/**
 * RAPTOR Service
 * 
 * Manages the hierarchical RAG pipeline.
 * - Ingestion: Embeds notes/chunks via RAG Worker.
 * - Clustering: Triggers RAPTOR tree build (Recursive K-Means) in Worker.
 * - Persistence: Syncs worker's tree to CozoDB HNSW.
 * - Retrieval: Performs hierarchical or flat search.
 */

import { RAPTOR_QUERIES, RAPTOR_NODES_SCHEMA, RAPTOR_CONFIG_SCHEMA, RAPTOR_HNSW_INDEX, RaptorNode } from '../cozo/schema/layer3-raptor';

// Lazy loader for DB to prevent test-runner crashes on WASM/UUID imports
async function getDb() {
    const mod = await import('../cozo/db');
    return mod.cozoDb;
}

export interface RaptorSearchConfig {
    mode: 'collapsed_leaves' | 'collapsed_all' | 'tree_traversal';
    k: number;
}

export class RaptorService {
    private worker: Worker | null = null;
    private initPromise: Promise<void> | null = null;
    private messageId = 0;
    private pendingMessages = new Map<number, { resolve: (val: any) => void; reject: (err: Error) => void }>();

    /**
     * Initialize RAG Worker and CozoDB Schema
     */
    async init() {
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            // 1. Initialize Worker
            this.worker = new Worker(new URL('../../workers/rag.worker.ts', import.meta.url), { type: 'module' });
            this.worker.onmessage = this.handleMessage.bind(this);

            await this.sendMessage({ type: 'INIT' });

            // 2. Ensure Schema Exists
            try {
                const db = await getDb();
                await db.runQuery(RAPTOR_NODES_SCHEMA);
                await db.runQuery(RAPTOR_CONFIG_SCHEMA);
                try {
                    await db.runQuery(RAPTOR_HNSW_INDEX);
                } catch (e) { /* ignore */ }
            } catch (e) {
                console.error('[RaptorService] Schema init error:', e);
            }

            console.log('[RaptorService] Initialized');
        })();

        return this.initPromise;
    }

    /**
     * Load Embedding Model in Worker
     */
    async loadModel(onnxBuffer: ArrayBuffer, tokenizerJson: string, dims = 384) {
        await this.ensureInit();
        return this.sendMessage({
            type: 'LOAD_MODEL',
            payload: { onnx: onnxBuffer, tokenizer: tokenizerJson, dims }
        });
    }

    /**
     * Ingest Notes (Embed & Store in Worker Memory)
     */
    async ingestNotes(notes: Array<{ id: string; title: string; content: string }>) {
        await this.ensureInit();
        return this.sendMessage({
            type: 'INDEX_NOTES',
            payload: { notes }
        });
    }

    /**
     * Rebuild RAPTOR Tree
     */
    async rebuildIndex(maxClusterSize = 20) {
        await this.ensureInit();
        console.log('[RaptorService] Rebuilding Index...');

        // 1. Build in Worker
        const buildResult = await this.sendMessage({
            type: 'BUILD_RAPTOR',
            payload: {
                config: {
                    maxClusterSize,
                    overlapThreshold: 0.2
                }
            }
        });

        const nodes: any[] = buildResult.nodes; // Worker's ClusterNode[]
        const stats = buildResult.stats;

        // 2. Persist to CozoDB
        const db = await getDb();
        await db.runQuery(RAPTOR_QUERIES.deleteAllNodes);

        // Batch insert
        const batchSize = 100;
        for (let i = 0; i < nodes.length; i += batchSize) {
            const batch = nodes.slice(i, i + batchSize);
            const rows = batch.map(n => [
                n.id,
                n.level,
                n.embedding,
                JSON.stringify(n.payload || {}),
                n.children,
                Date.now() / 1000
            ]);

            await db.runQuery(RAPTOR_QUERIES.upsertNodes, { nodes: rows });
        }

        // Also update Config
        await db.runQuery(RAPTOR_QUERIES.updateConfig, {
            tree_id: 'default',
            root_nodes: [],
            levels: stats.levels,
            is_dirty: false,
            last_built_at: Date.now() / 1000
        });

        console.log(`[RaptorService] Rebuild complete. Persisted ${nodes.length} nodes.`);
        return stats;
    }

    /**
     * Search
     */
    async search(query: string, config: RaptorSearchConfig) {
        await this.ensureInit();

        return this.sendMessage({
            type: 'SEARCH',
            payload: { query, k: config.k }
        });
    }

    // --- Private Helpers ---

    private async ensureInit() {
        if (!this.initPromise) await this.init();
        else await this.initPromise;
    }

    private sendMessage(msg: any): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.worker) return reject(new Error('Worker not created'));

            const id = ++this.messageId;
            this.pendingMessages.set(id, { resolve, reject });

            this.worker.postMessage({ ...msg, _id: id });
        });
    }

    private handleMessage(e: MessageEvent) {
        const { _id, type, payload } = e.data;

        if (_id && this.pendingMessages.has(_id)) {
            const { resolve, reject } = this.pendingMessages.get(_id)!;

            if (type === 'ERROR') {
                reject(new Error(payload.message || 'Worker Error'));
            } else {
                resolve(payload);
            }

            this.pendingMessages.delete(_id);
        }
    }
}

export const raptorService = new RaptorService();
