// src/lib/nebuladb/mutations.ts
// Write mutations for NebulaDB (non-reactive, for data changes)
// Replaces dexie/hooks.ts mutations

import { notes, decorations, decorationMeta, syncOutbox } from './db';
import type { NebulaNote, NebulaDecoration } from './hooks';

// ============================================================================
// NOTE MUTATIONS
// ============================================================================

/**
 * Save a note to NebulaDB (local-first)
 */
export async function saveNote(note: Partial<NebulaNote> & { id: string }): Promise<void> {
    const existing = await notes.findOne({ id: note.id });
    const now = Date.now();

    if (existing) {
        await notes.update({ id: note.id }, {
            $set: {
                ...note,
                updatedAt: now,
                rev: ((existing as any).rev || 0) + 1,
            }
        });
    } else {
        await notes.insert({
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
    await notes.update({ id: noteId }, {
        $set: {
            status: 'deleted',
            updatedAt: Date.now(),
        }
    });

    queueSync('notes', noteId, 'delete', { id: noteId });
}

// ============================================================================
// DECORATION MUTATIONS
// ============================================================================

/**
 * Save decorations for a note (called by workers)
 */
export async function saveDecorations(
    noteId: string,
    spans: Array<{ type: string; start: number; end: number; payload: any }>,
    contentHash?: string
): Promise<void> {
    const now = Date.now();

    // Clear old decorations for this note
    await decorations.delete({ noteId });

    // Insert new decorations
    if (spans.length > 0) {
        await decorations.insertBatch(
            spans.map(d => ({
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

    // Save content hash for position validation
    if (contentHash) {
        const existing = await decorationMeta.findOne({ noteId });
        if (existing) {
            await decorationMeta.update({ noteId }, { $set: { contentHash, updatedAt: now } });
        } else {
            await decorationMeta.insert({ id: noteId, noteId, contentHash, updatedAt: now });
        }
    }

    console.log(`[NebulaDB] Saved ${spans.length} decorations for note ${noteId}`);
}

/**
 * Clear all decorations for a note
 */
export async function clearNoteDecorations(noteId: string): Promise<void> {
    await decorations.delete({ noteId });
}

/**
 * Clear all decorations
 */
export async function clearAllDecorations(): Promise<void> {
    await decorations.clear();
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
        await syncOutbox.insert({
            id: `${table}:${pk}:${Date.now()}`,
            table,
            pk,
            op,
            data: JSON.stringify(data),
            clientTs: Date.now(),
        });
    } catch (err) {
        console.warn('[NebulaDB] Failed to queue sync:', err);
    }
}
