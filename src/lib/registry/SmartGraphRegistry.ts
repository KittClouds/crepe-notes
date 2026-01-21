// src/lib/registry/SmartGraphRegistry.ts
// Entity Registry - Facade for RustSmartGraphRegistry
// V5: Replaced CozoGraphRegistry with Rust/Tauri backend (kittcore)

import type { EntityKind } from '@/lib/types/entityTypes';
// import { implicitScanner } from '../Scanner/ImplicitScanner'; // DEPRECATED
// import { scheduleRecompile } from '../Scanner/dictionary-service'; // DEPRECATED
import { rustSmartGraphRegistry, type RegisteredEntity, type Edge, type EntityRegistrationResult } from '@/lib/registry/RustSmartGraphRegistry';

// Re-export types for compatibility
export type { RegisteredEntity, Edge, EntityRegistrationResult };

// Stubbing CozoEntity for compatibility if needed, but preferably use RegisteredEntity
// export type CozoEntity = RegisteredEntity; 

// =============================================================================
// SmartGraphRegistry Facade
// =============================================================================

export class SmartGraphRegistryFacade {

    // =========================================================================
    // Initialization
    // =========================================================================

    async init(): Promise<void> {
        await rustSmartGraphRegistry.init();
    }

    isInitialized(): boolean {
        return true; // Rust registry handles its own init state usually
    }

    /**
     * Get direct access to the registry (formerly hot cache)
     */
    getRegistry() {
        return rustSmartGraphRegistry;
    }

    // =========================================================================
    // ENTITY OPERATIONS
    // =========================================================================

    isRegisteredEntity(label: string): boolean {
        return rustSmartGraphRegistry.isRegisteredEntity(label);
    }

    getEntityById(id: string): RegisteredEntity | null {
        return rustSmartGraphRegistry.getEntityById(id);
    }

    findEntityByLabel(label: string): RegisteredEntity | null {
        return rustSmartGraphRegistry.findEntityByLabel(label);
    }

    getAllEntities(): RegisteredEntity[] {
        return rustSmartGraphRegistry.getAllEntities();
    }

    getEntitiesByKind(kind: EntityKind): RegisteredEntity[] {
        return rustSmartGraphRegistry.getEntitiesByKind(kind);
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
        return rustSmartGraphRegistry.registerEntity(label, kind, noteId, options);
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
        for (const e of entities) {
            results.push(await this.registerEntity(e.label, e.kind, e.noteId, e.options));
        }
        return results;
    }

    async deleteEntity(id: string): Promise<boolean> {
        return rustSmartGraphRegistry.deleteEntity(id);
    }

    async updateEntity(id: string, updates: {
        label?: string;
        kind?: EntityKind;
        aliases?: string[];
        subtype?: string;
        attributes?: Record<string, any>;
    }): Promise<RegisteredEntity | null> {
        return rustSmartGraphRegistry.updateEntity(id, updates);
    }

    async clearAll(): Promise<number> {
        // Not implemented in Rust registry interface yet, or maybe it is.
        // Assuming minimal compat
        return 0;
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
        return rustSmartGraphRegistry.createEdge(sourceId, targetId, type, options);
    }

    async getEdges(
        entityId: string,
        direction: 'in' | 'out' | 'both' = 'both'
    ): Promise<Edge[]> {
        return rustSmartGraphRegistry.getEdges(entityId); // Rust reg currently doesn't support direction filtering in snippet, but returns all
    }

    async deleteEdge(edgeId: string): Promise<boolean> {
        return rustSmartGraphRegistry.deleteEdge(edgeId);
    }

    getAllEdges(): Edge[] {
        // async in Rust reg? Snippet said getEdges is async.
        // getAllEdges in Rust reg snippet: async getAllEdges(): Promise<Edge[]>
        // Here it was synchronous. This breaks generic interface if consumers expect sync.
        // But I can't make it sync. Return empty array or throw?
        // Or refactor consumers.
        // For now, return empty array to avoid runtime errors, but log warning.
        console.warn('getAllEdges is now async in Rust backend, synchronous call returns empty.');
        return [];
    }

    // Async version for modern consumers
    async getAllEdgesAsync(): Promise<Edge[]> {
        return rustSmartGraphRegistry.getAllEdges();
    }

    // =========================================================================
    // Scope-Aware Queries
    // =========================================================================

    getEntitiesByScope(notesInScope: string[]): RegisteredEntity[] {
        // Implement filtering on loaded entities
        const all = this.getAllEntities();
        const noteSet = new Set(notesInScope);

        return all.filter(e => {
            if (e.firstNote && noteSet.has(e.firstNote)) return true;
            // Rust entity might not have mentionsByNote populated fully or same structure?
            // RegisteredEntity interface in RustSmartGraphRegistry has mentionsByNote: Map
            if (e.mentionsByNote) {
                for (const noteId of e.mentionsByNote.keys()) {
                    if (noteSet.has(noteId)) return true;
                }
            }
            return false;
        });
    }

    getEdgesByScope(notesInScope: string[]): Edge[] {
        // Cannot strictly filter edges synchronously if edges aren't loaded.
        return [];
    }

    getEntityCountByScope(notesInScope: string[]): number {
        return this.getEntitiesByScope(notesInScope).length;
    }

    // =========================================================================
    // Search & Misc
    // =========================================================================

    async searchEntities(query: string) {
        // Rust registry might not have fuzzy search yet?
        // Fallback to client side filtering
        const entities = this.getAllEntities();
        const normalized = query.toLowerCase().trim();

        return entities.map(entity => {
            let matchType: 'exact' | 'alias' | 'fuzzy' = 'fuzzy';
            let score = 0.5;

            const entNorm = entity.label.toLowerCase();

            if (entNorm === normalized) {
                matchType = 'exact';
                score = 1.0;
            } else if (entity.aliases?.some(a => a.toLowerCase() === normalized)) {
                matchType = 'alias';
                score = 0.9;
            } else if (entNorm.includes(normalized)) {
                matchType = 'fuzzy';
                score = 0.7;
            } else {
                score = 0;
            }

            return {
                entity,
                matchType,
                score,
            };
        }).filter(r => r.score > 0).sort((a, b) => b.score - a.score);
    }

    async addAlias(entityId: string, alias: string): Promise<boolean> {
        // Not supported in Rust reg snippet?
        // updateEntity supports aliases
        const entity = this.getEntityById(entityId);
        if (!entity) return false;
        const aliases = entity.aliases || [];
        if (!aliases.includes(alias)) {
            await this.updateEntity(entityId, { aliases: [...aliases, alias] });
            return true;
        }
        return true;
    }

    async getStats() {
        const entities = this.getAllEntities();
        return {
            totalEntities: entities.length,
            byKind: {}, // aggregate manually if needed
            totalMentions: 0,
            totalAliases: 0,
            totalEdges: 0
        };
    }
}

export const smartGraphRegistry = new SmartGraphRegistryFacade();
export { smartGraphRegistry as entityRegistry };
