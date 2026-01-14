// src/types/noteTypes.ts
// Extended note types for entity and folder support

import type { EntityKind } from '@/lib/types/entityTypes';

export interface Note {
    id: string;
    title: string;
    content: string;  // Markdown content
    markdownContent?: string; // Alias for compatibility
    parent_id?: string | null;
    folderId?: string | null;
    tags?: string[];
    createdAt?: Date;
    updatedAt?: Date;
    updated_at?: number;
    ownerId?: string;

    // Entity fields
    isEntity?: boolean | number;
    entityKind?: EntityKind;
    entitySubtype?: string;
    entityLabel?: string;

    // UI state
    favorite?: number;
    isPinned?: number;
}

export interface Folder {
    id: string;
    name: string;
    parentId?: string | null;
    parent_id?: string | null;
    ownerId?: string;
    createdAt?: Date;
    updatedAt?: Date;

    // Entity/typing
    color?: string;
    entityKind?: EntityKind;
    entity_kind?: EntityKind;
    entitySubtype?: string;
    entity_subtype?: string;
    entityLabel?: string;
    entity_label?: string;
    isTypedRoot?: boolean;
    is_typed_root?: number;

    // Network
    networkId?: string;

    // Inherited from parent
    inheritedKind?: EntityKind;
    inherited_kind?: EntityKind;
    inheritedSubtype?: string;
    inherited_subtype?: string;
}

export interface FolderWithChildren extends Folder {
    children: FolderWithChildren[];
    notes: Note[];
}

export interface Tag {
    id: string;
    name: string;
    color: string;
    ownerId?: string;
}

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';
