import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { NEREntity, NERModelStatus } from '@/lib/extraction';
import { smartGraphRegistry } from '@/lib/registry';

// =============================================================================
// Types (Simplified for web-only version)
// =============================================================================

export interface NerSuggestion {
    id: string;
    label: string;
    kind: string;
    confidence: number;
    source_note_id: string;
    span_start: number;
    span_end: number;
}

export interface NerSettings {
    enabled: boolean;
    auto_promote_threshold: number;
    suggest_threshold: number;
}

interface NERContextValue {
    // Legacy state (frontend NER entities)
    entities: NEREntity[];
    modelStatus: NERModelStatus;
    isAnalyzing: boolean;
    error: string | null;

    // Suggestions (stub for web)
    suggestions: NerSuggestion[];
    isFetchingSuggestions: boolean;
    rustModelStatus: null;
    settings: NerSettings;

    // FST NER State
    fstNerEnabled: boolean;
    setFstNerEnabled: (enabled: boolean) => void;

    // Current note context
    currentNoteId: string | null;

    // Legacy actions
    setEntities: (entities: NEREntity[] | ((prev: NEREntity[]) => NEREntity[])) => void;
    clearEntities: () => void;
    setModelStatus: (status: NERModelStatus) => void;
    setIsAnalyzing: (analyzing: boolean) => void;
    setError: (error: string | null) => void;

    // Actions (stubs for web)
    setCurrentNoteId: (noteId: string | null) => void;
    refreshSuggestions: (noteId?: string) => Promise<void>;
    acceptSuggestion: (suggestionId: string) => Promise<boolean>;
    rejectSuggestion: (suggestionId: string) => Promise<boolean>;
    refreshModelStatus: () => Promise<void>;
}

const NERContext = createContext<NERContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

interface NERProviderProps {
    children: ReactNode;
}

export function NERProvider({ children }: NERProviderProps) {
    // Legacy state
    const [entities, setEntities] = useState<NEREntity[]>([]);
    const [modelStatus, setModelStatus] = useState<NERModelStatus>('idle');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Web version - no Tauri NER
    const [suggestions] = useState<NerSuggestion[]>([]);
    const [settings] = useState<NerSettings>({
        enabled: false,
        auto_promote_threshold: 0.90,
        suggest_threshold: 0.60,
    });
    const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
    const [fstNerEnabled, setFstNerEnabled] = useState(false);

    // Clear legacy entities
    const clearEntities = useCallback(() => {
        setEntities([]);
    }, []);

    // Stub implementations for web
    const refreshSuggestions = useCallback(async (_noteId?: string) => {
        // No-op in web version
    }, []);

    const acceptSuggestion = useCallback(async (_suggestionId: string): Promise<boolean> => {
        // No-op in web version
        return false;
    }, []);

    const rejectSuggestion = useCallback(async (_suggestionId: string): Promise<boolean> => {
        // No-op in web version
        return false;
    }, []);

    const refreshModelStatus = useCallback(async () => {
        // No-op in web version
    }, []);

    const value: NERContextValue = {
        // Legacy
        entities,
        modelStatus,
        isAnalyzing,
        error,

        // Stubs for web
        suggestions,
        isFetchingSuggestions: false,
        rustModelStatus: null,
        settings,
        currentNoteId,
        fstNerEnabled,
        setFstNerEnabled,

        // Legacy actions
        setEntities,
        clearEntities,
        setModelStatus,
        setIsAnalyzing,
        setError,

        // Stub actions
        setCurrentNoteId,
        refreshSuggestions,
        acceptSuggestion,
        rejectSuggestion,
        refreshModelStatus,
    };

    return (
        <NERContext.Provider value={value}>
            {children}
        </NERContext.Provider>
    );
}

// =============================================================================
// Hooks
// =============================================================================

export function useNER(): NERContextValue {
    const context = useContext(NERContext);
    if (!context) {
        throw new Error('useNER must be used within a NERProvider');
    }
    return context;
}

// Optional hook for components that don't need full context
export function useNEREntities(): NEREntity[] {
    const context = useContext(NERContext);
    return context?.entities ?? [];
}

// Hook for NER suggestions
export function useNERSuggestions(): NerSuggestion[] {
    const context = useContext(NERContext);
    return context?.suggestions ?? [];
}

// Hook for suggestion actions
export function useNERSuggestionActions() {
    const context = useContext(NERContext);
    return {
        accept: context?.acceptSuggestion ?? (async () => false),
        reject: context?.rejectSuggestion ?? (async () => false),
        refresh: context?.refreshSuggestions ?? (async () => { }),
    };
}

// Hook for model status
export function useNERModelStatus() {
    const context = useContext(NERContext);
    return {
        rustStatus: context?.rustModelStatus ?? null,
        legacyStatus: context?.modelStatus ?? 'idle',
        isModelAvailable: false,
    };
}
