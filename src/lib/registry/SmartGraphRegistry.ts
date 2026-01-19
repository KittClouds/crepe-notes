// src/lib/registry/SmartGraphRegistry.ts
// Entity Registry - Thin Facade for CozoGraphRegistry
// V4: Direct CozoDB integration with GraphHotCache

import type { EntityKind } from '@/lib/types/entityTypes';
import { kittCore } from '@/lib/kittcore';
// import { implicitScanner } from '../Scanner/ImplicitScanner'; // DEPRECATED
// import { scheduleRecompile } from '../Scanner/dictionary-service'; // DEPRECATED
import { cozoGraphRegistry, type CozoEntity, type CozoRelationship, type RelationshipProvenance } from '@/lib/cozo/graph/GraphRegistry';
import type { GraphHotCache } from '@/lib/cozo/graph/GraphHotCache';

// =============================================================================
// Types - Compatible with legacy code
// =============================================================================

export interface RegisteredEntity {
    id: string;
    label: string;
    aliases: string[];
    kind: EntityKind;
    subtype?: string;
    firstNote: string;
    mentionsByNote: Map<string, number>;
    totalMentions: number;
    lastSeenDate: Date;
    createdAt: Date;
    createdBy: 'user' | 'extraction' | 'auto';
    attributes?: Record<string, any>;
    /** Timestamp for Scanner compatibility */
    registeredAt: number;
}

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
// SmartGraphRegistry Facade (Thin wrapper around CozoGraphRegistry)
// =============================================================================

export class SmartGraphRegistryFacade {
    private initialized = false;

    // =========================================================================
    // Initialization
    // =========================================================================

