// src/lib/db.ts
import { createDb, IndexedDBAdapter } from './nebuladb';

// Initialize adapter
export const adapter = new IndexedDBAdapter('crepe-notes-db', 3);

// Initialize DB
export const db = createDb({ adapter });

// Define known collection names for type safety / constants
export const Collections = {
    NOTES: 'notes',
    FOLDERS: 'folders',
    TAGS: 'tags',
    ENTITIES: 'entities',
    EDGES: 'edges',
    ATTRIBUTES: 'attributes',
    FACT_SHEETS: 'fact_sheets',
    NARRATIVE_ROOTS: 'narrative_roots',
    NARRATIVE_ELEMENTS: 'narrative_elements',
} as const;

// PRE-REGISTER COLLECTIONS to ensure they exist on first connect
// This populates pendingCollections in the adapter so onupgradeneeded creates them all at once.
Object.values(Collections).forEach(name => {
    db.collection(name);
});

// Ensure connection (optional, lazy connect is supported by adapter but this warms it up)
db.connect().then(() => {
    console.log('[NebulaDB] Connected to IndexedDB');
}).catch(err => {
    console.error('[NebulaDB] Connection failed', err);
});
