/// <reference lib="webworker" />
// src/workers/rag.worker.ts
// RAG/Embedding worker - handles vector operations off main thread

import { normalizeEmbedding, getEmbeddingMeta, validateDimension, truncateEmbedding } from '../lib/rag/embedding-utils';
import { kMeans, softAssign, cosineSimilarity, ClusterNode, ClusteringConfig } from '../lib/rag/clustering';

// ============================================================================
// Types
// ============================================================================

type WorkerMessage =
    | { type: 'INIT' }
    | { type: 'LOAD_MODEL'; payload: { onnx: ArrayBuffer; tokenizer: string; dims?: number; truncate?: string } }
    | { type: 'SET_DIMENSIONS'; payload: { dims: number } }
    | { type: 'INDEX_NOTES'; payload: { notes: Array<{ id: string; title: string; content: string }> } }
    | { type: 'INSERT_VECTORS'; payload: { chunks: Array<{ id: string; note_id: string; note_title: string; chunk_index: number; text: string; embedding: Float32Array; start: number; end: number }> } }
    | { type: 'BUILD_RAPTOR'; payload: { config: ClusteringConfig } }
    | { type: 'SEARCH'; payload: { query: string; k: number } }
    | { type: 'SEARCH_WITH_VECTOR'; payload: { embedding: Float32Array; k: number } }
    | { type: 'SEARCH_HYBRID'; payload: { query: string; k: number; vectorWeight: number; lexicalWeight: number } }
    | { type: 'SEARCH_WITH_DIVERSITY'; payload: { query: string; k: number; lambda: number } }
    | { type: 'SEARCH_RAPTOR'; payload: { query: string; k: number; mode: string } }
    | { type: 'HYDRATE'; payload: { chunks: Array<any> } }
    | { type: 'GET_CHUNKS' }
    | { type: 'GET_STATUS' };

type ResponseMessage =
    | { type: 'INIT_COMPLETE' }
    | { type: 'MODEL_LOADED' }
    | { type: 'DIMENSIONS_SET'; payload: { dims: number } }
    | { type: 'INDEX_COMPLETE'; payload: { notes: number; chunks: number } }
    | { type: 'RAPTOR_BUILT'; payload: { nodes: ClusterNode[], stats: any } }
    | { type: 'SEARCH_RESULTS'; payload: { results: any[] } }
    | { type: 'CHUNKS_RETRIEVED'; payload: { chunks: any[] } }
    | { type: 'STATUS'; payload: { dims: number; modelLoaded: boolean; externalMode: boolean; chunkCount: number } }
    | { type: 'ERROR'; payload: { message: string } };

// ============================================================================
// Pipeline
// ============================================================================

class RagPipeline {
    private chunks: any[] = [];
    private dims = 256;
    private raptorNodes: ClusterNode[] = []; // Stores generated internal nodes

    setDimensions(dims: number) {
        this.dims = dims;
    }

    loadModel(_onnx: Uint8Array, _tokenizer: string) {
        console.log('[RagWorker] Stub loadModel called');
    }

    indexNotes(_notes: any[]) {
        return 0;
    }

    insertChunk(chunk: any) {
        // Ensure embedding is array
        if (chunk.embedding instanceof Float32Array) {
            chunk.embedding = Array.from(chunk.embedding);
        }
        this.chunks.push(chunk);
    }

