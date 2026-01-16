/**
 * NarrativeChronologyRegistry
 * 
 * Tracks narrative structure with auto-numbering for Arc/Act/Chapter.
 * ONLY applies to folders under a Narrative Timeline root.
 * 
 * Features:
 * - Auto-incrementing ordinals for Arc, Act, Chapter
 * - Scenes and Beats tracked but NOT numbered
 * - API for querying all elements by type
 * - Ancestry path tracking for nested queries
 */

// =============================================================================
// Types
// =============================================================================

export type NarrativeElementType = 'ARC' | 'ACT' | 'CHAPTER' | 'SCENE' | 'BEAT' | 'EVENT';

export interface NarrativeTimelineRoot {
    id: string;
    name: string;
    arcCount: number;
    actCount: number;
    chapterCount: number;
    narrativeOrder: string[];  // Ordered list of IDs (scenes/beats/chapters)
    createdAt: Date;
}

export interface NarrativeElement {
    id: string;
    type: NarrativeElementType;
    ordinal?: number;          // Only for Arc/Act/Chapter
    label: string;
    parentId: string;
    narrativeRootId: string;
    path: string[];            // Full ancestry path including self
    createdAt: Date;
}

// Types that get ordinals
const ORDINAL_TYPES: NarrativeElementType[] = ['ARC', 'ACT', 'CHAPTER'];

// =============================================================================
// Storage Keys
// =============================================================================

const STORAGE_KEY_ROOTS = 'narrative_timeline_roots';
const STORAGE_KEY_ELEMENTS = 'narrative_elements';

// =============================================================================
// NarrativeChronologyRegistry
// =============================================================================

export class NarrativeChronologyRegistry {
    private roots: Map<string, NarrativeTimelineRoot> = new Map();
    private elements: Map<string, NarrativeElement> = new Map();

    // Ordinal counters: parentId -> type -> count
    private ordinalCounters: Map<string, Map<NarrativeElementType, number>> = new Map();

    constructor() {
        this.loadFromStorage();
    }

    // =========================================================================
    // Persistence
    // =========================================================================

    loadFromStorage(): void {
        if (typeof localStorage === 'undefined') return;

        try {
            const rootsJson = localStorage.getItem(STORAGE_KEY_ROOTS);
            if (rootsJson) {
                const rootsArray = JSON.parse(rootsJson) as NarrativeTimelineRoot[];
                for (const root of rootsArray) {
                    this.roots.set(root.id, {
                        ...root,
                        createdAt: new Date(root.createdAt),
                    });
                }
            }

            const elementsJson = localStorage.getItem(STORAGE_KEY_ELEMENTS);
            if (elementsJson) {
                const elementsArray = JSON.parse(elementsJson) as NarrativeElement[];
                for (const el of elementsArray) {
                    this.elements.set(el.id, {
                        ...el,
                        createdAt: new Date(el.createdAt),
                    });

                    // Rebuild ordinal counters
                    if (el.ordinal !== undefined && ORDINAL_TYPES.includes(el.type)) {
                        this.updateOrdinalCounter(el.parentId, el.type, el.ordinal);
                    }
                }
            }
        } catch (err) {
            console.error('[NarrativeChronologyRegistry] Failed to load from storage:', err);
        }
    }

    private saveToStorage(): void {
        if (typeof localStorage === 'undefined') return;

        try {
            localStorage.setItem(STORAGE_KEY_ROOTS, JSON.stringify(Array.from(this.roots.values())));
            localStorage.setItem(STORAGE_KEY_ELEMENTS, JSON.stringify(Array.from(this.elements.values())));
        } catch (err) {
            console.error('[NarrativeChronologyRegistry] Failed to save to storage:', err);
        }
    }

    private updateOrdinalCounter(parentId: string, type: NarrativeElementType, ordinal: number): void {
        if (!this.ordinalCounters.has(parentId)) {
            this.ordinalCounters.set(parentId, new Map());
        }
        const parentCounters = this.ordinalCounters.get(parentId)!;
        const current = parentCounters.get(type) || 0;
        if (ordinal > current) {
            parentCounters.set(type, ordinal);
        }
    }

    // =========================================================================
    // Root Registration
    // =========================================================================

    registerNarrativeRoot(folderId: string, name: string): NarrativeTimelineRoot {
        const root: NarrativeTimelineRoot = {
            id: folderId,
            name,
            arcCount: 0,
            actCount: 0,
            chapterCount: 0,
            narrativeOrder: [],
            createdAt: new Date(),
        };

        this.roots.set(folderId, root);
        this.saveToStorage();

        console.log(`[NarrativeRegistry] Registered root: ${name} (${folderId})`);
        return root;
    }

    getNarrativeRoot(folderId: string): NarrativeTimelineRoot | null {
        // Direct root
        if (this.roots.has(folderId)) {
            return this.roots.get(folderId)!;
        }

        // Check if element belongs to a root
        const element = this.elements.get(folderId);
        if (element) {
            return this.roots.get(element.narrativeRootId) || null;
        }

        return null;
    }

    getTimelineRoots(): NarrativeTimelineRoot[] {
        return Array.from(this.roots.values());
    }

    // =========================================================================
    // Element Registration
    // =========================================================================

