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

export function useRelationshipTypes(versionId: string | null) {
    const [relationshipTypes, setRelationshipTypes] = useState<RelationshipTypeDefinition[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    // Load relationship types for version
    useEffect(() => {
        if (!versionId) {
            setRelationshipTypes([]);
            return;
        }

        // TODO: Connect to TauRPC
        console.warn('[useRelationshipTypes] Stub - would load types for version:', versionId);
        setRelationshipTypes([]);
    }, [versionId]);

    const create = useCallback(async (data: Omit<RelationshipTypeDefinition, 'relationship_type_id' | 'version_id' | 'created_at'>) => {
        console.warn('[useRelationshipTypes] Stub - would create type:', data);
        // TODO: Connect to TauRPC
        return null;
    }, []);

    const update = useCallback(async (typeId: string, data: Partial<RelationshipTypeDefinition>) => {
        console.warn('[useRelationshipTypes] Stub - would update type:', typeId, data);
        // TODO: Connect to TauRPC
    }, []);

    const remove = useCallback(async (typeId: string) => {
        console.warn('[useRelationshipTypes] Stub - would delete type:', typeId);
        // TODO: Connect to TauRPC
    }, []);

    return {
        relationshipTypes,
        isLoading,
        error,
        create,
        update,
        remove,
    };
}
