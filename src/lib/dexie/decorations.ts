// src/lib/dexie/decorations.ts
// Decoration utilities for Dexie (IndexedDB) storage
// Replaces nebuladb/decorations.ts

import { db } from './db';
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

// In-memory decoration cache (Dexie doesn't have a decoration spans table yet)
// For now, we use a simple Map. This can be moved to Dexie if persistence is needed.
const decorationCache = new Map<string, { spans: DecorationSpan[], contentHash: string, updatedAt: number }>();

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

    decorationCache.set(noteId, {
        spans,
        contentHash: contentHash ?? '',
        updatedAt: now,
    });

    // Update Dexie metadata for persistence
    await db.decorationMeta.put({
        noteId,
        version: 1,
        lastScan: now,
    });

    console.log(`[Dexie] Saved ${spans.length} decorations for note ${noteId}`);
}

/**
 * Get the content hash for a note's cached decorations
 */
export async function getDecorationContentHash(noteId: string): Promise<string | null> {
    const cached = decorationCache.get(noteId);
    return cached?.contentHash ?? null;
}

/**
 * Get decorations for a note
 */
export async function getNoteDecorations(noteId: string): Promise<DecorationSpan[]> {
    const cached = decorationCache.get(noteId);
    return cached?.spans ?? [];
}

/**
 * Clear all decorations for a note
 */
export async function clearNoteDecorations(noteId: string): Promise<void> {
    decorationCache.delete(noteId);
    await db.decorationMeta.delete(noteId);
}

/**
 * Clear all decorations (e.g., on major entity changes)
 */
export async function clearAllDecorations(): Promise<void> {
    decorationCache.clear();
    await db.decorationMeta.clear();
}
