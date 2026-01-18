// src/lib/dexie/hooks.ts
// Dexie React hooks using useLiveQuery for reactive updates
// UI automatically re-renders when Dexie data changes

import { useLiveQuery } from 'dexie-react-hooks';
import { dexieDb, type DexieNote, type DexieDecoration, type DexieEntity } from './db';

// ============================================================================
// NOTE HOOKS
// ============================================================================

/**
 * Get a single note by ID (reactive)
 */
export function useDexieNote(noteId: string | null) {
    return useLiveQuery(
        () => noteId ? dexieDb.notes.get(noteId) : undefined,
        [noteId]
    );
}

/**
 * Get all active notes (reactive)
 */
export function useDexieNotes() {
    return useLiveQuery(
        () => dexieDb.notes.where('status').equals('active').toArray()
    );
}

/**
 * Get notes in a folder (reactive)
 */
export function useDexieNotesByFolder(folderId: string | null) {
    return useLiveQuery(
        () => dexieDb.notes
            .where('folderId')
            .equals(folderId ?? '')
            .filter(n => n.status === 'active')
            .toArray(),
        [folderId]
    );
}

// ============================================================================
// DECORATION HOOKS
// ============================================================================

/**
 * Get decorations for a note (reactive)
 * Workers write here → UI auto-updates
 */
export function useDexieDecorations(noteId: string | null) {
    return useLiveQuery(
        () => noteId
            ? dexieDb.decorations.where('noteId').equals(noteId).toArray()
            : [],
        [noteId]
    );
}

// ============================================================================
// ENTITY HOOKS
// ============================================================================

/**
 * Get all active entities (reactive)
 */
export function useDexieEntities() {
    return useLiveQuery(
        () => dexieDb.entities.where('status').equals('active').toArray()
    );
}

/**
 * Get entities by kind (reactive)
 */
export function useDexieEntitiesByKind(kind: string) {
    return useLiveQuery(
        () => dexieDb.entities
            .where('kind')
            .equals(kind)
            .filter(e => e.status === 'active')
            .toArray(),
        [kind]
    );
}

// ============================================================================
// EDGE HOOKS
// ============================================================================

/**
 * Get edges for an entity (reactive)
 */
export function useDexieEdges(entityId: string | null) {
    return useLiveQuery(
        () => entityId
            ? dexieDb.edges
                .where('headId').equals(entityId)
                .or('tailId').equals(entityId)
                .toArray()
            : [],
        [entityId]
    );
}

// ============================================================================
// MENTION HOOKS
// ============================================================================

/**
 * Get mentions in a note (reactive)
 */
export function useDexieMentions(noteId: string | null) {
    return useLiveQuery(
        () => noteId
            ? dexieDb.mentions.where('noteId').equals(noteId).toArray()
            : [],
        [noteId]
    );
}

// ============================================================================
// MUTATIONS (non-reactive, for writes)
// ============================================================================

/**
 * Save a note to Dexie (local-first)
 */
export async function saveNote(note: Partial<DexieNote> & { id: string }): Promise<void> {
    const existing = await dexieDb.notes.get(note.id);
    const now = Date.now();

    if (existing) {
        await dexieDb.notes.update(note.id, {
            ...note,
            updatedAt: now,
            rev: (existing.rev || 0) + 1,
        });
    } else {
        await dexieDb.notes.add({
            id: note.id,
            folderId: note.folderId ?? null,
            title: note.title ?? '',
            docJson: note.docJson ?? '{}',
            markdownContent: note.markdownContent ?? '',
            status: 'active',
            updatedAt: now,
            rev: 0,
            ...note,
        });
    }

    // Queue for sync (fire and forget)
    queueSync('notes', note.id, 'upsert', note);
}

/**
 * Delete a note (soft delete)
 */
export async function deleteNote(noteId: string): Promise<void> {
    await dexieDb.notes.update(noteId, {
        status: 'deleted',
        updatedAt: Date.now(),
    });

    queueSync('notes', noteId, 'delete', { id: noteId });
}

/**
 * Save decorations for a note (called by workers)
 */
export async function saveDecorations(
    noteId: string,
    decorations: Array<{ type: string; start: number; end: number; payload: any }>
): Promise<void> {
    const now = Date.now();

    // Clear old decorations for this note
    await dexieDb.decorations.where('noteId').equals(noteId).delete();

    // Insert new decorations
    await dexieDb.decorations.bulkAdd(
        decorations.map(d => ({
            id: `${noteId}:${d.start}:${d.end}`,
            noteId,
            type: d.type,
            start: d.start,
            end: d.end,
            payload: typeof d.payload === 'string' ? d.payload : JSON.stringify(d.payload),
            updatedAt: now,
            rev: 0,
        }))
    );
}

// ============================================================================
// SYNC QUEUE (internal)
// ============================================================================

async function queueSync(
    table: string,
    pk: string,
    op: 'upsert' | 'delete',
    data: any
): Promise<void> {
    try {
        await dexieDb.syncOutbox.add({
            table,
            pk,
            op,
            data: JSON.stringify(data),
            clientTs: Date.now(),
        });
    } catch (err) {
        console.warn('[DexieSync] Failed to queue sync:', err);
    }
}
