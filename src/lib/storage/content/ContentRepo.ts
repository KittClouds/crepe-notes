/**
 * Content Repository - Dexie Backend
 * 
 * Replaces CozoDB with Dexie (IndexedDB) for notes, folders, tags.
 * All methods are now async to work with IndexedDB.
 */

import { db } from '@/lib/dexie/db';
import type { Note as DexieNote, Folder as DexieFolder, Tag as DexieTag } from '@/lib/dexie/db';

// Re-export types with content-specific names
export type { DexieNote as Note, DexieFolder as Folder, DexieTag as Tag };

// =============================================================================
// CONTENT TYPES (Compatibility layer)
// =============================================================================

// Note types compatible with existing code
export interface NoteInput {
    worldId: string;
    title: string;
    content?: string;
    markdownContent?: string;
    folderId?: string | null;
    entityKind?: string;
    entitySubtype?: string;
    isEntity?: boolean;
}

export interface NoteUpdate {
    title?: string;
    content?: string;
    markdownContent?: string;
    folderId?: string | null;
    entityKind?: string | null;
    entitySubtype?: string | null;
    isEntity?: boolean;
    isPinned?: boolean;
    favorite?: boolean;
}

export interface NoteSummary {
    id: string;
    title: string;
    isPinned: boolean;
    favorite: boolean;
    entityKind: string | null;
    updatedAt: Date;
}

// Folder types
export interface FolderInput {
    worldId: string;
    name: string;
    parentId?: string | null;
    entityKind?: string;
    entitySubtype?: string;
    entityLabel?: string;
    color?: string;
    isTypedRoot?: boolean;
    isSubtypeRoot?: boolean;
    // Narrative Vault Isolation
    narrativeId?: string | null;
    isNarrativeRoot?: boolean;
}

export interface FolderUpdate {
    name?: string;
    parentId?: string | null;
    entityKind?: string | null;
    entitySubtype?: string | null;
    entityLabel?: string | null;
    color?: string | null;
    collapsed?: boolean;
}

export interface FolderTreeNode {
    folder: DexieFolder;
    children: FolderTreeNode[];
    notes: NoteSummary[];
}

// Tag types
export interface TagInput {
    worldId: string;
    name: string;
    color?: string;
}

// Constants
export const DEFAULT_WORLD_ID = 'default';
export const DEFAULT_OWNER_ID = 'local-user';
export const DEFAULT_NOTE_CONTENT = '';

// =============================================================================
// HELPERS
// =============================================================================

function now(): number {
    return Date.now();
}

function generateId(): string {
    return crypto.randomUUID();
}

function emptyToNull(s: string | null | undefined): string | null {
    if (!s || s === '') return null;
    return s;
}

function nullToEmpty(s: string | null | undefined): string {
    return s ?? '';
}

// =============================================================================
// NOTE REPOSITORY
// =============================================================================

export class NoteRepo {
    /**
     * Create a new note
     */
    static async create(input: NoteInput): Promise<DexieNote> {
        const id = generateId();
        const timestamp = now();
        const content = input.content ?? '';
        const markdownContent = input.markdownContent ?? content;

        const note: DexieNote = {
            id,
            worldId: input.worldId,
            title: input.title,
            content,
            markdownContent,
            folderId: nullToEmpty(input.folderId),
            entityKind: nullToEmpty(input.entityKind),
            entitySubtype: nullToEmpty(input.entitySubtype),
            isEntity: input.isEntity ?? false,
            isPinned: false,
            favorite: false,
            ownerId: DEFAULT_OWNER_ID,
            createdAt: timestamp,
            updatedAt: timestamp,
        };

        await db.notes.add(note);
        return note;
    }

    /**
     * Get a note by ID
     */
    static async get(id: string): Promise<DexieNote | null> {
        const note = await db.notes.get(id);
        return note ?? null;
    }

    /**
     * List all notes (optionally filtered by world)
     */
    static async listAll(worldId: string = 'default'): Promise<DexieNote[]> {
        return db.notes
            .where('worldId')
            .equals(worldId)
            .reverse()
            .sortBy('updatedAt');
    }

    /**
     * List notes in a specific folder
     */
    static async listByFolder(folderId: string | null): Promise<DexieNote[]> {
        const targetFolderId = folderId ?? '';
        return db.notes
            .where('folderId')
            .equals(targetFolderId)
            .reverse()
            .sortBy('updatedAt');
    }

