import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNotesStore } from '@/hooks/useNotesStore';
import { narrativeRegistry } from '@/lib/narrative';

export type DashboardScope =
    | { type: 'ENTITY'; id: string; label: string; kind: string }
    | { type: 'CONTAINER'; id: string; label: string; kind: 'ARC' | 'ACT' | 'CHAPTER' }
    | null;

export interface SceneCardData {
    id: string;
    title: string;
    synopsis: string;
    participants: { id: string; label: string; kind: string }[];
    timing: string;
}

export function useNarrativeDashboard() {
    const { state } = useNotesStore();

    // -- STATE --
    const [isPinned, setIsPinned] = useState(false);
    const [pinnedScope, setPinnedScope] = useState<DashboardScope>(null);
    const [transientScope, setTransientScope] = useState<DashboardScope>(null);

    // -- EFFECT: Auto-scope logic --
    useEffect(() => {
        if (isPinned) return;

        // 1. Check selected Entity (from global selection or similar)
        // For now, we'll infer from the selected note if it's an entity
        // or from a global event (mocked here for now)

        // 2. Check selected Folder/Note
        const selectedId = state.selectedNoteId;
        if (!selectedId) {
            setTransientScope(null);
            return;
        }

        // Is it a special Entity Note?
        // (Assuming entity registry maps noteIds to entities)
        // This part would need the registry to look up entity by note ID
        // const entity = entityRegistry.findByNoteId(selectedId);
        // if (entity) ...

        // Is it a Narrative Container (Arc/Act/Chapter)?
        const narrativeElement = narrativeRegistry.getElementById(selectedId);
        if (narrativeElement && ['ARC', 'ACT', 'CHAPTER'].includes(narrativeElement.type)) {
            setTransientScope({
                type: 'CONTAINER',
                id: narrativeElement.id,
                label: narrativeElement.label,
                kind: narrativeElement.type as 'ARC' | 'ACT' | 'CHAPTER'
            });
            return;
        }

        // Default: If inside a scene/beat, scope to parent Chapter
        if (narrativeElement && ['SCENE', 'BEAT'].includes(narrativeElement.type)) {
            // Traverse up to find Chapter/Arc
            // For now, just simplistic parent
            const parent = narrativeRegistry.getElementById(narrativeElement.parentId);
            if (parent && ['CHAPTER', 'ARC', 'ACT'].includes(parent.type)) {
                setTransientScope({
                    type: 'CONTAINER',
                    id: parent.id,
                    label: parent.label,
                    kind: parent.type as 'ARC' | 'ACT' | 'CHAPTER'
                });
                return;
            }
        }

        setTransientScope(null);
    }, [isPinned, state.selectedNoteId]);

    const activeScope = isPinned ? pinnedScope : transientScope;

    // -- DATA: Filter Scenes --
    const scenes: SceneCardData[] = useMemo(() => {
        if (!activeScope) return [];

        const allRoots = narrativeRegistry.getTimelineRoots();
        // Just searching first root for MVP - ideally we know which root we in
        if (allRoots.length === 0) return [];
        const rootId = allRoots[0].id; // TODO: Context awareness

        // Get Ordered IDs
        const orderedIds = narrativeRegistry.getNarrativeOrder(rootId);
        const allScenes = narrativeRegistry.getAllScenes(rootId);

        // 1. FILTER
        let filtered = allScenes;

        if (activeScope.type === 'CONTAINER') {
            // Find all descendants of this container
            // This requires ancestry traversal which the registry supports via 'path'
            filtered = allScenes.filter(s => s.path.includes(activeScope.id));
        } else if (activeScope.type === 'ENTITY') {
            // Filter by participants (requires Graph Registry integration)
            // Mocked for now: check if entity ID is in some 'participants' metadata
            // filtered = allScenes.filter(s => s.participants.includes(activeScope.id));
        }

        // 2. SORT (by Narrative Order)
        filtered.sort((a, b) => {
            const idxA = orderedIds.indexOf(a.id);
            const idxB = orderedIds.indexOf(b.id);
            if (idxA === -1 && idxB === -1) return 0;
            if (idxA === -1) return 1;
            if (idxB === -1) return -1;
            return idxA - idxB;
        });

        // 3. ENRICH with Note Content
        return filtered.map(scene => {
            const note = state.notes.find(n => n.folderId === scene.id);
            // If scene is a folder, the note with folderId=scene.id is likely the "Folder Note" 
            // OR checks if search logic matches.
            // Assumption: Scene is a FOLDER. The "Scene Note" is usually inside or is the folder note.
            // In Crepe V2, folders aren't notes, but can have a linked note? 
            // Wait, existing schema says scenes are folders containing a note?
            // Actually usually 'folderId' matches the scene folder ID. 
            // Let's assume the first note in the scene folder is the text.

            // Better: 'Folder Note' pattern usually has a note with same name or specific ID?
            // Let's just grab the first note found in that folder for now as "Synopsis"
            const sceneNote = state.notes.find(n => n.folderId === scene.id) ||
                state.notes.find(n => n.id === scene.id); // Or if it's a note itself equivalent

            return {
                id: scene.id,
                title: scene.label,
                synopsis: sceneNote?.content || '', // Use content as synopsis
                participants: [], // TODO: Graph integration
                timing: '' // TODO: Metadata integration
            };
        });
    }, [activeScope, state.notes]); // Re-run when notes change (for synopsis updates)

    // -- ACTIONS --
    const togglePin = () => {
        if (!isPinned && transientScope) {
            setPinnedScope(transientScope);
            setIsPinned(true);
        } else {
            setIsPinned(false);
            setPinnedScope(null);
        }
    };

    const reorderScenes = useCallback((newOrderIds: string[]) => {
        // We need the rootId. For MVP, assuming first root.
        const allRoots = narrativeRegistry.getTimelineRoots();
        if (allRoots.length > 0) {
            narrativeRegistry.setNarrativeOrder(allRoots[0].id, newOrderIds);
            // Force re-render would require a subscription or React state sync
            // For now, we rely on the parent component triggering update or local state
        }
    }, []);

    return {
        activeScope,
        isPinned,
        togglePin,
        scenes,
        reorderScenes
    };
}
