// src/lib/nebuladb/db.ts
import { createDb } from './core'; // or index
// import { OPFSAdapter } from './adapters/opfs';
import { GraphStoreAdapter } from './adapters/graph';
import { nebulaSchema } from './schema';
import { BlobStore, GraphObjectStore, RealOpfsBackend, SCHEMA_V1 } from '@/lib/opfs';
import { cozoDb } from '@/lib/cozo/db';

// Initialize the Stack
const opfsBackend = new RealOpfsBackend();
const blobStore = new BlobStore(opfsBackend);

// Initialize GraphObjectStore
// We delay schema creation until cozoDb is ready, handled in adapter.connect usually or app boot
const graphStore = new GraphObjectStore(blobStore, {
    // Adapter for ICozoDb
    run: async (script, params) => {
        // Ensure ready
        if (!cozoDb.isReady()) await cozoDb.init();
        return cozoDb.run(script, params);
    }
});

// Ensure Schema exists on boot
// (This is a side-effect, maybe move to AppOrchestra later)
setTimeout(async () => {
    try {
        await cozoDb.init();
        const schemaScripts = SCHEMA_V1.split(/:(create|put|rm)/g).filter(s => s.trim().length > 0);
        // SCHEMA_V1 is a single block string with multiple creates. Cozo.run supports multi-statement?
        // Usually yes if separated properly.
        // Let's rely on cozoDb.run logic.
        // Actually, pure Cozo doesn't love multiple :create in one go without transaction or block.
        // But let's try. If it fails, we split.
        // SCHEMA_V1 has standard format.
        cozoDb.run(SCHEMA_V1);
    } catch (e) {
        console.warn("Schema init warning:", e);
    }
}, 1000);

// Create global instance with Graph Adapter
export const nebulaDb = createDb({
    adapter: new GraphStoreAdapter(graphStore)
});

// Initialize collections & connections
// We export these for easy usage: `import { notes } from '@/lib/nebuladb/db'`

export const notes = nebulaDb.collection('notes', nebulaSchema.notes);
export const entities = nebulaDb.collection('entities', nebulaSchema.entities);
export const mentions = nebulaDb.collection('mentions', nebulaSchema.mentions);
export const edges = nebulaDb.collection('edges', nebulaSchema.edges);
export const decorations = nebulaDb.collection('decorations', nebulaSchema.decorations);
export const decorationMeta = nebulaDb.collection('decorationMeta', nebulaSchema.decorationMeta);
export const syncOutbox = nebulaDb.collection('syncOutbox', nebulaSchema.syncOutbox);
export const syncState = nebulaDb.collection('syncState', nebulaSchema.syncState);
export const modelCache = nebulaDb.collection('modelCache', nebulaSchema.modelCache);
export const scannerCache = nebulaDb.collection('scannerCache', nebulaSchema.scannerCache);

// Connection is now handled by AppOrchestrator.phase1_NebulaDB()
// Do NOT auto-connect on import - this allows controlled boot sequence
