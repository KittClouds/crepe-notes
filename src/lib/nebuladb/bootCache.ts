/**
 * NebulaDB Boot Cache
 * 
 * Stores lightweight note/folder metadata in localStorage for instant UI rendering.
 * This is read synchronously during Fast Boot (Phase 0.5) so UI can paint immediately.
 * 
 * Flow:
 * 1. FastBoot reads this → QueryClient → UI renders
 * 2. NebulaDB connects to OPFS → replaces QueryClient data
 * 3. CozoDB initializes → sync to NebulaDB (background)
 * 4. On flush, OPFSAdapter updates this cache for next boot
 */

const CACHE_KEY = 'nebula-boot-cache';
const CACHE_VERSION = 1;

// Lightweight note summary (no content, for sidebar)
export interface NoteSummary {
    id: string;
    title: string;
    folderId: string | null;
    updatedAt: number;
    isEntity?: number;
    entityKind?: string;
    entityLabel?: string;
    favorite?: number;
    isPinned?: number;
}

// Lightweight folder summary
export interface FolderSummary {
    id: string;
    name: string;
    parentId: string | null;
    color?: string;
    entityKind?: string;
    isTypedRoot?: boolean;
    narrativeId?: string;
}

// Full note with content (for last open note)
export interface NoteWithContent extends NoteSummary {
    content: string;          // JSON doc
    markdownContent: string;  // Markdown
}

export interface NebulaBootCache {
    version: number;
    notes: NoteSummary[];
    folders: FolderSummary[];
    lastOpenNoteId?: string;
    lastOpenNote?: NoteWithContent;
    decorationCounts: Record<string, number>;  // noteId → count
    lastUpdatedAt: number;
}

/**
 * Load NebulaDB boot cache from localStorage (sync)
 */
export function loadNebulaBootCache(): NebulaBootCache | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as NebulaBootCache;
        if (parsed.version !== CACHE_VERSION) {
            console.warn('[NebulaBootCache] Version mismatch, clearing cache');
            localStorage.removeItem(CACHE_KEY);
            return null;
        }

        console.log(`[NebulaBootCache] Loaded ${parsed.notes.length} notes, ${parsed.folders.length} folders from cache`);
        return parsed;
    } catch (e) {
        console.warn('[NebulaBootCache] Failed to load:', e);
        return null;
    }
}

/**
 * Save NebulaDB boot cache to localStorage
 */
export function saveNebulaBootCache(cache: NebulaBootCache): void {
    try {
        cache.version = CACHE_VERSION;
        cache.lastUpdatedAt = Date.now();
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        console.log(`[NebulaBootCache] Saved ${cache.notes.length} notes, ${cache.folders.length} folders to cache`);
    } catch (e) {
        console.warn('[NebulaBootCache] Failed to save:', e);
    }
}

/**
 * Build boot cache from NebulaDB collections data
 */
export function buildNebulaBootCache(
    notes: any[],
    folders: any[],
    decorations: any[],
    lastOpenNoteId?: string
): NebulaBootCache {
    // Extract summaries (strip content from notes list)
    const noteSummaries: NoteSummary[] = notes.map(n => ({
        id: n.id,
        title: n.title || 'Untitled',
        folderId: n.folderId,
        updatedAt: n.updatedAt || Date.now(),
        isEntity: n.isEntity,
        entityKind: n.entityKind,
        entityLabel: n.entityLabel,
        favorite: n.favorite,
        isPinned: n.isPinned,
    }));

    const folderSummaries: FolderSummary[] = folders.map(f => ({
        id: f.id,
        name: f.name || 'Untitled Folder',
        parentId: f.parentId,
        color: f.color,
        entityKind: f.entityKind,
        isTypedRoot: f.isTypedRoot,
        narrativeId: f.narrativeId,
    }));

    // Count decorations per note
    const decorationCounts: Record<string, number> = {};
    for (const d of decorations) {
        const noteId = d.noteId;
        if (noteId) {
            decorationCounts[noteId] = (decorationCounts[noteId] || 0) + 1;
        }
    }

    // Find last open note (with content)
    let lastOpenNote: NoteWithContent | undefined;
    if (lastOpenNoteId) {
        const note = notes.find(n => n.id === lastOpenNoteId);
        if (note) {
            lastOpenNote = {
                id: note.id,
                title: note.title || 'Untitled',
                folderId: note.folderId,
                updatedAt: note.updatedAt || Date.now(),
                isEntity: note.isEntity,
                entityKind: note.entityKind,
                entityLabel: note.entityLabel,
                favorite: note.favorite,
                isPinned: note.isPinned,
                content: note.content || note.docJson || '{}',
                markdownContent: note.markdownContent || '',
            };
        }
    }

    return {
        version: CACHE_VERSION,
        notes: noteSummaries,
        folders: folderSummaries,
        lastOpenNoteId,
        lastOpenNote,
        decorationCounts,
        lastUpdatedAt: Date.now(),
    };
}

/**
 * Clear the boot cache
 */
export function clearNebulaBootCache(): void {
    localStorage.removeItem(CACHE_KEY);
}