    registerElement(
        folderId: string,
        type: NarrativeElementType,
        parentId: string,
        label: string
    ): NarrativeElement {
        // Resolve narrative root
        const narrativeRootId = this.resolveNarrativeRoot(parentId);
        if (!narrativeRootId) {
            throw new Error(`Parent ${parentId} is not under a Narrative Timeline`);
        }

        // Build ancestry path
        const path = this.buildPath(parentId);
        path.push(folderId);

        // Determine ordinal (only for Arc/Act/Chapter)
        let ordinal: number | undefined;
        if (ORDINAL_TYPES.includes(type)) {
            ordinal = this.getNextOrdinal(parentId, type);
            this.updateOrdinalCounter(parentId, type, ordinal);

            // Update root counters
            const root = this.roots.get(narrativeRootId);
            if (root) {
                if (type === 'ARC') root.arcCount++;
                if (type === 'ACT') root.actCount++;
                if (type === 'CHAPTER') root.chapterCount++;
            }
        }

        const element: NarrativeElement = {
            id: folderId,
            type,
            ordinal,
            label,
            parentId,
            narrativeRootId,
            path,
            createdAt: new Date(),
        };

        this.elements.set(folderId, element);
        this.saveToStorage();

        console.log(`[NarrativeRegistry] Registered ${type}${ordinal ? ` ${ordinal}` : ''}: ${label}`);
        return element;
    }

    private resolveNarrativeRoot(folderId: string): string | null {
        // Direct root
        if (this.roots.has(folderId)) {
            return folderId;
        }

        // Check if element exists and has a root
        const element = this.elements.get(folderId);
        if (element) {
            return element.narrativeRootId;
        }

        return null;
    }

    private buildPath(parentId: string): string[] {
        // Root case
        if (this.roots.has(parentId)) {
            return [parentId];
        }

        // Element case - copy parent's path
        const parentElement = this.elements.get(parentId);
        if (parentElement) {
            return [...parentElement.path];
        }

        return [];
    }

    // =========================================================================
    // Ordinal Queries
    // =========================================================================

    getNextOrdinal(parentId: string, type: NarrativeElementType): number {
        const parentCounters = this.ordinalCounters.get(parentId);
        if (!parentCounters) {
            return 1;
        }
        return (parentCounters.get(type) || 0) + 1;
    }

    // =========================================================================
    // Scope Detection
    // =========================================================================

    isUnderNarrativeTimeline(folderId: string): boolean {
        if (this.roots.has(folderId)) return true;
        if (this.elements.has(folderId)) return true;
        return false;
    }

    // =========================================================================
    // Element Queries
    // =========================================================================

    getElementById(id: string): NarrativeElement | null {
        return this.elements.get(id) || null;
    }

    getAllScenes(narrativeRootId: string): NarrativeElement[] {
        return this.getElementsByTypeAndRoot('SCENE', narrativeRootId);
    }

    getAllBeats(narrativeRootId: string): NarrativeElement[] {
        return this.getElementsByTypeAndRoot('BEAT', narrativeRootId);
    }

    getArcs(narrativeRootId: string): NarrativeElement[] {
        return this.getElementsByTypeAndRoot('ARC', narrativeRootId);
    }

    getActs(narrativeRootId: string): NarrativeElement[] {
        return this.getElementsByTypeAndRoot('ACT', narrativeRootId);
    }

    getChapters(narrativeRootId: string): NarrativeElement[] {
        return this.getElementsByTypeAndRoot('CHAPTER', narrativeRootId);
    }

    private getElementsByTypeAndRoot(type: NarrativeElementType, rootId: string): NarrativeElement[] {
        return Array.from(this.elements.values()).filter(
            el => el.type === type && el.narrativeRootId === rootId
        );
    }

    getScenesInChapter(chapterId: string): NarrativeElement[] {
        return Array.from(this.elements.values()).filter(
            el => el.type === 'SCENE' && el.parentId === chapterId
        );
    }

    getBeatsInScene(sceneId: string): NarrativeElement[] {
        return Array.from(this.elements.values()).filter(
            el => el.type === 'BEAT' && el.parentId === sceneId
        );
    }

    // =========================================================================
    // Narrative Order
    // =========================================================================

    setNarrativeOrder(rootId: string, orderedIds: string[]): void {
        const root = this.roots.get(rootId);
        if (root) {
            root.narrativeOrder = orderedIds;
            this.saveToStorage();
        }
    }

    getNarrativeOrder(rootId: string): string[] {
        const root = this.roots.get(rootId);
        return root?.narrativeOrder || [];
    }

    // =========================================================================
    // Title Formatting
    // =========================================================================

    formatNarrativeTitle(
        type: NarrativeElementType,
        ordinal: number | null,
        label: string
    ): string {
        if (ordinal !== null && ORDINAL_TYPES.includes(type)) {
            const capitalizedType = type.charAt(0) + type.slice(1).toLowerCase();
            return `${capitalizedType} ${ordinal}: ${label}`;
        }
        return `[${type}] ${label}`;
    }

    // =========================================================================
    // Deletion
    // =========================================================================

    unregisterElement(folderId: string): boolean {
        const deleted = this.elements.delete(folderId);
        if (deleted) {
            this.saveToStorage();
        }
        return deleted;
    }

    unregisterRoot(folderId: string): boolean {
        // Remove all elements under this root
        for (const [id, element] of this.elements) {
            if (element.narrativeRootId === folderId) {
                this.elements.delete(id);
            }
        }

        const deleted = this.roots.delete(folderId);
        if (deleted) {
            this.saveToStorage();
        }
        return deleted;
    }

    clearAll(): void {
        this.roots.clear();
        this.elements.clear();
        this.ordinalCounters.clear();
        localStorage.removeItem(STORAGE_KEY_ROOTS);
        localStorage.removeItem(STORAGE_KEY_ELEMENTS);
    }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const narrativeRegistry = new NarrativeChronologyRegistry();
