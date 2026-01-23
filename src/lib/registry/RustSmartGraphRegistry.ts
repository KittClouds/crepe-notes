// src/lib/registry/RustSmartGraphRegistry.ts
// Entity Registry - Rust CozoDB Backend
// Phase 2: Uses kittCore WASM for all entity/relationship operations

import type { EntityKind } from '@/lib/types/entityTypes';
import { kittCore } from '@/lib/kittcore';

// =============================================================================
// Types - Same interface as SmartGraphRegistryFacade
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

// Types from Rust WASM
interface RustEntityRecord {
    id: string;
    label: string;
    kind: string;
    props: Record<string, any>;
}

interface RustRelationshipRecord {
    id: string;
    source_id: string;
    target_id: string;
    rel_type: string;
    confidence: number;
    bidirectional: boolean;
}

// =============================================================================
// RustSmartGraphRegistry - Uses Rust CozoDB via kittCore WASM
// =============================================================================

export class RustSmartGraphRegistry {
    private initialized = false;
    private entityCache = new Map<string, RegisteredEntity>();
    private labelIndex = new Map<string, string>(); // normalized label -> entity ID
    private suppressEvents = false; // Suppress events during batch operations

    // =========================================================================
    // Initialization
    // =========================================================================

    async init(): Promise<void> {
        if (this.initialized) return;

        try {
            // kittCore.init() already called by app orchestrator
            await this.warmCache();
            this.initialized = true;
            console.log(`[RustSmartGraphRegistry] Initialized. Loaded ${this.entityCache.size} entities.`);
        } catch (err) {
            console.error('[RustSmartGraphRegistry] Failed to initialize:', err);
            throw err;
        }
    }

    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Public method to refresh cache from Rust CozoDB.
     * Call this after entities are loaded from Alex OPFS.
     */
    async refresh(): Promise<void> {
        await this.warmCache();
        console.log(`[RustSmartGraphRegistry] Cache refreshed: ${this.entityCache.size} entities`);
    }

    /**
     * Warm the local cache from Rust CozoDB
     */
    private async warmCache(): Promise<void> {
        console.log('[RustSmartGraphRegistry:TRACE] warmCache() called, fetching from Rust CozoDB...');
        const entities = await kittCore.registryGetAllEntities() as RustEntityRecord[];
        console.log(`[RustSmartGraphRegistry:TRACE] registryGetAllEntities returned ${entities?.length ?? 0} entities`);

        // Log first 5 entities for debugging
        if (entities && entities.length > 0) {
            console.log('[RustSmartGraphRegistry:TRACE] Sample entities:', entities.slice(0, 5).map(e => ({
                id: e.id,
                label: e.label,
                kind: e.kind,
                hasProps: !!e.props
            })));
        } else {
            console.warn('[RustSmartGraphRegistry:TRACE] NO ENTITIES returned from Rust CozoDB!');
        }

        this.entityCache.clear();
        this.labelIndex.clear();

        for (const e of entities) {
            const registered = this.rustToRegisteredEntity(e);
            this.entityCache.set(e.id, registered);
            this.labelIndex.set(e.label.toLowerCase(), e.id);
        }
        console.log(`[RustSmartGraphRegistry:TRACE] Cached ${this.entityCache.size} entities, ${this.labelIndex.size} labels`);
    }


    private rustToRegisteredEntity(e: RustEntityRecord): RegisteredEntity {
        const props = e.props || {};
        return {
            id: e.id,
            label: e.label,
            aliases: props.aliases || [],
            kind: e.kind as EntityKind,
            subtype: props.subtype,
            firstNote: props.firstNote || '',
            mentionsByNote: new Map(Object.entries(props.mentionsByNote || {})),
            totalMentions: props.totalMentions || 0,
            lastSeenDate: props.lastSeenDate ? new Date(props.lastSeenDate) : new Date(),
            createdAt: props.createdAt ? new Date(props.createdAt) : new Date(),
            createdBy: props.createdBy || 'user',
            attributes: props.attributes || {},
            registeredAt: props.createdAt || Date.now(),
        };
    }

    // =========================================================================
    // ENTITY OPERATIONS
    // =========================================================================

    isRegisteredEntity(label: string): boolean {
        return this.labelIndex.has(label.toLowerCase());
    }

    getEntityById(id: string): RegisteredEntity | null {
        return this.entityCache.get(id) || null;
    }

    findEntityByLabel(label: string): RegisteredEntity | null {
        const id = this.labelIndex.get(label.toLowerCase());
        return id ? this.entityCache.get(id) || null : null;
    }

    getAllEntities(): RegisteredEntity[] {
        return Array.from(this.entityCache.values());
    }