    async init(): Promise<void> {
        if (this.initialized) return;

        try {
            await cozoGraphRegistry.init();
            this.initialized = true;

            const entityCount = cozoGraphRegistry.getHotCache().size;
            console.log(`[SmartGraphRegistry] Initialized via CozoGraphRegistry. Loaded ${entityCount} entities.`);
        } catch (err) {
            console.error('[SmartGraphRegistry] Failed to initialize:', err);
            throw err;
        }
    }

    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Get direct access to the hot cache for performance-critical operations
     */
    getHotCache(): GraphHotCache {
        return cozoGraphRegistry.getHotCache();
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

    private toRegisteredEntity(e: CozoEntity): RegisteredEntity {
        return {
            id: e.id,
            label: e.label,
            aliases: e.aliases || [],
            kind: e.kind,
            subtype: e.subtype,
            firstNote: e.firstNote,
            mentionsByNote: e.mentionsByNote || new Map(),
            totalMentions: e.totalMentions || 0,
            lastSeenDate: e.lastSeenDate || new Date(),
            createdAt: e.createdAt,
            createdBy: e.createdBy,
            attributes: e.metadata || {},
            registeredAt: e.createdAt.getTime(),
        };
    }

    // =========================================================================
    // ENTITY OPERATIONS
    // =========================================================================

    isRegisteredEntity(label: string): boolean {
        return cozoGraphRegistry.isRegisteredEntity(label);
    }

    getEntityById(id: string): RegisteredEntity | null {
        const entity = cozoGraphRegistry.getEntityById(id);
        return entity ? this.toRegisteredEntity(entity) : null;
    }

    findEntityByLabel(label: string): RegisteredEntity | null {
        const entity = cozoGraphRegistry.findEntityByLabel(label);
        return entity ? this.toRegisteredEntity(entity) : null;
    }

    getAllEntities(): RegisteredEntity[] {
        return cozoGraphRegistry.getAllEntities().map(e => this.toRegisteredEntity(e));
    }

    getEntitiesByKind(kind: EntityKind): RegisteredEntity[] {
        return cozoGraphRegistry.getEntitiesByKind(kind).map(e => this.toRegisteredEntity(e));
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
        const existing = cozoGraphRegistry.findEntityByLabel(label);
        const isNew = !existing;

        const entity = cozoGraphRegistry.registerEntity(label, kind, noteId, {
            subtype: options?.subtype,
            aliases: options?.aliases,
            metadata: options?.attributes,
        });

        // Update implicit scanner with all entities (includes version for skip-if-unchanged)
        // const allEntities = this.getAllEntities();
        // const entityVersion = cozoGraphRegistry.getHotCache().entityVersion;
        // implicitScanner.hydrate(allEntities.map(this.toScannerEntity), entityVersion);

        // Schedule dictionary recompilation (debounced)
        // scheduleRecompile(allEntities);

        return {
            entity: this.toRegisteredEntity(entity),
            isNew,
            wasMerged: false,
        };
    }

    /**
     * Batch register entities - only triggers ONE hydration at the end
     * Use this instead of registerEntity() in loops to avoid N× hydrations
     */
    async registerEntityBatch(
        entities: Array<{
            label: string;
            kind: EntityKind;
            noteId: string;
            options?: {
                subtype?: string;
                aliases?: string[];
                attributes?: Record<string, any>;
                source?: 'user' | 'extraction' | 'auto';
            };
        }>
    ): Promise<EntityRegistrationResult[]> {
        const results: EntityRegistrationResult[] = [];

        for (const { label, kind, noteId, options } of entities) {
            const existing = cozoGraphRegistry.findEntityByLabel(label);
            const isNew = !existing;

            const entity = cozoGraphRegistry.registerEntity(label, kind, noteId, {
                subtype: options?.subtype,
                aliases: options?.aliases,
                metadata: options?.attributes,
            });

            results.push({
                entity: this.toRegisteredEntity(entity),
                isNew,
                wasMerged: false,
            });
        }

        // Single hydration at end (not per-entity)
        if (entities.length > 0) {
            // const allEntities = this.getAllEntities();
            // const entityVersion = cozoGraphRegistry.getHotCache().entityVersion;
            // implicitScanner.hydrate(allEntities.map(this.toScannerEntity), entityVersion);
        }

        return results;
    }

    async deleteEntity(id: string): Promise<boolean> {
        const result = cozoGraphRegistry.deleteEntity(id);
        if (result) {
            // Schedule dictionary recompilation
            // const allEntities = this.getAllEntities();
            // scheduleRecompile(allEntities);
        }
        return result;
    }

    async updateEntity(id: string, updates: {
        label?: string;
        kind?: EntityKind;
        aliases?: string[];
        subtype?: string;
        attributes?: Record<string, any>;
    }): Promise<RegisteredEntity | null> {
        const existing = cozoGraphRegistry.getEntityById(id);
        if (!existing) return null;

        // Update in CozoDB
        const updated = await cozoGraphRegistry.updateEntity(id, {
            label: updates.label ?? existing.label,
            kind: updates.kind ?? existing.kind,
            aliases: updates.aliases ?? existing.aliases,
            subtype: updates.subtype ?? existing.subtype,
            attributes: updates.attributes ?? existing.attributes,
        });

        if (updated) {
            // Re-hydrate scanner with updated entity list
            // const allEntities = cozoGraphRegistry.getAllEntities();
            // const entityVersion = cozoGraphRegistry.getHotCache().entityVersion;
            // const scannerEntities = allEntities.map(e => this.toScannerEntity(this.toRegisteredEntity(e)));
            // implicitScanner.hydrate(scannerEntities, entityVersion);

            // Schedule dictionary recompilation
            // scheduleRecompile(this.getAllEntities());

            return this.toRegisteredEntity(updated);
        }
        return null;
    }

    async clearAll(): Promise<number> {
        const count = cozoGraphRegistry.getAllEntities().length;
        await cozoGraphRegistry.clear();
        // const entityVersion = cozoGraphRegistry.getHotCache().entityVersion;
        // implicitScanner.hydrate([], entityVersion);

        // Schedule dictionary recompilation (empty)
        // scheduleRecompile([]);

        return count;
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
        const provenance: RelationshipProvenance = {
            source: 'user',
            originId: options?.sourceNote || 'unknown',
            confidence: options?.confidence || 1.0,
            timestamp: new Date()
        };

        const rel = cozoGraphRegistry.addRelationship(sourceId, targetId, type, provenance);

        return {
            id: rel.id,
            sourceId: rel.sourceId,
            targetId: rel.targetId,
            type: rel.type,
            confidence: rel.confidence,
            sourceNote: options?.sourceNote
        };
    }

    async getEdges(
        entityId: string,
        direction: 'in' | 'out' | 'both' = 'both'
    ): Promise<Edge[]> {
        let relationships: CozoRelationship[];

        if (direction === 'in') {
            relationships = cozoGraphRegistry.getRelationshipsByTarget(entityId);
        } else if (direction === 'out') {
            relationships = cozoGraphRegistry.getRelationshipsBySource(entityId);
        } else {
            relationships = cozoGraphRegistry.getRelationshipsForEntity(entityId);
        }

        return relationships.map(r => ({
            id: r.id,
            sourceId: r.sourceId,
            targetId: r.targetId,
            type: r.type,
            confidence: r.confidence,
            sourceNote: r.provenance?.[0]?.originId
        }));
    }

    async deleteEdge(edgeId: string): Promise<boolean> {
        return cozoGraphRegistry.deleteRelationship(edgeId);
    }

    getAllEdges(): Edge[] {
        return cozoGraphRegistry.getAllRelationshipsSync().map(r => ({
            id: r.id,
            sourceId: r.sourceId,
            targetId: r.targetId,
            type: r.type,
            confidence: r.confidence,
            sourceNote: r.provenance?.[0]?.originId
        }));
    }

    // =========================================================================
    // Scope-Aware Queries
    // =========================================================================

    /**
     * Get entities filtered by scope (notes in scope).
     * Uses derived join approach - entities are filtered by their firstNote/mentionsByNote.
     * 
     * @param notesInScope - Array of note IDs that are within the active scope
     */
    getEntitiesByScope(notesInScope: string[]): RegisteredEntity[] {
        if (notesInScope.length === 0) {
            return [];
        }

        const noteSet = new Set(notesInScope);
        const all = cozoGraphRegistry.getAllEntities();

        // Filter: entity must have firstNote in scope OR have mentions in scoped notes
        return all
            .filter(e => {
                // Primary check: firstNote is in scope
                if (e.firstNote && noteSet.has(e.firstNote)) {
                    return true;
                }
                // Secondary check: any mention note is in scope
                if (e.mentionsByNote) {
                    for (const noteId of e.mentionsByNote.keys()) {
                        if (noteSet.has(noteId)) return true;
                    }
                }
                return false;
            })
            .map(e => this.toRegisteredEntity(e));
    }

    /**
     * Get edges filtered by scope.
     * Uses derived join approach - edges are filtered by their evidence (provenance) notes.
     * 
     * @param notesInScope - Array of note IDs that are within the active scope
     */
    getEdgesByScope(notesInScope: string[]): Edge[] {
        if (notesInScope.length === 0) {
            return [];
        }

        const noteSet = new Set(notesInScope);
        const all = cozoGraphRegistry.getAllRelationshipsSync();

        // Filter: edge must have provenance from a scoped note
        return all
            .filter(r => {
                // Check provenance origins
                if (r.provenance && r.provenance.length > 0) {
                    return r.provenance.some(p => noteSet.has(p.originId));
                }
                return false;
            })
            .map(r => ({
                id: r.id,
                sourceId: r.sourceId,
                targetId: r.targetId,
                type: r.type,
                confidence: r.confidence,
                sourceNote: r.provenance?.[0]?.originId
            }));
    }

    /**
     * Get entity count by scope (for badge display)
     */
    getEntityCountByScope(notesInScope: string[]): number {
        if (notesInScope.length === 0) return 0;
        return this.getEntitiesByScope(notesInScope).length;
    }

    // =========================================================================
    // Search & Misc
    // =========================================================================

    async searchEntities(query: string) {
        const entities = cozoGraphRegistry.searchEntities(query);
        const normalized = query.toLowerCase().trim();

        return entities.map(entity => {
            let matchType: 'exact' | 'alias' | 'fuzzy' = 'fuzzy';
            let score = 0.5;

            if (entity.normalized === normalized) {
                matchType = 'exact';
                score = 1.0;
            } else if (entity.aliases?.some(a => a.toLowerCase() === normalized)) {
                matchType = 'alias';
                score = 0.9;
            } else if (entity.normalized.includes(normalized)) {
                matchType = 'fuzzy';
                score = 0.7;
            }

            return {
                entity: this.toRegisteredEntity(entity),
                matchType,
                score,
            };
        }).sort((a, b) => b.score - a.score);
    }

    async addAlias(entityId: string, alias: string): Promise<boolean> {
        return cozoGraphRegistry.addAlias(entityId, alias);
    }

    async getStats() {
        const globalStats = cozoGraphRegistry.getGlobalStats();
        const allEntities = cozoGraphRegistry.getAllEntities();

        let totalMentions = 0;
        let totalAliases = 0;

        for (const entity of allEntities) {
            totalMentions += entity.totalMentions || 0;
            totalAliases += entity.aliases?.length || 0;
        }

        return {
            totalEntities: globalStats.totalEntities,
            byKind: globalStats.entitiesByKind,
            totalMentions,
            totalAliases,
            totalEdges: globalStats.totalRelationships
        };
    }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const smartGraphRegistry = new SmartGraphRegistryFacade();

// Legacy alias for backwards compatibility
export { smartGraphRegistry as entityRegistry };
