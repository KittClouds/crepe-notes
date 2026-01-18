/// <reference lib="webworker" />
// src/workers/rag.worker.ts
// RAG/Embedding worker - handles vector operations off main thread

import { normalizeEmbedding, getEmbeddingMeta, validateDimension, truncateEmbedding } from '@/lib/rag/embedding-utils';

// ============================================================================
// Types
// ============================================================================

type WorkerMessage =
    | { type: 'INIT' }
    | { type: 'LOAD_MODEL'; payload: { onnx: ArrayBuffer; tokenizer: string; dims?: number; truncate?: string } }
    | { type: 'SET_DIMENSIONS'; payload: { dims: number } }
    | { type: 'INDEX_NOTES'; payload: { notes: Array<{ id: string; title: string; content: string }> } }
    | { type: 'INSERT_VECTORS'; payload: { chunks: Array<{ id: string; note_id: string; note_title: string; chunk_index: number; text: string; embedding: Float32Array; start: number; end: number }> } }
    | { type: 'BUILD_RAPTOR'; payload: { clusterSize: number } }
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
    | { type: 'RAPTOR_BUILT'; payload: { stats: any } }
    | { type: 'SEARCH_RESULTS'; payload: { results: any[] } }
    | { type: 'CHUNKS_RETRIEVED'; payload: { chunks: any[] } }
    | { type: 'STATUS'; payload: { dims: number; modelLoaded: boolean; externalMode: boolean; chunkCount: number } }
    | { type: 'ERROR'; payload: { message: string } };

// ============================================================================
// Stub Pipeline (will be replaced by kittcore WASM when available)
// ============================================================================

class RagPipeline {
    private chunks: any[] = [];
    private dims = 256;

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
        this.chunks.push(chunk);
    }

    buildRaptorTree(_clusterSize: number) {
        return { nodes: 0, levels: 0 };
    }

    search(_query: string, k: number) {
        // Return top-k chunks by order
        return this.chunks.slice(0, k).map((c, i) => ({
            ...c,
            score: 1 - (i * 0.1),
        }));
    }

    searchHybrid(_query: string, k: number, _weight: number) {
        return this.search(_query, k);
    }

    searchRaptor(_embedding: Float32Array, k: number, _mode: string, _n: number) {
        return this.chunks.slice(0, k);
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
        return { total_chunks: this.chunks.length };
    }

    isModelLoaded() {
        return false;
    }
}

// ============================================================================
// Worker State
// ============================================================================

let pipeline: RagPipeline | null = null;
let initialized = false;
let currentModelDim = 256;
let currentTruncateDim: number | null = null;
let useExternalEmbedding = false;

