/**
 * Storage Shim - V2 Compatible
 * 
 * Maps V1 storage interfaces to V2's smartGraphRegistry.
 * This allows legacy fact-sheet components to work without full migration.
 */

import { smartGraphRegistry } from '@/lib/registry';
import type { EntityKind } from '@/lib/types/entityTypes';

// =============================================================================
// Types (minimal subset needed for fact sheets)
// =============================================================================

export interface Entity {
    id: string;
    name: string;
    entity_kind: string;
    entity_subtype?: string | null;
    group_id: string;
    scope_type: string;
    created_at: number;
    extraction_method: string;
    summary?: string | null;
    aliases: string[];
    canonical_note_id?: string | null;
    frequency: number;
    attributes?: Record<string, unknown>;
}

export interface EntityEdge {
    id: string;
    source_id: string;
    target_id: string;
    created_at: number;
    edge_type: string;
    weight: number;
    confidence: number;
}

export interface CreateEntityInput {
    name: string;
    entity_kind: string;
    entity_subtype?: string;
    group_id: string;
    aliases?: string[];
    attributes?: Record<string, unknown>;
}

export interface CreateEdgeInput {
    source_id: string;
    target_id: string;
    edge_type?: string;
    confidence?: number;
}

// =============================================================================
// Entity Store Shim
// =============================================================================

export interface IEntityStore {
    upsertEntity(input: CreateEntityInput): Promise<Entity>;
    getEntityById(id: string): Promise<Entity | null>;
    findEntityByName(name: string, kind: string, groupId: string): Promise<Entity | null>;
    deleteEntity(id: string): Promise<void>;
    getEntitiesByKind(kind: string, groupId: string): Promise<Entity[]>;
    getAllEntities(groupId: string): Promise<Entity[]>;
}

class EntityStoreShim implements IEntityStore {
    async upsertEntity(input: CreateEntityInput): Promise<Entity> {
        const result = await smartGraphRegistry.registerEntity(
            input.name,
            input.entity_kind as EntityKind,
            input.group_id,
            {
                subtype: input.entity_subtype,
                aliases: input.aliases,
                attributes: input.attributes,
            }
        );

        return this.mapToEntity(result.entity);
    }

    async getEntityById(id: string): Promise<Entity | null> {
        const entity = smartGraphRegistry.getEntityById(id);
        return entity ? this.mapToEntity(entity) : null;
    }

    async findEntityByName(name: string, kind: string, _groupId: string): Promise<Entity | null> {
        const entity = smartGraphRegistry.findEntityByLabel(name);
        if (entity && entity.kind === kind) {
            return this.mapToEntity(entity);
        }
        return null;
    }

    async deleteEntity(id: string): Promise<void> {
        await smartGraphRegistry.deleteEntity(id);
    }

    async getEntitiesByKind(kind: string, _groupId: string): Promise<Entity[]> {
        const entities = smartGraphRegistry.getEntitiesByKind(kind as EntityKind);
        return entities.map(e => this.mapToEntity(e));
    }

    async getAllEntities(_groupId: string): Promise<Entity[]> {
        const entities = smartGraphRegistry.getAllEntities();
        return entities.map(e => this.mapToEntity(e));
    }

    private mapToEntity(e: any): Entity {
        return {
            id: e.id,
            name: e.label,
            entity_kind: e.kind,
            entity_subtype: e.subtype || null,
            group_id: e.firstNote || 'default',
            scope_type: 'vault',
            created_at: e.createdAt?.getTime() || Date.now(),
            extraction_method: e.createdBy || 'auto',
            summary: null,
            aliases: e.aliases || [],
            canonical_note_id: e.firstNote || null,
            frequency: e.totalMentions || 1,
            attributes: e.attributes || {},
        };
    }
}

// =============================================================================
// Edge Store Shim
// =============================================================================

export interface IEdgeStore {
    createEdge(input: CreateEdgeInput): Promise<EntityEdge>;
    getEdgeById(id: string): Promise<EntityEdge | null>;
    getEdgesBySourceId(sourceId: string): Promise<EntityEdge[]>;
    getEdgesByTargetId(targetId: string): Promise<EntityEdge[]>;
    deleteEdge(id: string): Promise<void>;
    getAllEdges(groupId?: string): Promise<EntityEdge[]>;
}

class EdgeStoreShim implements IEdgeStore {
    async createEdge(input: CreateEdgeInput): Promise<EntityEdge> {
        const edge = await smartGraphRegistry.createEdge(
            input.source_id,
            input.target_id,
            input.edge_type || 'RELATED_TO',
            { confidence: input.confidence }
        );

        return this.mapToEdge(edge);
    }

    async getEdgeById(id: string): Promise<EntityEdge | null> {
        // Get all edges and find by ID (smartGraphRegistry doesn't have getEdgeById)
        const allEdges = await smartGraphRegistry.getEdges('', 'both');
        const edge = allEdges.find(e => e.id === id);
        return edge ? this.mapToEdge(edge) : null;
    }

    async getEdgesBySourceId(sourceId: string): Promise<EntityEdge[]> {
        const edges = await smartGraphRegistry.getEdges(sourceId, 'out');
        return edges.map(e => this.mapToEdge(e));
    }

    async getEdgesByTargetId(targetId: string): Promise<EntityEdge[]> {
        const edges = await smartGraphRegistry.getEdges(targetId, 'in');
        return edges.map(e => this.mapToEdge(e));
    }

    async deleteEdge(id: string): Promise<void> {
        await smartGraphRegistry.deleteEdge(id);
    }

    async getAllEdges(_groupId?: string): Promise<EntityEdge[]> {
        // No direct method - would need to iterate all entities
        return [];
    }

    private mapToEdge(e: any): EntityEdge {
        return {
            id: e.id,
            source_id: e.sourceId,
            target_id: e.targetId,
            created_at: Date.now(),
            edge_type: e.type,
            weight: 1,
            confidence: e.confidence || 1.0,
        };
    }
}

// =============================================================================
// Singleton instances
// =============================================================================

let entityStoreInstance: EntityStoreShim | null = null;
let edgeStoreInstance: EdgeStoreShim | null = null;

export function getEntityStore(): IEntityStore {
    if (!entityStoreInstance) {
        entityStoreInstance = new EntityStoreShim();
    }
    return entityStoreInstance;
}

export function getEdgeStore(): IEdgeStore {
    if (!edgeStoreInstance) {
        edgeStoreInstance = new EdgeStoreShim();
    }
    return edgeStoreInstance;
}

// Stubs for other stores (not implemented yet)
export function getMentionStore() {
    return {
        createMention: async () => ({ id: '' }),
        getMentionsByNoteId: async () => [],
    };
}

export function getBlueprintStore() {
    return {
        initialize: async () => { },
        getAllBlueprintMetas: async () => [],
        getRelationshipTypesByVersionId: async () => [],
    };
}

export function getTemporalStore() {
    return {
        getSnapshot: async () => ({ entities: [], edges: [], timestamp: Date.now() }),
    };
}

export function getEmbeddingStore() {
    return {
        getEmbedding: async () => null,
    };
}

export function getStorageService() {
    return {
        entities: getEntityStore(),
        edges: getEdgeStore(),
        mentions: getMentionStore(),
        blueprints: getBlueprintStore(),
        temporal: getTemporalStore(),
        embeddings: getEmbeddingStore(),
    };
}

export async function initializeStorage(): Promise<void> {
    await smartGraphRegistry.ensureInit();
    console.log('[Storage Shim] Initialized via smartGraphRegistry');
}
