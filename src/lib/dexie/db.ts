// src/lib/dexie/db.ts
// Local-first database using Dexie (IndexedDB wrapper)
// UI reads/writes only Dexie; sync to Cozo is background async

import Dexie, { type EntityTable } from 'dexie';

// ============================================================================
// INTERFACES
// ============================================================================

export interface DexieNote {
    id: string;
    folderId: string | null;
    title: string;
    docJson: string;              // ProseMirror JSON (canonical)
    markdownContent: string;      // Derived for search/scan
    entityKind?: string;
    entityLabel?: string;
    isEntity?: number;
    status: 'active' | 'deleted';
    updatedAt: number;
    rev: number;                  // For sync conflict detection
}

export interface DexieEntity {
    id: string;
    scopeId: string;              // Workspace scope
    label: string;
    kind: string;
    aliases: string[];
    status: 'active' | 'deleted';
    updatedAt: number;
    rev: number;
}

export interface DexieMention {
    id: string;                   // noteId:start:end
    noteId: string;
    entityId: string;
    start: number;
    end: number;
    updatedAt: number;
    rev: number;
}

export interface DexieEdge {
    id: string;
    scopeId: string;
    headId: string;               // Source entity
    tailId: string;               // Target entity
    relType: string;
    evidenceNoteId?: string;
    updatedAt: number;
    rev: number;
}

export interface DexieDecoration {
    id: string;                   // noteId:start:end
    noteId: string;
    type: string;                 // 'entity_implicit' | 'wikilink' | ...
    start: number;
    end: number;
    payload: string;              // JSON: { label, kind, entityId, ... }
    updatedAt: number;
    rev: number;
}

export interface SyncOutboxEntry {
    opId?: number;                // Auto-increment
    table: string;
    pk: string;
    op: 'upsert' | 'delete';
    data: string;
    clientTs: number;
}

export interface SyncState {
    id: string;                   // 'main'
    lastServerCursor: string;
    lastSyncTs: number;
}

export interface DecorationMeta {
    noteId: string;
    contentHash: string;          // Hash of content when decorations were computed
    updatedAt: number;
}

export interface CachedModel {
    modelId: string;              // Primary key
    onnx: ArrayBuffer;            // ONNX model binary
    tokenizer: string;            // tokenizer.json content
    timestamp: number;            // When cached
}

// ============================================================================
// DATABASE CLASS
// ============================================================================

class AppDB extends Dexie {
    notes!: EntityTable<DexieNote, 'id'>;
    entities!: EntityTable<DexieEntity, 'id'>;
    mentions!: EntityTable<DexieMention, 'id'>;
    edges!: EntityTable<DexieEdge, 'id'>;
    decorations!: EntityTable<DexieDecoration, 'id'>;
    decorationMeta!: EntityTable<DecorationMeta, 'noteId'>;
    syncOutbox!: EntityTable<SyncOutboxEntry, 'opId'>;
    syncState!: EntityTable<SyncState, 'id'>;
    modelCache!: EntityTable<CachedModel, 'modelId'>;


    constructor() {
        super('crepe_notes');

        // v1: Original schema (kept for migration)
        this.version(1).stores({
            notes: 'id, folderId, status, updatedAt',
            decorations: 'id, noteId',
            entities: 'id, label, kind, status',
        });

        // v2: Full local-first schema
        this.version(2).stores({
            notes: 'id, folderId, status, updatedAt, rev',
            entities: 'id, scopeId, label, kind, status, updatedAt, rev',
            mentions: 'id, noteId, entityId, updatedAt',
            edges: 'id, scopeId, headId, tailId, relType, updatedAt',
            decorations: 'id, noteId, type, updatedAt',
            syncOutbox: '++opId, table, pk, clientTs',
            syncState: 'id',
        }).upgrade(tx => {
            // Migrate v1 notes to v2 format
            return tx.table('notes').toCollection().modify(note => {
                if (!('rev' in note)) {
                    note.rev = 0;
                }
                if (!('docJson' in note)) {
                    note.docJson = note.content || '{}';
                }
            });
        });

        // v3: Add decorationMeta for content hash validation
        this.version(3).stores({
            notes: 'id, folderId, status, updatedAt, rev',
            entities: 'id, scopeId, label, kind, status, updatedAt, rev',
            mentions: 'id, noteId, entityId, updatedAt',
            edges: 'id, scopeId, headId, tailId, relType, updatedAt',
            decorations: 'id, noteId, type, updatedAt',
            decorationMeta: 'noteId',
            syncOutbox: '++opId, table, pk, clientTs',
            syncState: 'id',
        });

        // v4: Add modelCache for ONNX model caching
        this.version(4).stores({
            notes: 'id, folderId, status, updatedAt, rev',
            entities: 'id, scopeId, label, kind, status, updatedAt, rev',
            mentions: 'id, noteId, entityId, updatedAt',
            edges: 'id, scopeId, headId, tailId, relType, updatedAt',
            decorations: 'id, noteId, type, updatedAt',
            decorationMeta: 'noteId',
            syncOutbox: '++opId, table, pk, clientTs',
            syncState: 'id',
            modelCache: 'modelId',  // NEW: ONNX model file cache
        });
    }
}

export const dexieDb = new AppDB();