// ============================================================================
// Message Handler
// ============================================================================

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
    const msg = e.data;
    console.log('[RagWorker] Received:', msg.type);

    try {
        switch (msg.type) {
            case 'INIT':
                if (!initialized) {
                    pipeline = new RagPipeline();
                    initialized = true;
                }
                self.postMessage({ type: 'INIT_COMPLETE' });
                break;

            case 'LOAD_MODEL': {
                if (!pipeline) throw new Error('Pipeline not initialized');
                const { onnx, tokenizer, dims, truncate } = msg.payload;

                pipeline.loadModel(new Uint8Array(onnx), tokenizer);

                currentModelDim = dims || 384;
                currentTruncateDim = truncate && truncate !== 'full' ? Number(truncate) : null;
                useExternalEmbedding = false;

                console.log(`[RagWorker] Model loaded. Native Dim: ${currentModelDim}, Truncate: ${currentTruncateDim || 'None'}`);
                self.postMessage({ type: 'MODEL_LOADED' });
                break;
            }

            case 'SET_DIMENSIONS': {
                if (!pipeline) throw new Error('Pipeline not initialized');
                const newDims = msg.payload.dims;

                pipeline.setDimensions(newDims);
                currentModelDim = newDims;
                useExternalEmbedding = true;

                console.log(`[RagWorker] External embedding mode. Dims: ${newDims}`);
                self.postMessage({ type: 'DIMENSIONS_SET', payload: { dims: newDims } });
                break;
            }

            case 'INDEX_NOTES': {
                if (!pipeline) throw new Error('Pipeline not initialized');
                if (useExternalEmbedding) {
                    throw new Error('INDEX_NOTES requires Rust model. Use INSERT_VECTORS for external embeddings.');
                }
                const notes = msg.payload.notes;
                const totalChunks = pipeline.indexNotes(notes);

                self.postMessage({
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
                            id: chunk.id,
                            note_id: chunk.note_id,
                            note_title: chunk.note_title,
                            chunk_index: chunk.chunk_index,
                            text: chunk.text,
                            embedding: embeddingArray,
                            start: chunk.start,
                            end: chunk.end,
                        });
                        insertedCount++;
                    } catch (e) {
                        console.warn('[RagWorker] INSERT_VECTORS chunk failed:', e);
                        insertErrors++;
                    }
                }

                console.log(`[RagWorker] INSERT_VECTORS: ${insertedCount} inserted, ${insertErrors} errors`);
                self.postMessage({
                    type: 'INDEX_COMPLETE',
                    payload: { notes: 0, chunks: insertedCount }
                });
                break;
            }

            case 'BUILD_RAPTOR': {
                if (!pipeline) throw new Error('Pipeline not initialized');
                const stats = pipeline.buildRaptorTree(msg.payload.clusterSize);
                self.postMessage({ type: 'RAPTOR_BUILT', payload: { stats } });
                break;
            }

            case 'SEARCH': {
                if (!pipeline) throw new Error('Pipeline not initialized');
                const results = pipeline.search(msg.payload.query, msg.payload.k);
                self.postMessage({ type: 'SEARCH_RESULTS', payload: { results } });
                break;
            }

            case 'SEARCH_HYBRID': {
                if (!pipeline) throw new Error('Pipeline not initialized');
                const { query, k, vectorWeight } = msg.payload;
                const hResults = pipeline.searchHybrid(query, k, vectorWeight);
                self.postMessage({ type: 'SEARCH_RESULTS', payload: { results: hResults } });
                break;
            }

            case 'SEARCH_RAPTOR': {
                if (!pipeline) throw new Error('Pipeline not initialized');
                const { query: rQuery, k: rK, mode } = msg.payload;
                const embedding = pipeline.embed(rQuery);
                const raptorResults = pipeline.searchRaptor(new Float32Array(embedding), rK, mode, 10);
                self.postMessage({ type: 'SEARCH_RESULTS', payload: { results: raptorResults } });
                break;
            }

            case 'SEARCH_WITH_DIVERSITY': {
                if (!pipeline) throw new Error('Pipeline not initialized');
                const { query: dQuery, k: dK, lambda } = msg.payload;
                const diverseResults = pipeline.searchWithDiversity(dQuery, dK, lambda);
                self.postMessage({ type: 'SEARCH_RESULTS', payload: { results: diverseResults } });
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
                self.postMessage({ type: 'SEARCH_RESULTS', payload: { results: vectorResults } });
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
                            console.debug(`[RagWorker] Skipping chunk: dim ${emb.length} != expected ${currentModelDim}`);
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

                console.log(`[RagWorker] Hydrated ${hydratedCount} chunks, skipped ${skippedCount}`);
                self.postMessage({ type: 'INDEX_COMPLETE', payload: { notes: 0, chunks: hydratedCount } });
                break;
            }

            case 'GET_CHUNKS': {
                if (!pipeline) throw new Error('Pipeline not initialized');
                const allChunks = pipeline.getChunks();
                self.postMessage({ type: 'CHUNKS_RETRIEVED', payload: { chunks: allChunks } });
                break;
            }

            case 'GET_STATUS': {
                if (!pipeline) {
                    self.postMessage({
                        type: 'STATUS',
                        payload: { dims: 0, modelLoaded: false, externalMode: false, chunkCount: 0 }
                    });
                } else {
                    const pipelineStats = pipeline.getStats();
                    self.postMessage({
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
        self.postMessage({ type: 'ERROR', payload: { message: e instanceof Error ? e.message : String(e) } });
    }
};
