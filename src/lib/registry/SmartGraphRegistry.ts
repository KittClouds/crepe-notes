// src/lib/registry/SmartGraphRegistry.ts
// Entity Registry - Facade for GraphRegistry (CozoDB)
// V3: Migrated to CozoDB via GraphRegistry and Adapters

import type { EntityKind } from '@/lib/types/entityTypes';
import { implicitScanner } from '../Scanner/ImplicitScanner';
import { entityRegistry } from '@/lib/cozo/graph/adapters/EntityRegistryAdapter';
import { relationshipRegistry } from '@/lib/cozo/graph/adapters/RelationshipRegistryAdapter';
import type { RegisteredEntity } from '@/lib/cozo/graph/adapters/EntityRegistryAdapter';

// =============================================================================
// Legacy Types (kept for compatibility)
// =============================================================================

export type { RegisteredEntity };

export interface EntityDefinition {
    id: string;
    label: string;
    kind: string;
    aliases: string[];
}

export interface EntityRegistrationResult {
    entity: RegisteredEntity;
    isNew: boolean;
    wasMerged: boolean;
}

export interface Edge {
    id: string;
    sourceId: string;
    targetId: string;
    type: string;
    confidence: number;
    sourceNote?: string;
}

// =============================================================================
// SmartGraphRegistry Facade
// =============================================================================

export class SmartGraphRegistryFacade {
    private initialized = false;

    // =========================================================================
    // Initialization
    // =========================================================================

    async init(): Promise<void> {
        if (this.initialized) return;

        try {
            await entityRegistry.init();
            await relationshipRegistry.init();
            this.initialized = true;

            // KAMMI: ImplicitScanner hydration is now handled by AppOrchestrator
            // to ensure batching and correct phase execution.
            // const entities = entityRegistry.getAllEntities();
            // const scannerEntities = entities.map(this.toScannerEntity);
            // implicitScanner.hydrate(scannerEntities);

            console.log(`[SmartGraphRegistry] Initialized via GraphRegistry (CozoDB). Loaded ${entityRegistry.getAllEntities().length} entities.`);
        } catch (err) {
            console.error('[SmartGraphRegistry] Failed to initialize:', err);
            throw err;
        }
    }

    isInitialized(): boolean {
        return this.initialized;
    }

    private toScannerEntity(e: RegisteredEntity) {
        return {
            id: e.id,
            label: e.label,
            kind: e.kind,
            aliases: e.aliases,
            originNoteId: e.firstNote,
            registeredAt: e.createdAt.getTime(),
        };
    }

    // =========================================================================
    // ENTITY OPERATIONS
    // =========================================================================

    isRegisteredEntity(label: string): boolean {
        return entityRegistry.isRegisteredEntity(label);
    }

    getEntityById(id: string): RegisteredEntity | null {
        return entityRegistry.getEntityById(id);
    }

    findEntityByLabel(label: string): RegisteredEntity | null {
        return entityRegistry.findEntityByLabel(label);
    }

    getAllEntities(): RegisteredEntity[] {
        return entityRegistry.getAllEntities();
    }

    getEntitiesByKind(kind: EntityKind): RegisteredEntity[] {
        return entityRegistry.getEntitiesByKind(kind);
    }

    async registerEntity(
        label: string,
        kind: EntityKind,
        noteId: string,
        options?: {
            subtype?: string;
            aliases?: string[];
            attributes?: Record<string, any>;
            source?: 'user' | 'extraction' | 'auto';
        }
    ): Promise<EntityRegistrationResult> {
        const result = await entityRegistry.registerEntity(label, kind, noteId, options);

        // Update implicit scanner incrementally needed? 
        // implicitScanner usually rebuilds trie. Ideally we call hydrate again or addIncremental.
        // For now, re-hydration is safer though heavier. Or rely on scanning logic.
        implicitScanner.hydrate(Array.from(entityRegistry.getAllEntities()).map(this.toScannerEntity));

        return result;
    }

    async deleteEntity(id: string): Promise<boolean> {
        return entityRegistry.deleteEntity(id);
    }

    async clearAll(): Promise<number> {
        await entityRegistry.clear();
        await relationshipRegistry.clear();
        implicitScanner.hydrate([]);
        return 0; // Count unknown unless we checked before clearing
    }

    // =========================================================================
    // EDGE OPERATIONS (Relationships)
    // =========================================================================

    async createEdge(
        sourceId: string,
        targetId: string,
        type: string,
        options?: {
            confidence?: number;
            sourceNote?: string;
        }
    ): Promise<Edge> {
        const rel = relationshipRegistry.add({
            sourceEntityId: sourceId,
            targetEntityId: targetId,
            type: type,
            provenance: [{
                source: 'user', // Default source for manual creation
                originId: options?.sourceNote || 'unknown',
                confidence: options?.confidence || 1.0,
                timestamp: new Date()
            }]
        });

        return {
            id: rel.id,
            sourceId: rel.sourceEntityId,
            targetId: rel.targetEntityId,
            type: rel.type,
            confidence: rel.confidence,
            sourceNote: options?.sourceNote // Not stored directly on edge but in provenance
        };
    }

    async getEdges(
        entityId: string,
        direction: 'in' | 'out' | 'both' = 'both'
    ): Promise<Edge[]> {
        let relations;
        if (direction === 'in') {
            relations = relationshipRegistry.getByTarget(entityId);
        } else if (direction === 'out') {
            relations = relationshipRegistry.getBySource(entityId);
        } else {
            relations = relationshipRegistry.getByEntity(entityId);
        }

        return relations.map(r => ({
            id: r.id,
            sourceId: r.sourceEntityId,
            targetId: r.targetEntityId,
            type: r.type,
            confidence: r.confidence,
            sourceNote: r.provenance[0]?.originId // Approximation
        }));
    }

    async deleteEdge(edgeId: string): Promise<boolean> {
        return relationshipRegistry.delete(edgeId);
    }

    getAllEdges(): Edge[] {
        return relationshipRegistry.getAll().map(r => ({
            id: r.id,
            sourceId: r.sourceEntityId,
            targetId: r.targetEntityId,
            type: r.type,
            confidence: r.confidence,
            sourceNote: r.provenance[0]?.originId
        }));
    }

    // =========================================================================
    // Search & Misc
    // =========================================================================

    async searchEntities(query: string) {
        return entityRegistry.searchEntities(query);
    }

    async addAlias(entityId: string, alias: string): Promise<boolean> {
        return entityRegistry.addAlias(entityId, alias);
    }

    async getStats() {
        // approximate compatibility
        const stats = await entityRegistry.getStats();
        const edges = await relationshipRegistry.getAll();
        return {
            totalEntities: stats.totalEntities,
            byKind: stats.byKind,
            totalMentions: stats.totalMentions,
            totalAliases: stats.totalAliases,
            totalEdges: edges.length
        };
    }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const smartGraphRegistry = new SmartGraphRegistryFacade();
export { smartGraphRegistry as entityRegistry };