    /**
     * Update a note
     */
    static async update(id: string, updates: NoteUpdate): Promise<DexieNote | null> {
        const existing = await this.get(id);
        if (!existing) return null;

        const updated: Partial<DexieNote> = {
            ...updates,
            folderId: updates.folderId !== undefined ? nullToEmpty(updates.folderId) : existing.folderId,
            entityKind: updates.entityKind !== undefined ? nullToEmpty(updates.entityKind) : existing.entityKind,
            entitySubtype: updates.entitySubtype !== undefined ? nullToEmpty(updates.entitySubtype) : existing.entitySubtype,
            updatedAt: now(),
        };

        await db.notes.update(id, updated);
        return this.get(id);
    }

    /**
     * Delete a note
     */
    static async delete(id: string): Promise<boolean> {
        // Also delete note_tags associations
        await db.noteTags.where('noteId').equals(id).delete();
        await db.notes.delete(id);
        return (await this.get(id)) === null;
    }

    /**
     * Search notes by title or content
     */
    static async search(query: string, worldId: string = 'default'): Promise<DexieNote[]> {
        const lowerQuery = query.toLowerCase();
        const all = await this.listAll(worldId);
        return all.filter(note =>
            note.title.toLowerCase().includes(lowerQuery) ||
            note.markdownContent.toLowerCase().includes(lowerQuery)
        );
    }

    /**
     * Find note by title (for wikilink resolution)
     */
    static async findByTitle(title: string, worldId: string = 'default'): Promise<DexieNote | null> {
        const lowerTitle = title.toLowerCase();
        const all = await this.listAll(worldId);

        // Exact match first
        const exact = all.find(n => n.title.toLowerCase() === lowerTitle);
        if (exact) return exact;

        // Partial match
        const partial = all.find(n => n.title.toLowerCase().includes(lowerTitle));
        return partial ?? null;
    }
}

// =============================================================================
// FOLDER REPOSITORY
// =============================================================================

export class FolderRepo {
    /**
     * Create a new folder
     */
    static async create(input: FolderInput): Promise<DexieFolder> {
        const id = generateId();
        const timestamp = now();

        const folder: DexieFolder = {
            id,
            worldId: input.worldId,
            name: input.name,
            parentId: nullToEmpty(input.parentId),
            entityKind: nullToEmpty(input.entityKind),
            entitySubtype: nullToEmpty(input.entitySubtype),
            entityLabel: nullToEmpty(input.entityLabel),
            color: nullToEmpty(input.color),
            isTypedRoot: input.isTypedRoot ?? false,
            isSubtypeRoot: input.isSubtypeRoot ?? false,
            collapsed: false,
            ownerId: DEFAULT_OWNER_ID,
            createdAt: timestamp,
            updatedAt: timestamp,
            // Narrative Vault Isolation
            narrativeId: nullToEmpty(input.narrativeId),
            isNarrativeRoot: input.isNarrativeRoot ?? false,
        };

        await db.folders.add(folder);
        return folder;
    }

    /**
     * Get a folder by ID
     */
    static async get(id: string): Promise<DexieFolder | null> {
        const folder = await db.folders.get(id);
        return folder ?? null;
    }

    /**
     * List all folders
     */
    static async listAll(worldId: string = 'default'): Promise<DexieFolder[]> {
        return db.folders
            .where('worldId')
            .equals(worldId)
            .sortBy('name');
    }

    /**
     * Update a folder
     */
    static async update(id: string, updates: FolderUpdate): Promise<DexieFolder | null> {
        const existing = await this.get(id);
        if (!existing) return null;

        const updated: Partial<DexieFolder> = {
            name: updates.name ?? existing.name,
            parentId: updates.parentId !== undefined ? nullToEmpty(updates.parentId) : existing.parentId,
            entityKind: updates.entityKind !== undefined ? nullToEmpty(updates.entityKind) : existing.entityKind,
            entitySubtype: updates.entitySubtype !== undefined ? nullToEmpty(updates.entitySubtype) : existing.entitySubtype,
            entityLabel: updates.entityLabel !== undefined ? nullToEmpty(updates.entityLabel) : existing.entityLabel,
            color: updates.color !== undefined ? nullToEmpty(updates.color) : existing.color,
            collapsed: updates.collapsed ?? existing.collapsed,
            updatedAt: now(),
        };

        await db.folders.update(id, updated);
        return this.get(id);
    }

