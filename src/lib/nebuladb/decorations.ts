// src/lib/nebuladb/decorations.ts
// Decoration utilities for local-first NebulaDB storage
// Decorations are stored per span. Workers write → useLiveQuery auto-updates UI.

import { decorations, decorationMeta } from './db';
import type { Document } from './types';

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
    contentHash?: string
): Promise<void> {
    const now = Date.now();

    // Clear existing decorations for this note
    await decorations.delete({ noteId });

    // Insert new decorations
    if (spans.length > 0) {
        await decorations.insertBatch(
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
 * Get the content hash for a note's cached decorations
 */
export async function getDecorationContentHash(noteId: string): Promise<string | null> {
    const meta = await decorationMeta.findOne({ noteId });
    return (meta as any)?.contentHash ?? null;
}

/**
 * Get decorations for a note (sync, for non-React code)
 */
export async function getNoteDecorations(noteId: string): Promise<DecorationSpan[]> {
    const records = await decorations.find({ noteId });
    return records.map(r => JSON.parse((r as any).payload) as DecorationSpan);
}

/**
 * Clear all decorations for a note
 */
export async function clearNoteDecorations(noteId: string): Promise<void> {
    await decorations.delete({ noteId });
}

/**
 * Clear all decorations (e.g., on major entity changes)
 */
export async function clearAllDecorations(): Promise<void> {
    await decorations.clear();
}
