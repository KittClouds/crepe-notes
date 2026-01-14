// src/hooks/useEntityRelationships.ts
// Entity Relationships Hook - provides interface for entity relationships
// Matches legacy API signature for RelationshipTypesTab compatibility

import { useState, useCallback, useEffect } from 'react';
import type { EntityKind } from '@/lib/types/entityTypes';

// Types matching legacy RelationshipTypesTab expectations
export interface RelationshipType {
    id: string;
    code: string;
    displayLabel: string;
    sourceKind: EntityKind;
    targetKind: EntityKind;
    cardinality: string;
    isDirectional: boolean;
}

export interface EntityRef {
    id: string;
    name: string;
    kind: EntityKind;
    noteId?: string;
}

export interface EntityRelationship {
    id: string;
    type: RelationshipType;
    sourceEntity: EntityRef;
    targetEntity: EntityRef;
    confidence: number;
    createdAt?: string;
}

export interface GroupedRelationships {
    type: RelationshipType;
    outgoing: EntityRelationship[];
    incoming: EntityRelationship[];
    totalCount: number;
}

export interface ApplicableRelationshipType {
    id: string;
    code: string;
    displayLabel: string;
    direction: 'outgoing' | 'incoming';
    otherEntityKind: EntityKind;
}

export interface CandidateEntity {
    id: string;
    name: string;
    kind: EntityKind;
    noteId?: string;
    hasExistingRelationship: boolean;
}

export interface ParsedEntity {
    kind: EntityKind;
    label: string;
    noteId?: string;
    attributes?: Record<string, unknown>;
}

export function useEntityRelationships(entity: ParsedEntity | null) {
    const [groupedRelationships, setGroupedRelationships] = useState<GroupedRelationships[]>([]);
    const [applicableTypes, setApplicableTypes] = useState<ApplicableRelationshipType[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Load relationships for entity
    useEffect(() => {
        if (!entity) {
            setGroupedRelationships([]);
            setApplicableTypes([]);
            return;
        }

        // TODO: Connect to TauRPC to load relationships
        console.warn('[useEntityRelationships] Stub - would load relationships for:', entity.label);

        // Return empty data for now
        setGroupedRelationships([]);
        setApplicableTypes([]);
    }, [entity]);

    const createRelationship = useCallback(async (params: {
        targetEntityId: string;
        relationshipTypeId: string;
    }) => {
        console.warn('[useEntityRelationships] Stub - would create relationship:', params);
        // TODO: Connect to TauRPC
        return null;
    }, []);

    const deleteRelationship = useCallback(async (relationshipId: string) => {
        console.warn('[useEntityRelationships] Stub - would delete relationship:', relationshipId);
        // TODO: Connect to TauRPC
    }, []);

    const getCandidates = useCallback(async (typeId: string): Promise<CandidateEntity[]> => {
        console.warn('[useEntityRelationships] Stub - would get candidates for type:', typeId);
        // TODO: Connect to TauRPC
        return [];
    }, []);

    const refresh = useCallback(() => {
        console.warn('[useEntityRelationships] Stub - would refresh');
    }, []);

    return {
        groupedRelationships,
        applicableTypes,
        isLoading,
        createRelationship,
        deleteRelationship,
        getCandidates,
        refresh,
    };
}