    /**
     * Delete a folder
     */
    static async delete(id: string): Promise<boolean> {
        await db.folders.delete(id);
        return (await this.get(id)) === null;
    }

    /**
     * Get folder tree (recursive structure)
     */
    static async getTree(worldId: string = 'default'): Promise<FolderTreeNode[]> {
        const folders = await this.listAll(worldId);
        const notes = await NoteRepo.listAll(worldId);

        // Index by ID
        const folderMap = new Map<string, DexieFolder>();
        const childrenMap = new Map<string | null, string[]>();

        for (const folder of folders) {
            folderMap.set(folder.id, folder);
            const parentKey = folder.parentId || null;
            if (!childrenMap.has(parentKey)) childrenMap.set(parentKey, []);
            childrenMap.get(parentKey)!.push(folder.id);
        }

        // Index notes by folder
        const notesByFolder = new Map<string, NoteSummary[]>();
        for (const note of notes) {
            const folderId = note.folderId ?? '';
            if (!notesByFolder.has(folderId)) notesByFolder.set(folderId, []);
            notesByFolder.get(folderId)!.push({
                id: note.id,
                title: note.title,
                isPinned: note.isPinned,
                favorite: note.favorite,
                entityKind: note.entityKind || null,
                updatedAt: new Date(note.updatedAt),
            });
        }

        // Build tree recursively
        const buildNode = (folderId: string): FolderTreeNode | null => {
            const folder = folderMap.get(folderId);
            if (!folder) return null;

            const childIds = childrenMap.get(folderId) || [];
            const children = childIds
                .map(id => buildNode(id))
                .filter((n): n is FolderTreeNode => n !== null);

            const folderNotes = notesByFolder.get(folderId) || [];

            return { folder, children, notes: folderNotes };
        };

        // Find roots (no parent)
        const rootIds = childrenMap.get(null) || [];
        return rootIds
            .map(id => buildNode(id))
            .filter((n): n is FolderTreeNode => n !== null);
    }
}

// =============================================================================
// TAG REPOSITORY
// =============================================================================

export class TagRepo {
    /**
     * Create a new tag
     */
    static async create(input: TagInput): Promise<DexieTag> {
        const id = generateId();

        const tag: DexieTag = {
            id,
            worldId: input.worldId,
            name: input.name,
            color: input.color ?? '#3b82f6',
            ownerId: DEFAULT_OWNER_ID,
        };

        await db.tags.add(tag);
        return tag;
    }

    /**
     * Get a tag by ID
     */
    static async get(id: string): Promise<DexieTag | null> {
        const tag = await db.tags.get(id);
        return tag ?? null;
    }

    /**
     * List all tags
     */
    static async listAll(worldId: string = 'default'): Promise<DexieTag[]> {
        return db.tags
            .where('worldId')
            .equals(worldId)
            .sortBy('name');
    }

    /**
     * Delete a tag
     */
    static async delete(id: string): Promise<boolean> {
        // Remove from note_tags first
        await db.noteTags.where('tagId').equals(id).delete();
        await db.tags.delete(id);
        return true;
    }

    /**
     * Add tag to note
     */
    static async addToNote(noteId: string, tagId: string): Promise<void> {
        await db.noteTags.put({ noteId, tagId });
    }

    /**
     * Remove tag from note
     */
    static async removeFromNote(noteId: string, tagId: string): Promise<void> {
        await db.noteTags.where({ noteId, tagId }).delete();
    }

    /**
     * Get tags for a note
     */
    static async getForNote(noteId: string): Promise<DexieTag[]> {
        const noteTags = await db.noteTags.where('noteId').equals(noteId).toArray();
        const tagIds = noteTags.map(nt => nt.tagId);

        if (tagIds.length === 0) return [];

        const tags = await db.tags.where('id').anyOf(tagIds).toArray();
        return tags;
    }
}

// =============================================================================
// CONTENT REPO INITIALIZATION
// =============================================================================

let contentInitialized = false;

/**
 * Initialize content repository
 * Dexie auto-creates tables, so this just marks as initialized
 */
export function initContentRepo(): void {
    if (contentInitialized) return;
    console.log(`[ContentRepo] ✅ Initialized (Dexie backend)`);
    contentInitialized = true;
}

/**
 * Check if content repo is initialized
 */
export function isContentRepoInitialized(): boolean {
    return contentInitialized;
}
