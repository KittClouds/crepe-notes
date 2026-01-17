import { createDb, IndexedDBAdapter } from './nebuladb';
import { OpfsAdapter } from './nebuladb/persistence/opfs-adapter';

// Feature Flag: Switch between IndexedDB (Legacy) and OPFS (New Hardened Snapshot)
const USE_OPFS_PERSISTENCE = true;

// Initialize adapter
export const adapter = USE_OPFS_PERSISTENCE
    ? new OpfsAdapter()
    : new IndexedDBAdapter('crepe-notes-db', 3);

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
    // Calendar collections
    CALENDAR_DEFINITIONS: 'calendar_definitions',
    CALENDAR_EVENTS: 'calendar_events',
    CALENDAR_PERIODS: 'calendar_periods',
} as const;

// PRE-REGISTER COLLECTIONS to ensure they exist on first connect
// This populates pendingCollections in the adapter so onupgradeneeded creates them all at once.
Object.values(Collections).forEach(name => {
    db.collection(name);
});

// Ensure connection (optional, lazy connect is supported by adapter but this warms it up)
db.connect().then(() => {
    console.log(`[NebulaDB] Connected to ${USE_OPFS_PERSISTENCE ? 'OPFS (Worker)' : 'IndexedDB'}`);
}).catch(err => {
    console.error('[NebulaDB] Connection failed', err);
});
