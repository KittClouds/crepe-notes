// src/lib/nebuladb/schema.ts
import { CollectionOptions } from './types';

export const nebulaSchema: Record<string, CollectionOptions> = {
    notes: {
        name: 'notes',
        indexes: [
            { name: 'folderId', fields: ['folderId'] }, // For folder view
            { name: 'status', fields: ['status'] }      // For fetching active
        ]
    },
    entities: {
        name: 'entities',
        indexes: [
            { name: 'kind', fields: ['kind'] },
            { name: 'status', fields: ['status'] }
        ]
    },
    mentions: {
        name: 'mentions',
        indexes: [{ name: 'noteId', fields: ['noteId'] }]
    },
    edges: {
        name: 'edges',
        indexes: [
            { name: 'headId', fields: ['headId'] },
            { name: 'tailId', fields: ['tailId'] }
        ]
    },
    decorations: {
        name: 'decorations',
        indexes: [{ name: 'noteId', fields: ['noteId'] }]
    },
    decorationMeta: { name: 'decorationMeta' }, // Keyed by noteId (main ID)
    syncOutbox: {
        name: 'syncOutbox',
        indexes: [{ name: 'clientTs', fields: ['clientTs'] }] // For ordering
    },
    syncState: { name: 'syncState' },
    modelCache: { name: 'modelCache' },
};
