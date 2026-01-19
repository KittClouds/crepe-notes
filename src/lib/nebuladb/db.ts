// src/lib/nebuladb/db.ts
import { createDb } from './core'; // or index
import { OPFSAdapter } from './adapters/opfs';
import { nebulaSchema } from './schema';

// Create global instance
export const nebulaDb = createDb({
    adapter: new OPFSAdapter()
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