    getEntitiesByKind(kind: EntityKind): RegisteredEntity[] {
        return this.getAllEntities().filter(e => e.kind === kind);
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
        const existing = this.findEntityByLabel(label);
        const isNew = !existing;

        const id = existing?.id || this.generateEntityId(label, kind);
        const now = Date.now();

        const props = {
            aliases: options?.aliases || existing?.aliases || [],
            subtype: options?.subtype || existing?.subtype,
            firstNote: existing?.firstNote || noteId,
            mentionsByNote: existing ? Object.fromEntries(existing.mentionsByNote) : { [noteId]: 1 },
            totalMentions: (existing?.totalMentions || 0) + (isNew ? 1 : 0),
            lastSeenDate: now,
            createdAt: existing?.createdAt?.getTime() || now,
            createdBy: existing?.createdBy || options?.source || 'user',
            attributes: { ...existing?.attributes, ...options?.attributes },
        };

        // Upsert to Rust CozoDB
        const success = await kittCore.registryUpsertEntity(id, label, kind, props);
        if (!success) {
            throw new Error(`Failed to register entity: ${label}`);
        }

        // Update local cache
        const entity: RegisteredEntity = {
            id,
            label,
            aliases: props.aliases,
            kind,
            subtype: props.subtype,
            firstNote: props.firstNote,
            mentionsByNote: new Map(Object.entries(props.mentionsByNote)),
            totalMentions: props.totalMentions,
            lastSeenDate: new Date(props.lastSeenDate),
            createdAt: new Date(props.createdAt),
            createdBy: props.createdBy as 'user' | 'extraction' | 'auto',
            attributes: props.attributes,
            registeredAt: props.createdAt,
        };

        this.entityCache.set(id, entity);
        this.labelIndex.set(label.toLowerCase(), id);

        // Dispatch event to trigger highlight re-scan (unless in batch mode)
        if (!this.suppressEvents && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('entities-changed'));
        }

