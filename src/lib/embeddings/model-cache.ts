// src/lib/embeddings/model-cache.ts
// Model cache using Dexie (unified with app database)

import { dexieDb, type CachedModel } from '@/lib/dexie/db';

// Re-export type for convenience
export type { CachedModel };

/**
 * Model cache for ONNX embedding model files.
 * Uses Dexie (IndexedDB) for efficient binary blob storage.
 */
export const modelCache = {
    /**
     * Get a cached model by ID
     */
    async get(modelId: string): Promise<CachedModel | undefined> {
        try {
            return await dexieDb.modelCache.get(modelId);
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
            const record: CachedModel = {
                modelId,
                onnx,
                tokenizer,
                timestamp: Date.now(),
            };
            await dexieDb.modelCache.put(record);
            console.log(`[ModelCache] Cached ${modelId} (${(onnx.byteLength / 1024 / 1024).toFixed(1)} MB)`);
        } catch (err) {
            console.error('[ModelCache] Failed to cache model:', err);
        }
    },

    /**
     * Delete a cached model
     */
    async delete(modelId: string): Promise<void> {
        await dexieDb.modelCache.delete(modelId);
    },

    /**
     * Clear all cached models
     */
    async clear(): Promise<void> {
        await dexieDb.modelCache.clear();
    },

    /**
     * List all cached model IDs
     */
    async list(): Promise<string[]> {
        const models = await dexieDb.modelCache.toArray();
        return models.map(m => m.modelId);
    },

    /**
     * Get cache stats
     */
    async getStats(): Promise<{ count: number; totalBytes: number }> {
        const models = await dexieDb.modelCache.toArray();
        const totalBytes = models.reduce((sum, m) => sum + m.onnx.byteLength, 0);
        return { count: models.length, totalBytes };
    }
};
