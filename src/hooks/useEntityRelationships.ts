// src/hooks/useEntityRelationships.ts
// Entity Relationships Hook - provides interface for entity relationships
// Matches legacy API signature for RelationshipTypesTab compatibility

import { useState, useCallback, useEffect } from 'react';
import type { EntityKind } from '@/lib/types/entityTypes';
import { smartGraphRegistry } from '@/lib/registry/SmartGraphRegistry';
import { useRelationshipTypes } from './useRelationshipTypes';

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

    // We reuse the types definition hook to get metadata about relationship types
    const { relationshipTypes: definedTypes } = useRelationshipTypes('v1');

    const fetchRelationships = useCallback(async () => {
        if (!entity || !entity.noteId) { // Check noteId (which usually acts as ID) or find ID by label
            // If we only have label, try to resolve ID
            return;
        }

        setIsLoading(true);
        try {
            // resolve ID if needed
            let entityId = entity.noteId;
            if (!entityId || !smartGraphRegistry.getEntityById(entityId)) {
                const registered = smartGraphRegistry.findEntityByLabel(entity.label);
                if (registered) entityId = registered.id;
                else {
                    // Entity not registered in graph yet
                    setGroupedRelationships([]);
                    setApplicableTypes([]);
                    setIsLoading(false);
                    return;
                }
            }

            const edges = await smartGraphRegistry.getEdges(entityId, 'both');
            const groups: Map<string, GroupedRelationships> = new Map();

            for (const edge of edges) {
                // Determine direction
                const isOutgoing = edge.sourceId === entityId;
                const otherId = isOutgoing ? edge.targetId : edge.sourceId;

                // Fetch other entity
                const otherEntity = smartGraphRegistry.getEntityById(otherId);
                const otherEntityKind = otherEntity?.kind || 'character'; // Fallback
                const otherEntityLabel = otherEntity?.label || 'Unknown';
                const otherEntityNoteId = otherEntity?.firstNote;

                // Find type definition
                const typeDef = definedTypes.find(t => t.type_code === edge.type) || {
                    relationship_type_id: `generated_${edge.type}`,
                    type_code: edge.type,
                    display_label: edge.type.replace(/_/g, ' '),
                    source_entity_kind: isOutgoing ? entity.kind : otherEntityKind,
                    target_entity_kind: isOutgoing ? otherEntityKind : entity.kind,
                    cardinality: 'many_to_many',
                    is_directional: true
                };

                // Type object for UI
                const uiType: RelationshipType = {
                    id: typeDef.relationship_type_id,
                    code: typeDef.type_code,
                    displayLabel: typeDef.display_label,
                    sourceKind: typeDef.source_entity_kind,
                    targetKind: typeDef.target_entity_kind,
                    cardinality: typeDef.cardinality,
                    isDirectional: typeDef.is_directional
                };

                if (!groups.has(uiType.code)) {
                    groups.set(uiType.code, {
                        type: uiType,
                        outgoing: [],
                        incoming: [],
                        totalCount: 0
                    });
                }

                const group = groups.get(uiType.code)!;

                const rel: EntityRelationship = {
                    id: edge.id,
                    type: uiType,
                    sourceEntity: isOutgoing ? {
                        id: entityId, name: entity.label, kind: entity.kind, noteId: entity.noteId
                    } : {
                        id: otherId, name: otherEntityLabel, kind: otherEntityKind, noteId: otherEntityNoteId
                    },
                    targetEntity: isOutgoing ? {
                        id: otherId, name: otherEntityLabel, kind: otherEntityKind, noteId: otherEntityNoteId
                    } : {
                        id: entityId, name: entity.label, kind: entity.kind, noteId: entity.noteId
                    },
                    confidence: edge.confidence,
                    createdAt: new Date().toISOString() // Mock, edge doesn't strictly carry this without provenance fetch
                };

                if (isOutgoing) {
                    group.outgoing.push(rel);
                } else {
                    group.incoming.push(rel);
                }
                group.totalCount++;
            }

            setGroupedRelationships(Array.from(groups.values()));

            // Calculate Applicable Types (for creating new connections)
            // Anything that has this entity kind as source OR target (if bidirectional)
            const applicable = definedTypes.map(dt => {
                const isSource = dt.source_entity_kind === entity.kind || dt.source_entity_kind === 'character'; // 'character' as generic fallback for now if strict typing is off

                if (isSource) {
                    return {
                        id: dt.relationship_type_id,
                        code: dt.type_code,
                        displayLabel: dt.display_label,
                        direction: 'outgoing' as const,
                        otherEntityKind: dt.target_entity_kind
                    };
                }
                return null;
            }).filter((t): t is ApplicableRelationshipType => t !== null);

            setApplicableTypes(applicable);

        } catch (err) {
            console.error('[useEntityRelationships] Failed to load:', err);
        } finally {
            setIsLoading(false);
        }
    }, [entity, definedTypes]);

    // Initial load
    useEffect(() => {
        fetchRelationships();
    }, [fetchRelationships]);

    const createRelationship = useCallback(async (params: {
        targetEntityId: string;
        relationshipTypeId: string;
    }) => {
        if (!entity) return null;

        // Resolve Source ID
        let sourceId = entity.noteId;
        if (!sourceId || !smartGraphRegistry.getEntityById(sourceId)) {
            const registered = smartGraphRegistry.findEntityByLabel(entity.label);
            sourceId = registered?.id;
        }

        if (!sourceId) {
            console.error('[useEntityRelationships] Cannot create: source entity not found in registry');
            return null;
        }

        // Resolve Type Code from ID
        const typeDef = definedTypes.find(t => t.relationship_type_id === params.relationshipTypeId);
        if (!typeDef) {
            console.error('[useEntityRelationships] Unknown relationship type id:', params.relationshipTypeId);
            return null;
        }

        try {
            await smartGraphRegistry.createEdge(sourceId, params.targetEntityId, typeDef.type_code, {
                confidence: 1.0,
                sourceNote: sourceId // attributing to the entity itself for now
            });

            fetchRelationships(); // Refresh
            return true;
        } catch (err) {
            console.error('[useEntityRelationships] Create failed:', err);
            return null;
        }
    }, [entity, definedTypes, fetchRelationships]);

    const deleteRelationship = useCallback(async (relationshipId: string) => {
        try {
            await smartGraphRegistry.deleteEdge(relationshipId);
            fetchRelationships();
        } catch (err) {
            console.error('[useEntityRelationships] Delete failed:', err);
        }
    }, [fetchRelationships]);

    const getCandidates = useCallback(async (typeId: string): Promise<CandidateEntity[]> => {
        if (!entity) return [];

        const typeDef = definedTypes.find(t => t.relationship_type_id === typeId);
        if (!typeDef) return [];

        const candidates = smartGraphRegistry.getEntitiesByKind(typeDef.target_entity_kind);

        // Filter out self
        // Also check existing relationships to flag them?
        // For now just return all valid candidates
        return candidates
            .filter(c => c.label !== entity.label) // Simple self-check
            .map(c => ({
                id: c.id,
                name: c.label,
                kind: c.kind,
                noteId: c.firstNote,
                hasExistingRelationship: false // TODO: check actual existence in current edges
            }));
    }, [entity, definedTypes]);

    const refresh = useCallback(() => {
        fetchRelationships();
    }, [fetchRelationships]);

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
