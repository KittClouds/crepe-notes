// src/hooks/useExtractionProfile.ts
// Hook for extraction profile settings
// Matches legacy API for ExtractionTab compatibility

import { useState, useCallback, useEffect } from 'react';

export interface ExtractionProfile {
    profile_id: string;
    version_id: string;
    enabled: boolean;
    model_id: string;
    confidence_threshold: number;
    resolution_policy: 'entity_on_accept' | 'mention_first';
}

export interface LabelMapping {
    mapping_id: string;
    profile_id: string;
    ner_label: string;
    target_entity_kinds: string[];
    priority: number;
}

export interface IgnoreEntry {
    ignore_id: string;
    profile_id: string;
    surface_form?: string;
    ner_label?: string;
}

export function useExtractionProfile(versionId: string | null) {
    const [profile, setProfile] = useState<ExtractionProfile | null>(null);
    const [mappings, setMappings] = useState<LabelMapping[]>([]);
    const [ignoreList, setIgnoreList] = useState<IgnoreEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Load profile for version
    useEffect(() => {
        if (!versionId) {
            setProfile(null);
            setMappings([]);
            setIgnoreList([]);
            return;
        }

        // Stub - not implemented
        console.warn('[useExtractionProfile] Stub - would load profile for version:', versionId);

        // Return default profile for UI to render
        setProfile({
            profile_id: 'stub-profile',
            version_id: versionId,
            enabled: true,
            model_id: 'onnx-community/NeuroBERT-NER-ONNX',
            confidence_threshold: 0.7,
            resolution_policy: 'mention_first',
        });
        setMappings([]);
        setIgnoreList([]);
    }, [versionId]);

    const updateProfile = useCallback(async (data: Partial<ExtractionProfile>) => {
        console.warn('[useExtractionProfile] Stub - would update profile:', data);
        if (profile) {
            setProfile({ ...profile, ...data });
        }
    }, [profile]);

    const addMapping = useCallback(async (data: Omit<LabelMapping, 'mapping_id' | 'profile_id'>) => {
        console.warn('[useExtractionProfile] Stub - would add mapping:', data);
        // Stub - not implemented
    }, []);

    const removeMapping = useCallback(async (mappingId: string) => {
        console.warn('[useExtractionProfile] Stub - would remove mapping:', mappingId);
        // Stub - not implemented
    }, []);

    const addIgnore = useCallback(async (data: Omit<IgnoreEntry, 'ignore_id' | 'profile_id'>) => {
        console.warn('[useExtractionProfile] Stub - would add to ignore list:', data);
        // Stub - not implemented
    }, []);

    const removeIgnore = useCallback(async (ignoreId: string) => {
        console.warn('[useExtractionProfile] Stub - would remove from ignore list:', ignoreId);
        // Stub - not implemented
    }, []);

    return {
        profile,
        mappings,
        ignoreList,
        isLoading,
        updateProfile,
        addMapping,
        removeMapping,
        addIgnore,
        removeIgnore,
    };
}
