import { useLiveQuery } from 'dexie-react-hooks';
import { db, Note, Folder, Entity } from './db';

// =============================================================================
// NOTE HOOKS
// =============================================================================

export function useNotes(folderId?: string) {
    return useLiveQuery(async () => {
        if (folderId) {
            return db.notes.where('folderId').equals(folderId).toArray();
        }
        return db.notes.toArray();
    }, [folderId]);
}

export function useNote(id: string) {
    return useLiveQuery(() => db.notes.get(id), [id]);
}

export function useActiveNotes() {
    return useLiveQuery(() =>
        db.notes.orderBy('updatedAt').reverse().toArray()
    );
}

export function usePinnedNotes() {
    return useLiveQuery(() =>
        db.notes.where('isPinned').equals(1).toArray()
    );
}

// =============================================================================
// FOLDER HOOKS
// =============================================================================

export function useFolders() {
    return useLiveQuery(() => db.folders.toArray());
}

export function useFolder(id: string) {
    return useLiveQuery(() => db.folders.get(id), [id]);
}

export function useFolderTree(parentId?: string) {
    return useLiveQuery(async () => {
        if (parentId) {
            return db.folders.where('parentId').equals(parentId).toArray();
        }
        return db.folders.where('parentId').equals('').toArray();
    }, [parentId]);
}

// =============================================================================
// ENTITY HOOKS
// =============================================================================

export function useEntities(kind?: string) {
    return useLiveQuery(async () => {
        if (kind) {
            return db.entities.where('kind').equals(kind).toArray();
        }
        return db.entities.toArray();
    }, [kind]);
}

export function useEntity(id: string) {
    return useLiveQuery(() => db.entities.get(id), [id]);
}

// =============================================================================
// MENTION HOOKS
// =============================================================================

export function useMentionsForNote(noteId: string) {
    return useLiveQuery(() =>
        db.mentions.where('noteId').equals(noteId).toArray()
        , [noteId]);
}

export function useMentionsForEntity(entityId: string) {
    return useLiveQuery(() =>
        db.mentions.where('entityId').equals(entityId).toArray()
        , [entityId]);
}
