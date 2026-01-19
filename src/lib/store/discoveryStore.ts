// src/lib/store/discoveryStore.ts
// Discovery Store - Transient state for Unsupervised NER candidates
// Holds "potential entities" found by the Virus until they are promoted or ignored.

import { create } from 'zustand';

export interface DiscoveryCandidate {
    token: string;
    kind: number; // 255 = None, else EntityKind
    score: number;
    status: number; // 0=Watching, 1=Promoted, 2=Ignored
    lastSeen?: number; // Timestamp
}

interface DiscoveryState {
    candidates: DiscoveryCandidate[];
    isScanning: boolean;

    // Actions
    addCandidates: (newCandidates: DiscoveryCandidate[]) => void;
    setScanning: (isScanning: boolean) => void;
    clearCandidates: () => void;
    removeCandidate: (token: string) => void;
}

export const useDiscoveryStore = create<DiscoveryState>((set) => ({
    candidates: [],
    isScanning: false,

    addCandidates: (newCandidates) => set((state) => {
        // 1. Deduplicate incoming candidates internally (last one wins)
        const incomingMap = new Map();
        for (const c of newCandidates) {
            incomingMap.set(c.token, c);
        }
        const distinctNew = Array.from(incomingMap.values()) as DiscoveryCandidate[];

        // 2. Filter out candidates that already exist in state
        const existingTokens = new Set(state.candidates.map(c => c.token));
        const uniqueMerged = distinctNew.filter(c => !existingTokens.has(c.token));

        if (uniqueMerged.length === 0) {
            console.log(`[Discovery:Store] No unique candidates to add (received ${newCandidates.length})`);
            return state;
        }

        console.log(`[Discovery:Store] Adding ${uniqueMerged.length} unique candidates`, uniqueMerged.map(c => c.token));

        return {
            candidates: [...state.candidates, ...uniqueMerged]
        };
    }),

    setScanning: (isScanning) => set({ isScanning }),

    clearCandidates: () => set({ candidates: [] }),

    removeCandidate: (token) => set((state) => ({
        candidates: state.candidates.filter(c => c.token !== token)
    }))
}));