    /**
     * Build RAPTOR Tree (Bottom-Up)
     */
    buildRaptorTree(config: ClusteringConfig): { nodes: ClusterNode[], stats: any } {
        const { maxClusterSize, overlapThreshold } = config;
        console.log(`[RagWorker] Building RAPTOR tree. MaxClusterSize: ${maxClusterSize}, Overlap: ${overlapThreshold}`);

        const startTime = performance.now();
        this.raptorNodes = []; // Reset internal nodes

        // Level 0: The chunks themselves (leaves)
        // We don't store leaves in raptorNodes (they are in 'chunks'), but we treat them as nodes for clustering
        let currentLevelIndices: number[] = this.chunks.map((_, i) => i);
        let currentLevelVectors: number[][] = this.chunks.map(c => c.embedding);
        let currentLevelIds: string[] = this.chunks.map(c => c.id);

        let level = 0;
        const stats = { levels: 0, totalNodes: 0, layerCounts: [] as number[] };

        while (currentLevelIndices.length > maxClusterSize) {
            console.log(`[RagWorker] building Level ${level + 1} from ${currentLevelIndices.length} nodes...`);

            // 1. Determine k
            let k = Math.ceil(currentLevelIndices.length / (maxClusterSize / 2));
            if (k < 1) k = 1;

            // 2. Run K-Means
            const { centroids } = kMeans(currentLevelVectors, k, 10);

            // 3. Create new nodes for centroids
            const nextLevelNodes: ClusterNode[] = [];
            const nextLevelVectors: number[][] = [];
            const nextLevelIds: string[] = [];

            for (let i = 0; i < centroids.length; i++) {
                // Generate a deterministic ID based on level and index (or random UUID)
                const nodeId = `cluster-l${level + 1}-${i}-${Math.random().toString(36).substring(7)}`;

                const node: ClusterNode = {
                    id: nodeId,
                    level: level + 1,
                    embedding: centroids[i],
                    children: [] // Populated next
                };

                nextLevelNodes.push(node);
                nextLevelVectors.push(centroids[i]);
                nextLevelIds.push(nodeId);
            }

            // 4. Assign children to parents (Soft Assignment)
            for (let i = 0; i < currentLevelIndices.length; i++) {
                const vec = currentLevelVectors[i];
                const childId = currentLevelIds[i];

                // Find parent(s)
                const parentIndices = softAssign(vec, nextLevelVectors, overlapThreshold);

                for (const pIdx of parentIndices) {
                    nextLevelNodes[pIdx].children.push(childId);
                }
            }

            // 5. Store new nodes
            this.raptorNodes.push(...nextLevelNodes);
            stats.layerCounts.push(nextLevelNodes.length);

            // 6. Prepare for next iteration
            currentLevelVectors = nextLevelVectors;
            currentLevelIds = nextLevelIds;
            currentLevelIndices = nextLevelNodes.map((_, i) => i);
            level++;
        }

        stats.levels = level;
        stats.totalNodes = this.raptorNodes.length;

        const elapsed = performance.now() - startTime;
        console.log(`[RagWorker] RAPTOR build complete in ${elapsed.toFixed(0)}ms. Layers: ${stats.layerCounts.join(' -> ')}`);

        return { nodes: this.raptorNodes, stats };
    }

    search(_query: string, k: number) {
        // Simple mock search if no real embeddings
        return this.chunks.slice(0, k).map((c, i) => ({ ...c, score: 1 }));
    }

    /**
     * RAPTOR Traversal Search
     */
    searchRaptor(queryEmbedding: Float32Array, k: number, mode: string, _beamWidth: number) {
        const queryVec = Array.from(queryEmbedding);

        if (mode === 'collapsed_leaves') {
            return this.searchFlat(queryVec, k);
        }
        else if (mode === 'collapsed_all') {
            return [];
        }
        return [];
    }

    private searchFlat(queryVec: number[], k: number) {
        // Brute force cosine scan over chunks
        const scores = this.chunks.map(c => ({
            ...c,
            score: cosineSimilarity(queryVec, c.embedding)
        }));

        scores.sort((a, b) => b.score - a.score);
        return scores.slice(0, k);
    }

    searchHybrid(_query: string, k: number, _weight: number) {
        return this.search(_query, k);
    }

    searchWithDiversity(_query: string, k: number, _lambda: number) {
        return this.search(_query, k);
    }

    embed(_text: string) {
        return new Float32Array(this.dims);
    }

    getChunks() {
        return this.chunks;
    }

    getStats() {
        return {
            total_chunks: this.chunks.length,
            raptor_nodes: this.raptorNodes.length
        };
    }

    isModelLoaded() {
        return false; // Stub
    }
}

// ============================================================================
// Worker State & Handler
// ============================================================================

