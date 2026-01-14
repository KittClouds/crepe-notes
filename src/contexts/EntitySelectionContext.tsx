// src/contexts/EntitySelectionContext.tsx
// Entity Selection Context - tracks selected entity in right sidebar
// Expanded to support full fact-sheet functionality

import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import type { EntityKind } from '@/lib/types/entityTypes';

// ParsedEntity type for fact sheets (matches legacy)
export interface ParsedEntity {
    kind: EntityKind;
    label: string;
    noteId?: string;
    attributes?: Record<string, unknown>;
}

// Legacy compatibility alias
export interface SelectedEntity {
    id: string;
    label: string;
    kind: string;
}

interface EntitySelectionContextType {
    // Selected entity for fact sheet editing
    selectedEntity: ParsedEntity | null;
    setSelectedEntity: (entity: ParsedEntity | null) => void;

    // Entities available in the current note
    entitiesInCurrentNote: ParsedEntity[];
    setEntitiesInCurrentNote: (entities: ParsedEntity[]) => void;

    // Clear selection
    clearSelection: () => void;

    // Global focus state (stubs for now)
    isGlobalFocusActive: boolean;
    globalFocusEntityId: string | null;
    globalFocusEntityLabel: string | null;
    setGlobalEntityFocus: (entity: ParsedEntity) => void;
    clearGlobalFocus: () => void;
}

const EntitySelectionContext = createContext<EntitySelectionContextType | undefined>(undefined);

export function EntitySelectionProvider({ children }: { children: ReactNode }) {
    const [selectedEntity, setSelectedEntityState] = useState<ParsedEntity | null>(null);
    const [entitiesInCurrentNote, setEntitiesInCurrentNote] = useState<ParsedEntity[]>([]);
    const [globalFocus, setGlobalFocus] = useState<{ entityId: string | null; entityLabel: string | null }>({
        entityId: null,
        entityLabel: null,
    });

    const setSelectedEntity = useCallback((entity: ParsedEntity | null) => {
        setSelectedEntityState(entity);
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedEntityState(null);
        setEntitiesInCurrentNote([]);
    }, []);

    const setGlobalEntityFocus = useCallback((entity: ParsedEntity) => {
        setGlobalFocus({
            entityId: entity.noteId || `${entity.kind}|${entity.label}`,
            entityLabel: entity.label,
        });
    }, []);

    const clearGlobalFocus = useCallback(() => {
        setGlobalFocus({ entityId: null, entityLabel: null });
    }, []);

    const value = useMemo(() => ({
        selectedEntity,
        setSelectedEntity,
        entitiesInCurrentNote,
        setEntitiesInCurrentNote,
        clearSelection,
        isGlobalFocusActive: globalFocus.entityId !== null,
        globalFocusEntityId: globalFocus.entityId,
        globalFocusEntityLabel: globalFocus.entityLabel,
        setGlobalEntityFocus,
        clearGlobalFocus,
    }), [
        selectedEntity,
        setSelectedEntity,
        entitiesInCurrentNote,
        clearSelection,
        globalFocus.entityId,
        globalFocus.entityLabel,
        setGlobalEntityFocus,
        clearGlobalFocus,
    ]);

    return (
        <EntitySelectionContext.Provider value={value}>
            {children}
        </EntitySelectionContext.Provider>
    );
}

export function useEntitySelection() {
    const context = useContext(EntitySelectionContext);
    if (!context) {
        // Return stub values if not in provider
        return {
            selectedEntity: null,
            setSelectedEntity: () => { },
            entitiesInCurrentNote: [],
            setEntitiesInCurrentNote: () => { },
            clearSelection: () => { },
            isGlobalFocusActive: false,
            globalFocusEntityId: null,
            globalFocusEntityLabel: null,
            setGlobalEntityFocus: () => { },
            clearGlobalFocus: () => { },
        };
    }
    return context;
}

// Safe version that returns null instead of stub values
export function useEntitySelectionSafe() {
    return useContext(EntitySelectionContext) ?? null;
}
