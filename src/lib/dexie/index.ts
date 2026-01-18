// Dexie local-first persistence layer
// Primary: notes, entities, edges, decorations, mentions
// Syncs to CozoDB for graph queries (background async)

export * from './db';
export * from './hooks';
export * from './decorations';
export * from './sync';
