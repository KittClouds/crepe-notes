import type { Note, Folder } from '@/types/noteTypes';

export const BOOT_CACHE_KEY = 'inkwell_boot_cache_v1';

export interface BootCacheSchema {
    version: 1;
    notes: Partial<Note>[]; // Minimal note logic (no content)
    folders: Folder[];
    lastOpenNoteId?: string;
    lastOpenNote?: Note; // Full content for the last open note
}

/**
 * Loads the synchronous boot cache from localStorage.
 * This should be called as early as possible (before React mount).
 */
export function loadBootCache(): BootCacheSchema | null {
    try {
        const raw = localStorage.getItem(BOOT_CACHE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (data.version !== 1) return null;
        return data as BootCacheSchema;
    } catch (e) {
        console.warn('[BootCache] Failed to parse cache', e);
        return null;
    }
}

/**
 * Saves the current state to the boot cache.
 * Note: content is stripped from the notes list to save space.
 */
export function saveBootCache(data: BootCacheSchema) {
    try {
        // Double safety: Ensure we don't accidentally save full content in the list
        const safeNotes = data.notes.map(n => {
            const { content, markdownContent, ...rest } = n;
            return rest;
        });

        const payload: BootCacheSchema = {
            ...data,
            notes: safeNotes,
        };

        localStorage.setItem(BOOT_CACHE_KEY, JSON.stringify(payload));
    } catch (e) {
        // QuotaExceededError is possible if we have too many notes even without content
        console.warn('[BootCache] Failed to save cache', e);
    }
}

/**
 * Helper to build the cache from raw maps (used by OpfsAdapter)
 */
export function buildBootCacheFromMaps(
    notesMap: Map<string, any>,
    foldersMap: Map<string, any>,
    currentNoteId?: string
): BootCacheSchema {
    const notes = Array.from(notesMap.values());
    const folders = Array.from(foldersMap.values());

    let lastOpenNote: Note | undefined;
    if (currentNoteId) {
        lastOpenNote = notesMap.get(currentNoteId);
    }

    return {
        version: 1,
        notes: notes.map(n => {
            // Create a shallow copy without content for the list
            const { content, markdownContent, ...rest } = n;
            return rest;
        }),
        folders: folders,
        lastOpenNoteId: currentNoteId,
        lastOpenNote: lastOpenNote ? { ...lastOpenNote } : undefined, // Clone to be safe
    };
}
