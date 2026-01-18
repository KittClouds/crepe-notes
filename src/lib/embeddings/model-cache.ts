// src/lib/embeddings/model-cache.ts
// Model cache using NebulaDB (unified with app database)

import { modelCache as modelCacheCollection } from '@/lib/nebuladb/db';

// Type definition (previously from Dexie)
export interface CachedModel {
    modelId: string;              // Primary key
    onnx: ArrayBuffer;            // ONNX model binary
    tokenizer: string;            // tokenizer.json content
    timestamp: number;            // When cached
}

/**
 * Model cache for ONNX embedding model files.
 * Uses NebulaDB (OPFS) for efficient binary blob storage.
 */
export const modelCache = {
    /**
     * Get a cached model by ID
     */
    async get(modelId: string): Promise<CachedModel | undefined> {
        try {
            const doc = await modelCacheCollection.findOne({ id: modelId });
            if (!doc) return undefined;
            return {
                modelId: doc.id,
                onnx: doc.onnx,
                tokenizer: doc.tokenizer,
                timestamp: doc.timestamp,
            };
        } catch (err) {
            console.warn('[ModelCache] Failed to get model:', err);
            return undefined;
        }
    },

    /**
     * Cache a model (ONNX binary + tokenizer JSON)
     */
    async put(modelId: string, onnx: ArrayBuffer, tokenizer: string): Promise<void> {
        try {
            // Check if exists
            const existing = await modelCacheCollection.findOne({ id: modelId });
            if (existing) {
                await modelCacheCollection.update({ id: modelId }, {
                    $set: { onnx, tokenizer, timestamp: Date.now() }
                });
            } else {
                await modelCacheCollection.insert({
                    id: modelId,
                    onnx,
                    tokenizer,
                    timestamp: Date.now(),
                });
            }
            console.log(`[ModelCache] Cached ${modelId} (${(onnx.byteLength / 1024 / 1024).toFixed(1)} MB)`);
        } catch (err) {
            console.error('[ModelCache] Failed to cache model:', err);
        }
    },

    /**
     * Delete a cached model
     */
    async delete(modelId: string): Promise<void> {
        await modelCacheCollection.delete({ id: modelId });
    },

    /**
     * Clear all cached models
     */
    async clear(): Promise<void> {
        await modelCacheCollection.clear();
    },

    /**
     * List all cached model IDs
     */
    async list(): Promise<string[]> {
        const models = await modelCacheCollection.find({});
        return models.map(m => m.id);
    },

    /**
     * Get cache stats
     */
    async getStats(): Promise<{ count: number; totalBytes: number }> {
        const models = await modelCacheCollection.find({});
        const totalBytes = models.reduce((sum, m) => sum + (m.onnx?.byteLength || 0), 0);
        return { count: models.length, totalBytes };
    }
};
