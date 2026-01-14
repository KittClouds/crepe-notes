// src/contexts/TemporalHighlightContext.tsx
// Temporal Highlight Context - STUB (Timeline removed)
//
// This was used for Timeline integration which is no longer included.
// Keeping as stub to avoid breaking imports.

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface TemporalHighlightContextType {
    highlightedEventId: string | null;
    setHighlightedEventId: (id: string | null) => void;
    onActivateTimeline: (() => void) | null;
    setOnActivateTimeline: (callback: (() => void) | null) => void;
}

const TemporalHighlightContext = createContext<TemporalHighlightContextType | undefined>(undefined);

export function TemporalHighlightProvider({ children }: { children: ReactNode }) {
    const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);
    const [onActivateTimeline, setOnActivateTimeline] = useState<(() => void) | null>(null);

    return (
        <TemporalHighlightContext.Provider
            value={{
                highlightedEventId,
                setHighlightedEventId,
                onActivateTimeline,
                setOnActivateTimeline
            }}
        >
            {children}
        </TemporalHighlightContext.Provider>
    );
}

export function useTemporalHighlight() {
    const context = useContext(TemporalHighlightContext);
    if (!context) {
        // Return stub values if not in provider
        return {
            highlightedEventId: null,
            setHighlightedEventId: () => { },
            onActivateTimeline: null,
            setOnActivateTimeline: () => { }
        };
    }
    return context;
}
