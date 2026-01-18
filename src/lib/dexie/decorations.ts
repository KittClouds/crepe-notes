/**
 * Decoration utilities for local-first Dexie storage
 * 
 * Decorations are now stored per span (not per note hash).
 * Workers write decorations → useLiveQuery auto-updates UI.
 */

import { dexieDb, type DexieDecoration } from './db';
import type { DecorationSpan } from '@/lib/Scanner/types';

/**
 * djb2 hash - fast, good distribution for strings
 */
export function hashContent(content: string): string {
    let hash = 5381;
    for (let i = 0; i < content.length; i++) {
        hash = ((hash << 5) + hash) ^ content.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
}

/**
 * Save decoration spans for a note (replaces old spans)
 * Called by workers after scan completes
 */
export async function saveNoteDecorations(
    noteId: string,
    spans: DecorationSpan[],
    contentHash?: string  // Hash of content when scanned
): Promise<void> {
    const now = Date.now();

    // Transaction: clear old + insert new
    await dexieDb.transaction('rw', [dexieDb.decorations, dexieDb.decorationMeta], async () => {
        // Clear existing decorations for this note
        await dexieDb.decorations.where('noteId').equals(noteId).delete();

        // Insert new decorations
        if (spans.length > 0) {
            await dexieDb.decorations.bulkAdd(
                spans.map(span => ({
                    id: `${noteId}:${span.from}:${span.to}`,
                    noteId,
                    type: span.type,
                    start: span.from,
                    end: span.to,
                    payload: JSON.stringify(span),
                    updatedAt: now,
                    rev: 0,
                }))
            );
        }

        // Save content hash for position validation
        if (contentHash) {
            await dexieDb.decorationMeta.put({
                noteId,
                contentHash,
                updatedAt: now,
            });
        }
    });

    console.log(`[Decorations] Saved ${spans.length} decorations for note ${noteId}`);
}

/**
 * Get the content hash for a note's cached decorations
 */
export async function getDecorationContentHash(noteId: string): Promise<string | null> {
    const meta = await dexieDb.decorationMeta.get(noteId);
    return meta?.contentHash ?? null;
}

/**
 * Get decorations for a note (sync, for non-React code)
 */
export async function getNoteDecorations(noteId: string): Promise<DecorationSpan[]> {
    const records = await dexieDb.decorations
        .where('noteId')
        .equals(noteId)
        .toArray();

    return records.map(r => JSON.parse(r.payload) as DecorationSpan);
}

/**
 * Clear all decorations for a note
 */
export async function clearNoteDecorations(noteId: string): Promise<void> {
    await dexieDb.decorations.where('noteId').equals(noteId).delete();
}

/**
 * Clear all decorations (e.g., on major entity changes)
 */
export async function clearAllDecorations(): Promise<void> {
    await dexieDb.decorations.clear();
}

// ============================================================================
// LEGACY CACHE API (for backward compatibility during migration)
// ============================================================================

/**
 * @deprecated Use getNoteDecorations + useDexieDecorations hook instead
 */
export async function getCachedDecorations(
    noteId: string,
    _content: string,
    _entityVersion: number
): Promise<DecorationSpan[] | null> {
    // New behavior: just return what we have for this note
    const spans = await getNoteDecorations(noteId);
    return spans.length > 0 ? spans : null;
}

/**
 * @deprecated Use saveNoteDecorations instead
 */
export async function setCachedDecorations(
    noteId: string,
    _content: string,
    _entityVersion: number,
    spans: DecorationSpan[]
): Promise<void> {
    await saveNoteDecorations(noteId, spans);
}

/**
 * @deprecated No longer needed with new architecture
 */
export async function evictStaleDecorations(_noteId: string, _currentHash?: string): Promise<void> {
    // No-op in new architecture
}
