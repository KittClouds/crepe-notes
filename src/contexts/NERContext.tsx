import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { NEREntity, NERModelStatus } from '@/lib/extraction';
import { smartGraphRegistry } from '@/lib/registry';
import { useDiscoveryStore } from '@/lib/store/discoveryStore';
import { kittCore } from '@/lib/kittcore';

// Map from KittCore u8 Kind to Readable String
const KIND_MAP: Record<number, string> = {
    0: 'CHARACTER',
    1: 'LOCATION',
    2: 'NPC',
    3: 'ITEM',
    4: 'FACTION',
    5: 'ORGANIZATION',
    6: 'EVENT',
    7: 'CONCEPT',
    8: 'CUSTOM',
};

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

    // Web version - Real Discovery Store Integration
    const discoveryState = useDiscoveryStore();
    const [settings] = useState<NerSettings>({
        enabled: true, // Enabled by default for FST
        auto_promote_threshold: 0.90,
        suggest_threshold: 0.60,
    });
    const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
    const [fstNerEnabled, setFstNerEnabled] = useState(true);

    // Map Discovery Candidates (Zustand) to NerSuggestions (UI)
    // Only show "Watching" candidates (status === 0)
    // Map Discovery Candidates (Zustand) to NerSuggestions (UI)
    // Only show "Watching" candidates (status === 0)
    const suggestions: NerSuggestion[] = React.useMemo(() => {
        const watching = discoveryState.candidates.filter(c => c.status === 0 || c.status === 1);
        console.log(`[Discovery:NERContext] Rendering ${watching.length} watching candidates (Store has ${discoveryState.candidates.length} total)`);

        // Deduplicate by token just in case store has duplicates
        const seen = new Set();
        return watching
            .filter(c => {
                if (seen.has(c.token)) return false;
                seen.add(c.token);
                return true;
            })
            .map((c, index) => ({
                id: c.token,
                key: `${c.token}-${index}`, // Unique React key
                label: c.token,
                kind: KIND_MAP[c.kind] || 'UNKNOWN',
                confidence: Math.min(c.score / 100, 1), // Normalize score for UI (0-1)
                source_note_id: 'derived',
                span_start: 0,
                span_end: 0
            }));
    }, [discoveryState.candidates]);

    // Clear legacy entities
    const clearEntities = useCallback(() => {
        setEntities([]);
    }, []);

    const refreshSuggestions = useCallback(async (_noteId?: string) => {
        // Discovery is push-based, but we could trigger a re-scan here if needed
    }, []);

    const acceptSuggestion = useCallback(async (token: string): Promise<boolean> => {
        const candidate = discoveryState.candidates.find(c => c.token === token);
        if (!candidate) return false;

        const currentNote = currentNoteId || 'unknown-origin';

        console.log(`[NERContext] Accepting candidate: ${token}`, candidate);

        // 1. Determine Kind (255 = None -> Default to 'CONCEPT' or 'CHARACTER' based on context?? 
        // For now, let's look at KIND_MAP. If 255, we'll ask user? Or default to UNKNOWN/CONCEPT?
        // Let's default to CONCEPT if unknown for now, or use the mapped Kind.
        let kindStr: any = KIND_MAP[candidate.kind];
        if (!kindStr || kindStr === 'UNKNOWN') kindStr = 'CONCEPT';

        // 2. Register as REAL Entity in Graph
        try {
            const result = await smartGraphRegistry.registerEntity(
                candidate.token,
                kindStr,
                currentNote,
                { source: 'extraction' }
            );
            console.log(`[NERContext] Entity registered:`, result);
        } catch (err) {
            console.error(`[NERContext] Failed to register entity:`, err);
            // Don't fail the whole flow? Or do we?
        }

        // 3. Persist to CozoDB as Promoted (Status 1) so it doesn't show up as a suggestion again
        const promoted = { ...candidate, status: 1 };
        await kittCore.saveCandidates([promoted]);

        // 4. Remove from Transient Store (UI will update immediately)
        discoveryState.removeCandidate(token);

        return true;
    }, [discoveryState, currentNoteId]);

    const rejectSuggestion = useCallback(async (token: string): Promise<boolean> => {
        const candidate = discoveryState.candidates.find(c => c.token === token);
        if (!candidate) return false;

        console.log(`[NERContext] Rejecting candidate: ${token}`);

        // 1. Persist to CozoDB as Ignored (Status 2)
        const ignored = { ...candidate, status: 2 };
        await kittCore.saveCandidates([ignored]);

        // 2. Remove from Transient Store
        discoveryState.removeCandidate(token);

        return true;
    }, [discoveryState]);

    const refreshModelStatus = useCallback(async () => {
        // No-op in web version
    }, []);

    const value: NERContextValue = {
        // Legacy
        entities,
        modelStatus,
        isAnalyzing,
        error,

        // Real Data
        suggestions,
        isFetchingSuggestions: discoveryState.isScanning,
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

        // Real Actions
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
