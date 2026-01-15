// src/lib/registry/SmartGraphRegistry.ts
// Entity Registry - Local cache facade for entity management
// V2: Simplified version without Tauri IPC - uses localStorage until Rust backend is migrated

import type { EntityKind } from '@/lib/types/entityTypes';

// =============================================================================
// Types
// =============================================================================

export interface EntityDefinition {
    id: string;
    label: string;
    kind: string;
    aliases: string[];
}

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
// SmartGraphRegistry
// =============================================================================

const STORAGE_KEY = 'graphaite_entity_registry';
const EDGES_KEY = 'graphaite_edge_registry';

export class SmartGraphRegistry {
    private initialized = false;
    private initPromise: Promise<void> | null = null;

    // Local cache
    private entityCache: Map<string, RegisteredEntity> = new Map();
    private labelIndex: Map<string, string> = new Map(); // normalized label → id
    private aliasIndex: Map<string, string> = new Map(); // normalized alias → id
    private edgeCache: Map<string, Edge> = new Map();

    // =========================================================================
    // Initialization
    // =========================================================================

    async init(): Promise<void> {
        if (this.initialized) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            try {
                this.loadFromStorage();
                this.initialized = true;
                console.log(`[SmartGraphRegistry] Initialized with ${this.entityCache.size} entities, ${this.edgeCache.size} edges`);
            } catch (err) {
                this.initPromise = null;
                throw err;
            }
        })();

        return this.initPromise;
    }

    isInitialized(): boolean {
        return this.initialized;
    }

    // =========================================================================
    // Persistence (localStorage for now, Tauri IPC later)
    // =========================================================================

    private loadFromStorage(): void {
        try {
            // Load entities
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const entities = JSON.parse(raw) as EntityDefinition[];
                for (const e of entities) {
                    const entity = this.definitionToEntity(e);
                    this.entityCache.set(e.id, entity);
                    this.labelIndex.set(e.label.toLowerCase(), e.id);
                    for (const alias of e.aliases) {
                        this.aliasIndex.set(alias.toLowerCase(), e.id);
                    }
                }
            }

            // Load edges
            const edgesRaw = localStorage.getItem(EDGES_KEY);
            if (edgesRaw) {
                const edges = JSON.parse(edgesRaw) as Edge[];
                for (const edge of edges) {
                    this.edgeCache.set(edge.id, edge);
                }
            }
        } catch (err) {
            console.error('[SmartGraphRegistry] Failed to load from storage:', err);
        }
    }

    private saveToStorage(): void {
        try {
            const entities: EntityDefinition[] = Array.from(this.entityCache.values()).map(e => ({
                id: e.id,
                label: e.label,
                kind: e.kind,
                aliases: e.aliases,
            }));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(entities));

            const edges = Array.from(this.edgeCache.values());
            localStorage.setItem(EDGES_KEY, JSON.stringify(edges));
        } catch (err) {
            console.error('[SmartGraphRegistry] Failed to save to storage:', err);
        }
    }

    private definitionToEntity(e: EntityDefinition): RegisteredEntity {
        return {
            id: e.id,
            label: e.label,
            aliases: e.aliases,
            kind: e.kind as EntityKind,
            subtype: undefined,
            firstNote: '',
            mentionsByNote: new Map(),
            totalMentions: 0,
            lastSeenDate: new Date(),
            createdAt: new Date(),
            createdBy: 'auto',
            attributes: {},
        };
    }

    // =========================================================================
    // Cache Management
    // =========================================================================

    private addToCache(entity: RegisteredEntity): void {
        this.entityCache.set(entity.id, entity);
        this.labelIndex.set(entity.label.toLowerCase(), entity.id);
        for (const alias of entity.aliases) {
            this.aliasIndex.set(alias.toLowerCase(), entity.id);
        }
        this.saveToStorage();
    }

    private removeFromCache(id: string): void {
        const entity = this.entityCache.get(id);
        if (entity) {
            this.labelIndex.delete(entity.label.toLowerCase());
            for (const alias of entity.aliases) {
                this.aliasIndex.delete(alias.toLowerCase());
            }
            this.entityCache.delete(id);
            this.saveToStorage();
        }
    }

    // =========================================================================
    // SYNC READS (from cache - fast!)
    // =========================================================================

    isRegisteredEntity(label: string): boolean {
        if (!this.initialized) return false;
        const normalized = label.toLowerCase();
        return this.labelIndex.has(normalized) || this.aliasIndex.has(normalized);
    }

    getEntityById(id: string): RegisteredEntity | null {
        return this.entityCache.get(id) || null;
    }

    findEntityByLabel(label: string): RegisteredEntity | null {
        if (!this.initialized) return null;
        const normalized = label.toLowerCase();

        const idByLabel = this.labelIndex.get(normalized);
        if (idByLabel) return this.entityCache.get(idByLabel) || null;

        const idByAlias = this.aliasIndex.get(normalized);
        if (idByAlias) return this.entityCache.get(idByAlias) || null;

        return null;
    }

    getAllEntities(): RegisteredEntity[] {
        return Array.from(this.entityCache.values());
    }

    getEntitiesByKind(kind: EntityKind): RegisteredEntity[] {
        return Array.from(this.entityCache.values()).filter(e => e.kind === kind);
    }

    // =========================================================================
    // ENTITY WRITES
    // =========================================================================

    /**
     * Register an entity - auto-detects on first parse
     */
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
        await this.ensureInit();

        // Check if already exists
        const existing = this.findEntityByLabel(label);
        if (existing) {
            existing.totalMentions++;
            existing.lastSeenDate = new Date();
            const noteCount = existing.mentionsByNote.get(noteId) || 0;
            existing.mentionsByNote.set(noteId, noteCount + 1);
            this.saveToStorage();
            return { entity: existing, isNew: false, wasMerged: false };
        }

        // Create new entity
        const entity: RegisteredEntity = {
            id: crypto.randomUUID(),
            label,
            aliases: options?.aliases || [],
            kind,
            subtype: options?.subtype,
            firstNote: noteId,
            mentionsByNote: new Map([[noteId, 1]]),
            totalMentions: 1,
            lastSeenDate: new Date(),
            createdAt: new Date(),
            createdBy: options?.source || 'auto',
            attributes: options?.attributes,
        };

        this.addToCache(entity);
        console.log(`[SmartGraphRegistry] Registered new entity: ${label} (${kind})`);

        return { entity, isNew: true, wasMerged: false };
    }

    async deleteEntity(id: string): Promise<boolean> {
        await this.ensureInit();
        this.removeFromCache(id);
        // Also delete related edges
        for (const [edgeId, edge] of this.edgeCache) {
            if (edge.sourceId === id || edge.targetId === id) {
                this.edgeCache.delete(edgeId);
            }
        }
        this.saveToStorage();
        return true;
    }

    async clearAll(): Promise<number> {
        await this.ensureInit();
        const count = this.entityCache.size;
        this.entityCache.clear();
        this.labelIndex.clear();
        this.aliasIndex.clear();
        this.edgeCache.clear();
        this.saveToStorage();
        console.log(`[SmartGraphRegistry] Cleared ${count} entities`);
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
        await this.ensureInit();

        const edge: Edge = {
            id: crypto.randomUUID(),
            sourceId,
            targetId,
            type,
            confidence: options?.confidence ?? 1.0,
            sourceNote: options?.sourceNote,
        };

        this.edgeCache.set(edge.id, edge);
        this.saveToStorage();
        return edge;
    }

    async getEdges(
        entityId: string,
        direction: 'in' | 'out' | 'both' = 'both'
    ): Promise<Edge[]> {
        await this.ensureInit();
        return Array.from(this.edgeCache.values()).filter(edge => {
            if (direction === 'out') return edge.sourceId === entityId;
            if (direction === 'in') return edge.targetId === entityId;
            return edge.sourceId === entityId || edge.targetId === entityId;
        });
    }

    async deleteEdge(edgeId: string): Promise<boolean> {
        await this.ensureInit();
        this.edgeCache.delete(edgeId);
        this.saveToStorage();
        return true;
    }

    /**
     * Get all edges in the graph (for visualization)
     */
    getAllEdges(): Edge[] {
        return Array.from(this.edgeCache.values());
    }

    // =========================================================================
    // Search
    // =========================================================================

    async searchEntities(query: string): Promise<Array<{
        entity: RegisteredEntity;
        matchType: 'exact' | 'alias' | 'fuzzy';
        score: number;
    }>> {
        const normalized = query.toLowerCase();
        const results: Array<{ entity: RegisteredEntity; matchType: 'exact' | 'alias' | 'fuzzy'; score: number }> = [];

        for (const entity of this.entityCache.values()) {
            let matchType: 'exact' | 'alias' | 'fuzzy' = 'fuzzy';
            let score = 0;

            if (entity.label.toLowerCase() === normalized) {
                matchType = 'exact';
                score = 1.0;
            } else if (entity.aliases.some(a => a.toLowerCase() === normalized)) {
                matchType = 'alias';
                score = 0.9;
            } else if (entity.label.toLowerCase().includes(normalized)) {
                matchType = 'fuzzy';
                score = 0.7;
            } else {
                continue;
            }

            results.push({ entity, matchType, score });
        }

        return results.sort((a, b) => b.score - a.score);
    }

    async addAlias(entityId: string, alias: string): Promise<boolean> {
        const entity = this.entityCache.get(entityId);
        if (entity) {
            entity.aliases.push(alias);
            this.aliasIndex.set(alias.toLowerCase(), entityId);
            this.saveToStorage();
            return true;
        }
        return false;
    }

    async getStats(): Promise<{
        totalEntities: number;
        byKind: Record<string, number>;
        totalMentions: number;
        totalAliases: number;
        totalEdges: number;
    }> {
        const byKind: Record<string, number> = {};
        let totalMentions = 0;
        let totalAliases = 0;

        for (const entity of this.entityCache.values()) {
            byKind[entity.kind] = (byKind[entity.kind] || 0) + 1;
            totalMentions += entity.totalMentions;
            totalAliases += entity.aliases.length;
        }

        return {
            totalEntities: this.entityCache.size,
            byKind,
            totalMentions,
            totalAliases,
            totalEdges: this.edgeCache.size,
        };
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private async ensureInit(): Promise<void> {
        if (!this.initialized) {
            await this.init();
        }
    }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const smartGraphRegistry = new SmartGraphRegistry();
export { smartGraphRegistry as entityRegistry };