let pipeline: RagPipeline | null = null;
let initialized = false;
let currentModelDim = 256;
let currentTruncateDim: number | null = null;
let useExternalEmbedding = false;

self.onmessage = async (e: MessageEvent<WorkerMessage & { _id?: number }>) => {
    const msg = e.data;
    const msgId = msg._id;
    // console.log('[RagWorker] Received:', msg.type, msgId ? `(ID: ${msgId})` : '');

    const reply = (response: ResponseMessage) => {
        self.postMessage({ ...response, _id: msgId });
    };

    try {
        switch (msg.type) {
            case 'INIT':
                if (!initialized) {
                    pipeline = new RagPipeline();
                    initialized = true;
                }
                reply({ type: 'INIT_COMPLETE' });
                break;

            case 'LOAD_MODEL': {
                if (!pipeline) throw new Error('Pipeline not initialized');
                const { onnx, tokenizer, dims, truncate } = msg.payload;

                pipeline.loadModel(new Uint8Array(onnx), tokenizer);

                currentModelDim = dims || 384;
                currentTruncateDim = truncate && truncate !== 'full' ? Number(truncate) : null;
                useExternalEmbedding = false;

                // console.log(`[RagWorker] Model loaded. Native Dim: ${currentModelDim}, Truncate: ${currentTruncateDim || 'None'}`);
                reply({ type: 'MODEL_LOADED' });
                break;
            }

            case 'SET_DIMENSIONS': {
                if (!pipeline) throw new Error('Pipeline not initialized');
                const newDims = msg.payload.dims;

                pipeline.setDimensions(newDims);
                currentModelDim = newDims;
                useExternalEmbedding = true;

                // console.log(`[RagWorker] External embedding mode. Dims: ${newDims}`);
                reply({ type: 'DIMENSIONS_SET', payload: { dims: newDims } });
                break;
            }

            case 'INDEX_NOTES': {
                if (!pipeline) throw new Error('Pipeline not initialized');
                if (useExternalEmbedding) {
                    throw new Error('INDEX_NOTES requires Rust model. Use INSERT_VECTORS for external embeddings.');
                }
                const notes = msg.payload.notes;
                const totalChunks = pipeline.indexNotes(notes);

                reply({
                    type: 'INDEX_COMPLETE',
                    payload: { notes: notes.length, chunks: totalChunks }
                });
                break;
            }

            case 'INSERT_VECTORS': {
                if (!pipeline) throw new Error('Pipeline not initialized');
                const vectorChunks = msg.payload.chunks;
                let insertedCount = 0;
                let insertErrors = 0;

                for (const chunk of vectorChunks) {
                    try {
                        const embeddingArray = Array.from(chunk.embedding);

                        if (embeddingArray.length !== currentModelDim) {
                            console.warn(`[RagWorker] Dimension mismatch: got ${embeddingArray.length}, expected ${currentModelDim}`);
                            insertErrors++;
                            continue;
                        }

                        pipeline.insertChunk({
                            ...chunk,
                            embedding: embeddingArray,
                        });
                        insertedCount++;
                    } catch (e) {
                        console.warn('[RagWorker] INSERT_VECTORS chunk failed:', e);
                        insertErrors++;
                    }
                }

                // console.log(`[RagWorker] INSERT_VECTORS: ${insertedCount} inserted, ${insertErrors} errors`);
                reply({
                    type: 'INDEX_COMPLETE',
                    payload: { notes: 0, chunks: insertedCount }
                });
                break;
            }

            case 'BUILD_RAPTOR': {
                if (!pipeline) throw new Error('Pipeline not initialized');
                const { nodes, stats } = pipeline.buildRaptorTree(msg.payload.config);
                reply({ type: 'RAPTOR_BUILT', payload: { nodes, stats } });
                break;
            }

            case 'SEARCH': {
                if (!pipeline) throw new Error('Pipeline not initialized');
                const results = pipeline.search(msg.payload.query, msg.payload.k);
                reply({ type: 'SEARCH_RESULTS', payload: { results } });
                break;
            }

            case 'SEARCH_HYBRID': {
                if (!pipeline) throw new Error('Pipeline not initialized');
                const { query, k, vectorWeight } = msg.payload;
                const hResults = pipeline.searchHybrid(query, k, vectorWeight);
                reply({ type: 'SEARCH_RESULTS', payload: { results: hResults } });
                break;
            }

            case 'SEARCH_RAPTOR': {
                if (!pipeline) throw new Error('Pipeline not initialized');
                const { query: rQuery, k: rK, mode } = msg.payload;
                const embedding = pipeline.embed(rQuery);
                const raptorResults = pipeline.searchRaptor(new Float32Array(embedding), rK, mode, 10);
                reply({ type: 'SEARCH_RESULTS', payload: { results: raptorResults } });
                break;
            }

            case 'SEARCH_WITH_DIVERSITY': {
                if (!pipeline) throw new Error('Pipeline not initialized');
                const { query: dQuery, k: dK, lambda } = msg.payload;
                const diverseResults = pipeline.searchWithDiversity(dQuery, dK, lambda);
                reply({ type: 'SEARCH_RESULTS', payload: { results: diverseResults } });
                break;
            }

            case 'SEARCH_WITH_VECTOR': {
                if (!pipeline) throw new Error('Pipeline not initialized');
                const { embedding: queryEmb, k: searchK } = msg.payload;
                const queryArray = Array.from(queryEmb);

                if (queryArray.length !== currentModelDim) {
                    throw new Error(`Query dimension mismatch: got ${queryArray.length}, expected ${currentModelDim}`);
                }

                const vectorResults = pipeline.searchRaptor(new Float32Array(queryArray), searchK, 'collapsed_leaves', 10);
                reply({ type: 'SEARCH_RESULTS', payload: { results: vectorResults } });
                break;
            }

            case 'HYDRATE': {
                if (!pipeline) throw new Error('Pipeline not initialized');
                const { chunks } = msg.payload;
                let hydratedCount = 0;
                let skippedCount = 0;

                for (const chunk of chunks) {
                    let emb = normalizeEmbedding(chunk.embedding);

                    if (!validateDimension(emb, currentModelDim)) {
                        if (currentTruncateDim && emb.length > currentTruncateDim) {
                            emb = truncateEmbedding(emb, currentTruncateDim);
                        } else {
                            // console.debug(`[RagWorker] Skipping chunk`);
                            skippedCount++;
                            continue;
                        }
                    } else if (currentTruncateDim && currentTruncateDim < emb.length) {
                        emb = truncateEmbedding(emb, currentTruncateDim);
                    }

                    try {
                        pipeline.insertChunk({
                            ...chunk,
                            embedding: emb
                        });
                        hydratedCount++;
                    } catch (e) {
                        console.warn('[RagWorker] insertChunk failed:', e);
                        skippedCount++;
                    }
                }

                // console.log(`[RagWorker] Hydrated ${hydratedCount} chunks`);
                reply({ type: 'INDEX_COMPLETE', payload: { notes: 0, chunks: hydratedCount } });
                break;
            }

            case 'GET_CHUNKS': {
                if (!pipeline) throw new Error('Pipeline not initialized');
                const allChunks = pipeline.getChunks();
                reply({ type: 'CHUNKS_RETRIEVED', payload: { chunks: allChunks } });
                break;
            }

            case 'GET_STATUS': {
                if (!pipeline) {
                    reply({
                        type: 'STATUS',
                        payload: { dims: 0, modelLoaded: false, externalMode: false, chunkCount: 0 }
                    });
                } else {
                    const pipelineStats = pipeline.getStats();
                    reply({
                        type: 'STATUS',
                        payload: {
                            dims: currentModelDim,
                            modelLoaded: pipeline.isModelLoaded(),
                            externalMode: useExternalEmbedding,
                            chunkCount: pipelineStats?.total_chunks ?? 0,
                        }
                    });
                }
                break;
            }
        }
    } catch (e) {
        console.error('[RagWorker] Error:', e);
        reply({ type: 'ERROR', payload: { message: e instanceof Error ? e.message : String(e) } });
    }
};
