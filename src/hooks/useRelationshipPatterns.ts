// src/hooks/useRelationshipPatterns.ts
// Hook for relationship extraction patterns
// Matches legacy API for ExtractionTab compatibility

import { useState, useCallback, useEffect } from 'react';

export interface RelationshipPattern {
    pattern_id: string;
    profile_id: string;
    verb_pattern: string;
    relationship_type: string;
    inverse_type?: string;
    confidence: number;
    category: string;
    bidirectional: boolean;
    enabled: boolean;
}

export function useRelationshipPatterns(profileId: string | null | undefined) {
    const [patterns, setPatterns] = useState<RelationshipPattern[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Load patterns for profile
    useEffect(() => {
        if (!profileId) {
            setPatterns([]);
            return;
        }

        // TODO: Connect to TauRPC
        console.warn('[useRelationshipPatterns] Stub - would load patterns for profile:', profileId);

        // Return some default patterns for UI demonstration
        setPatterns([
            {
                pattern_id: 'default-1',
                profile_id: profileId,
                verb_pattern: 'met|knows|befriended',
                relationship_type: 'KNOWS',
                confidence: 0.8,
                category: 'social',
                bidirectional: true,
                enabled: true,
            },
            {
                pattern_id: 'default-2',
                profile_id: profileId,
                verb_pattern: 'is captain of|leads|commands',
                relationship_type: 'LEADS',
                inverse_type: 'FOLLOWS',
                confidence: 0.9,
                category: 'organizational',
                bidirectional: false,
                enabled: true,
            },
            {
                pattern_id: 'default-3',
                profile_id: profileId,
                verb_pattern: 'lives in|resides at|located in',
                relationship_type: 'LOCATED_IN',
                confidence: 0.85,
                category: 'spatial',
                bidirectional: false,
                enabled: true,
            },
        ]);
    }, [profileId]);

    const addPattern = useCallback(async (data: Omit<RelationshipPattern, 'pattern_id' | 'profile_id' | 'enabled'>) => {
        console.warn('[useRelationshipPatterns] Stub - would add pattern:', data);
        // Add to local state for UI feedback
        if (profileId) {
            const newPattern: RelationshipPattern = {
                pattern_id: `custom-${Date.now()}`,
                profile_id: profileId,
                enabled: true,
                ...data,
            };
            setPatterns(prev => [...prev, newPattern]);
        }
    }, [profileId]);

    const removePattern = useCallback(async (patternId: string) => {
        console.warn('[useRelationshipPatterns] Stub - would remove pattern:', patternId);
        setPatterns(prev => prev.filter(p => p.pattern_id !== patternId));
    }, []);

    const togglePattern = useCallback(async (patternId: string) => {
        console.warn('[useRelationshipPatterns] Stub - would toggle pattern:', patternId);
        setPatterns(prev => prev.map(p =>
            p.pattern_id === patternId ? { ...p, enabled: !p.enabled } : p
        ));
    }, []);

    const resetToDefaults = useCallback(async () => {
        console.warn('[useRelationshipPatterns] Stub - would reset to defaults');
        // TODO: Connect to TauRPC
    }, []);

    return {
        patterns,
        isLoading,
        addPattern,
        removePattern,
        togglePattern,
        resetToDefaults,
    };
}
