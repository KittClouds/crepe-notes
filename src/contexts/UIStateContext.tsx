// src/contexts/UIStateContext.tsx
// Lightweight UI state - only ephemeral client state that doesn't persist

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { setCurrentNoteId as persistCurrentNoteId, getCurrentNoteId } from '@/lib/storage';
import { markNoteSwitchStart } from '@/lib/utils/notePerf';

interface UIState {
    selectedNoteId: string | null;
    openNoteIds: string[];
    searchQuery: string;
}

interface UIStateContextValue {
    state: UIState;
    selectNote: (id: string) => void;
    closeNote: (id: string) => void;
    setSearchQuery: (query: string) => void;
    initializeWithNotes: (noteIds: string[]) => void;
}

const UIStateContext = createContext<UIStateContextValue | null>(null);

export function UIStateProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<UIState>(() => {
        // Load from localStorage immediately to avoid blank state on first render
        const lastNoteId = getCurrentNoteId();
        return {
            selectedNoteId: lastNoteId,
            openNoteIds: lastNoteId ? [lastNoteId] : [],
            searchQuery: '',
        };
    });

    const selectNote = useCallback((id: string) => {
        markNoteSwitchStart(id);
        setState(prev => {
            const isOpen = prev.openNoteIds.includes(id);
            persistCurrentNoteId(id);
            return {
                ...prev,
                selectedNoteId: id,
                openNoteIds: isOpen ? prev.openNoteIds : [...prev.openNoteIds, id],
            };
        });
    }, []);

    const closeNote = useCallback((id: string) => {
        setState(prev => {
            const newOpenIds = prev.openNoteIds.filter(i => i !== id);
            const newSelectedId = prev.selectedNoteId === id
                ? newOpenIds[newOpenIds.length - 1] || null
                : prev.selectedNoteId;

            if (newSelectedId) {
                persistCurrentNoteId(newSelectedId);
            }

            return {
                ...prev,
                openNoteIds: newOpenIds,
                selectedNoteId: newSelectedId,
            };
        });
    }, []);

    const setSearchQuery = useCallback((query: string) => {
        setState(prev => ({ ...prev, searchQuery: query }));
    }, []);

    const initializeWithNotes = useCallback((noteIds: string[]) => {
        setState(prev => {
            // Validate: ensure current selectedNoteId exists in actual notes
            const currentIsValid = prev.selectedNoteId && noteIds.includes(prev.selectedNoteId);

            if (currentIsValid) {
                // Already valid, keep current state
                return prev;
            }

            // Current selection is invalid or null - find a valid one
            const lastNoteId = getCurrentNoteId();
            const validCachedId = lastNoteId && noteIds.includes(lastNoteId)
                ? lastNoteId
                : null;
            const firstId = validCachedId || noteIds[0] || null;

            if (firstId) persistCurrentNoteId(firstId);
            return {
                ...prev,
                selectedNoteId: firstId,
                openNoteIds: firstId ? [firstId] : [],
            };
        });
    }, []);

    return (
        <UIStateContext.Provider value={{ state, selectNote, closeNote, setSearchQuery, initializeWithNotes }}>
            {children}
        </UIStateContext.Provider>
    );
}

export function useUIState() {
    const context = useContext(UIStateContext);
    if (!context) {
        throw new Error('useUIState must be used within a UIStateProvider');
    }
    return context;
}
