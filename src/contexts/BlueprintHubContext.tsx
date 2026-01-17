// src/contexts/BlueprintHubContext.tsx
// Blueprint Hub Context - provides versionId and hub state
// Stub for V2 - will be connected to native backend version management

import React, { createContext, useContext, useState, type ReactNode } from 'react';

interface BlueprintHubContextValue {
    versionId: string | null;
    setVersionId: (id: string | null) => void;
    isLoading: boolean;
}

const BlueprintHubContext = createContext<BlueprintHubContextValue | null>(null);

interface BlueprintHubProviderProps {
    children: ReactNode;
    defaultVersionId?: string;
}

export function BlueprintHubProvider({ children, defaultVersionId = 'draft-v1' }: BlueprintHubProviderProps) {
    const [versionId, setVersionId] = useState<string | null>(defaultVersionId);
    const [isLoading] = useState(false);

    return (
        <BlueprintHubContext.Provider value={{ versionId, setVersionId, isLoading }}>
            {children}
        </BlueprintHubContext.Provider>
    );
}

export function useBlueprintHubContext() {
    const context = useContext(BlueprintHubContext);
    if (!context) {
        // Return stub values if not in provider
        return {
            versionId: 'draft-v1',
            setVersionId: () => { },
            isLoading: false,
        };
    }
    return context;
}