        return { entity, isNew, wasMerged: false };
    }

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

        // Suppress events during batch to avoid spamming
        this.suppressEvents = true;
        try {
            for (const { label, kind, noteId, options } of entities) {
                const result = await this.registerEntity(label, kind, noteId, options);
                results.push(result);
            }
        } finally {
            this.suppressEvents = false;
        }

        // Dispatch single event at end of batch
        if (results.length > 0 && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('entities-changed'));
        }

        return results;
    }

    async deleteEntity(id: string): Promise<boolean> {
        const success = await kittCore.registryDeleteEntity(id);
        if (success) {
            const entity = this.entityCache.get(id);
            if (entity) {
                this.labelIndex.delete(entity.label.toLowerCase());
            }
            this.entityCache.delete(id);
        }
        return success;
    }

    async updateEntity(id: string, updates: {
        label?: string;
        kind?: EntityKind;
        aliases?: string[];
        subtype?: string;
        attributes?: Record<string, any>;
    }): Promise<RegisteredEntity | null> {
        const existing = this.entityCache.get(id);
        if (!existing) return null;

        const newLabel = updates.label ?? existing.label;
        const newKind = updates.kind ?? existing.kind;

        const props = {
            aliases: updates.aliases ?? existing.aliases,
            subtype: updates.subtype ?? existing.subtype,
            firstNote: existing.firstNote,
            mentionsByNote: Object.fromEntries(existing.mentionsByNote),
            totalMentions: existing.totalMentions,
            lastSeenDate: Date.now(),
            createdAt: existing.createdAt.getTime(),
            createdBy: existing.createdBy,
            attributes: { ...existing.attributes, ...updates.attributes },
        };

        const success = await kittCore.registryUpsertEntity(id, newLabel, newKind, props);
        if (!success) return null;

        // Update cache
        const updated: RegisteredEntity = {
            ...existing,
            label: newLabel,
            kind: newKind,
            aliases: props.aliases,
            subtype: props.subtype,
            attributes: props.attributes,
            lastSeenDate: new Date(props.lastSeenDate),
        };

        // Update label index if label changed
        if (updates.label && updates.label !== existing.label) {
            this.labelIndex.delete(existing.label.toLowerCase());
            this.labelIndex.set(newLabel.toLowerCase(), id);
        }

        this.entityCache.set(id, updated);
        return updated;
    }

    /**
     * V2 Entity-Only Flush (GENIUS SYSTEM)
     * 
     * Clears all entity-related data while PRESERVING content:
     * - Clears: nodes, relationships, entity_*, discovery_candidates, clusters, vectors
     * - Preserves: folders, folder_hierarchy, network_*, calendar_*
     * - Also clears: Alex OPFS, in-memory scanners
     * 
     * @returns Number of entity rows cleared
     */
    async clearAll(): Promise<number> {
        console.log('[RustSmartGraphRegistry] Starting V2 entity-only flush...');

        // Use the new V2 genius flush API
        const result = await kittCore.registryClearAllEntities();

        if (!result.success) {
            console.error('[RustSmartGraphRegistry] Entity flush failed');
            return 0;
        }

        // Clear local caches
        this.entityCache.clear();
        this.labelIndex.clear();

        console.log(`[RustSmartGraphRegistry] ✅ V2 flush complete: ${result.clearedCount} rows cleared (content preserved)`);
        return result.clearedCount;
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
        const id = `${sourceId}:${targetId}:${type}`;
        const confidence = options?.confidence ?? 1.0;

        const success = await kittCore.registryUpsertRelationship(
            id,
            sourceId,
            targetId,
            type,
            confidence,
            false
        );

        if (!success) {
            throw new Error(`Failed to create edge: ${id}`);
        }

        return {
            id,
            sourceId,
            targetId,
            type,
            confidence,
            sourceNote: options?.sourceNote
        };
    }

    async getEdges(
        entityId: string,
        _direction: 'in' | 'out' | 'both' = 'both'
    ): Promise<Edge[]> {
        const relationships = await kittCore.registryGetRelationshipsForEntity(entityId) as RustRelationshipRecord[];

        return relationships.map(r => ({
            id: r.id,
            sourceId: r.source_id,
            targetId: r.target_id,
            type: r.rel_type,
            confidence: r.confidence,
        }));
    }

    async deleteEdge(edgeId: string): Promise<boolean> {
        return kittCore.registryDeleteRelationship(edgeId);
    }

    async getAllEdges(): Promise<Edge[]> {
        const relationships = await kittCore.registryGetAllRelationships() as RustRelationshipRecord[];

        return relationships.map(r => ({
            id: r.id,
            sourceId: r.source_id,
            targetId: r.target_id,
            type: r.rel_type,
            confidence: r.confidence,
        }));
    }

    // =========================================================================
    // Scope-Aware Queries
    // =========================================================================

    getEntitiesByScope(notesInScope: string[]): RegisteredEntity[] {
        if (notesInScope.length === 0) return [];

        const noteSet = new Set(notesInScope);
        return this.getAllEntities().filter(e => {
            if (e.firstNote && noteSet.has(e.firstNote)) return true;
            for (const noteId of e.mentionsByNote.keys()) {
                if (noteSet.has(noteId)) return true;
            }
            return false;
        });
    }

    async getEdgesByScope(_notesInScope: string[]): Promise<Edge[]> {
        // For now, return all edges - scope filtering would require provenance
        return this.getAllEdges();
    }

    getEntityCountByScope(notesInScope: string[]): number {
        return this.getEntitiesByScope(notesInScope).length;
    }

    // =========================================================================
    // Search & Misc
    // =========================================================================

    async searchEntities(query: string) {
        const normalized = query.toLowerCase().trim();
        const all = this.getAllEntities();

        return all
            .filter(e =>
                e.label.toLowerCase().includes(normalized) ||
                e.aliases.some(a => a.toLowerCase().includes(normalized))
            )
            .map(entity => {
                let matchType: 'exact' | 'alias' | 'fuzzy' = 'fuzzy';
                let score = 0.5;

                if (entity.label.toLowerCase() === normalized) {
                    matchType = 'exact';
                    score = 1.0;
                } else if (entity.aliases.some(a => a.toLowerCase() === normalized)) {
                    matchType = 'alias';
                    score = 0.9;
                } else if (entity.label.toLowerCase().includes(normalized)) {
                    matchType = 'fuzzy';
                    score = 0.7;
                }

                return { entity, matchType, score };
            })
            .sort((a, b) => b.score - a.score);
    }

    async addAlias(entityId: string, alias: string): Promise<boolean> {
        const entity = this.entityCache.get(entityId);
        if (!entity) return false;

        const newAliases = [...entity.aliases, alias];
        const result = await this.updateEntity(entityId, { aliases: newAliases });
        return result !== null;
    }

    async getStats() {
        const stats = await kittCore.registryGetStats();
        const allEntities = this.getAllEntities();

        let totalMentions = 0;
        let totalAliases = 0;
        const byKind: Record<string, number> = {};

        for (const entity of allEntities) {
            totalMentions += entity.totalMentions || 0;
            totalAliases += entity.aliases?.length || 0;
            byKind[entity.kind] = (byKind[entity.kind] || 0) + 1;
        }

        return {
            totalEntities: stats.entity_count,
            byKind,
            totalMentions,
            totalAliases,
            totalEdges: stats.relationship_count
        };
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private generateEntityId(label: string, kind: EntityKind): string {
        const normalized = label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        return `${kind.toLowerCase()}_${normalized}`;
    }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const rustSmartGraphRegistry = new RustSmartGraphRegistry();
