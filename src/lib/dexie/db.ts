import Dexie, { Table } from 'dexie';

// =============================================================================
// INTERFACES (1:1 with CozoDB ContentSchema)
// =============================================================================

export interface Note {
    id: string;
    worldId: string;
    title: string;
    content: string;
    markdownContent: string;
    folderId: string;
    entityKind: string;
    entitySubtype: string;
    isEntity: boolean;
    isPinned: boolean;
    favorite: boolean;
    ownerId: string;
    createdAt: number;
    updatedAt: number;
}

export interface Folder {
    id: string;
    worldId: string;
    name: string;
    parentId: string;
    entityKind: string;
    entitySubtype: string;
    entityLabel: string;
    color: string;
    isTypedRoot: boolean;
    isSubtypeRoot: boolean;
    collapsed: boolean;
    ownerId: string;
    createdAt: number;
    updatedAt: number;
    // Narrative Vault Isolation
    narrativeId: string;
    isNarrativeRoot: boolean;
}

export interface Tag {
    id: string;
    worldId: string;
    name: string;
    color: string;
    ownerId: string;
}

export interface NoteTag {
    noteId: string;
    tagId: string;
}

export interface Entity {
    id: string;
    label: string;
    kind: string;
    subtype?: string;
    aliases: string[];
    firstNote: string;
    totalMentions: number;
    createdAt: number;
    updatedAt: number;
    createdBy: 'user' | 'extraction' | 'auto';
}

export interface Mention {
    id: string;
    noteId: string;
    entityId: string;
    start: number;
    end: number;
    matchType: string;
}

export interface Edge {
    id: string;
    sourceId: string;
    targetId: string;
    relType: string;
    confidence: number;
    bidirectional: boolean;
}

export interface DecorationMeta {
    noteId: string;
    version: number;
    lastScan: number;
}

export interface DecorationSpans {
    noteId: string;
    // Stored as generic JSON to avoid circular dependency with Scanner types if needed,
    // but strictly it's DecorationSpan[]
    spans: any[];
    contentHash: string;
    updatedAt: number;
}

export interface ScannerCache {
    id: string;
    data: Uint8Array;
    createdAt: number;
}

export interface ModelCache {
    modelId: string;
    onnx: ArrayBuffer;
    tokenizer: string;
    timestamp: number;
}

// Entity metadata (key-value store for fact sheets)
export interface EntityMetadata {
    entityId: string;
    key: string;
    value: string;
}

// Entity cards (custom groupings for fact sheets)
export interface EntityCard {
    entityId: string;
    cardId: string;
    name: string;
    color: string;
    icon: string;
    displayOrder: number;
    isCollapsed: boolean;
    createdAt: number;
    updatedAt: number;
}

// =============================================================================
// DEXIE DATABASE
// =============================================================================

export class CrepeDatabase extends Dexie {
    notes!: Table<Note>;
    folders!: Table<Folder>;
    tags!: Table<Tag>;
    noteTags!: Table<NoteTag>;
    entities!: Table<Entity>;
    mentions!: Table<Mention>;
    edges!: Table<Edge>;
    decorationMeta!: Table<DecorationMeta>;
    decorationSpans!: Table<DecorationSpans>;
    scannerCache!: Table<ScannerCache>;
    modelCache!: Table<ModelCache>;
    entityMetadata!: Table<EntityMetadata>;
    entityCards!: Table<EntityCard>;

    constructor() {
        super('CrepeNotes');

        this.version(2).stores({
            // Notes: indexed by folderId for folder view, title for search
            notes: 'id, worldId, folderId, title, entityKind, isEntity, isPinned, favorite, updatedAt',

            // Folders: indexed by parentId for tree, entityKind for filtering
            folders: 'id, worldId, parentId, entityKind, isTypedRoot, isSubtypeRoot',

            // Tags: indexed by name
            tags: 'id, worldId, name',

            // Note-Tag junction
            noteTags: '[noteId+tagId], noteId, tagId',

            // Entities: indexed by kind, label (for search)
            entities: 'id, kind, label, createdAt',

            // Mentions: indexed by noteId, entityId
            mentions: 'id, noteId, entityId',

            // Edges: indexed by source/target
            edges: 'id, sourceId, targetId, relType',

            // Decoration metadata: keyed by noteId
            decorationMeta: 'noteId',

            // Decoration Spans (New Phase 2 Persistence)
            decorationSpans: 'noteId',

            // Scanner cache (DAFSA trie)
            scannerCache: 'id',

            // Model cache (ONNX + tokenizer)
            modelCache: 'modelId',

            // Entity metadata (fact sheet key-value pairs)
            entityMetadata: '[entityId+key], entityId',

            // Entity cards (fact sheet custom cards)
            entityCards: '[entityId+cardId], entityId, displayOrder'
        });
    }
}

export const db = new CrepeDatabase();
