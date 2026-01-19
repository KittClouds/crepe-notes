// src/hooks/useRelationshipTypes.ts
// Hook for relationship type definitions
// Matches legacy API for BlueprintHub compatibility

import { useState, useCallback, useEffect } from 'react';
import type { EntityKind } from '@/lib/types/entityTypes';

export interface RelationshipTypeDefinition {
    relationship_type_id: string;
    version_id: string;
    type_code: string;
    display_label: string;
    description?: string;
    source_entity_kind: EntityKind;
    target_entity_kind: EntityKind;
    cardinality: 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many';
    is_directional: boolean;
    created_at?: string;
}

// Temporary hardcoded types until DB schema is ready
const STANDARD_RELATIONSHIP_TYPES: RelationshipTypeDefinition[] = [
    {
        relationship_type_id: 'rel_related_to',
        version_id: 'v1',
        type_code: 'RELATED_TO',
        display_label: 'Related To',
        source_entity_kind: 'character', // Loose constraint for now
        target_entity_kind: 'character',
        cardinality: 'many_to_many',
        is_directional: false
    },
    {
        relationship_type_id: 'rel_knows',
        version_id: 'v1',
        type_code: 'KNOWS',
        display_label: 'Knows',
        source_entity_kind: 'character',
        target_entity_kind: 'character',
        cardinality: 'many_to_many',
        is_directional: true
    },
    {
        relationship_type_id: 'rel_member_of',
        version_id: 'v1',
        type_code: 'MEMBER_OF',
        display_label: 'Member Of',
        source_entity_kind: 'character',
        target_entity_kind: 'group',
        cardinality: 'many_to_one',
        is_directional: true
    },
    {
        relationship_type_id: 'rel_located_in',
        version_id: 'v1',
        type_code: 'LOCATED_IN',
        display_label: 'Located In',
        source_entity_kind: 'character',
        target_entity_kind: 'location',
        cardinality: 'many_to_one',
        is_directional: true
    },
    {
        relationship_type_id: 'rel_location_part_of',
        version_id: 'v1',
        type_code: 'PART_OF',
        display_label: 'Part Of',
        source_entity_kind: 'location',
        target_entity_kind: 'location',
        cardinality: 'many_to_one',
        is_directional: true
    }
];

export function useRelationshipTypes(versionId: string | null) {
    const [relationshipTypes, setRelationshipTypes] = useState<RelationshipTypeDefinition[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    // Load relationship types for version
    useEffect(() => {
        // In the future, this would fetch from DB based on versionId
        // For now, return standard types
        setRelationshipTypes(STANDARD_RELATIONSHIP_TYPES);
    }, [versionId]);

    const create = useCallback(async (data: Omit<RelationshipTypeDefinition, 'relationship_type_id' | 'version_id' | 'created_at'>) => {
        console.warn('[useRelationshipTypes] Stub - would create type:', data);
        // Stub - not implemented
        return null;
    }, []);

    const update = useCallback(async (typeId: string, data: Partial<RelationshipTypeDefinition>) => {
        console.warn('[useRelationshipTypes] Stub - would update type:', typeId, data);
        // Stub - not implemented
    }, []);

    const remove = useCallback(async (typeId: string) => {
        console.warn('[useRelationshipTypes] Stub - would delete type:', typeId);
        // Stub - not implemented
    }, []);

    const getTypeDef = useCallback((typeCode: string) => {
        return STANDARD_RELATIONSHIP_TYPES.find(t => t.type_code === typeCode);
    }, []);

    return {
        relationshipTypes,
        isLoading,
        error,
        create,
        update,
        remove,
        getTypeDef
    };
}
