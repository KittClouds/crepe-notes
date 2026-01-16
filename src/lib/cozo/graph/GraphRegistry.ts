/**
 * GraphRegistry - Single source of truth for entities and relationships
 * 
 * Built directly on CozoDB (WASM/In-Memory)
 * 
 * NOTE: Most methods are SYNCHRONOUS because CozoDB WASM is synchronous.
 * Async is only needed for initialization or heavy I/O.
 */

import { cozoDb } from '../db';
import type { EntityKind } from '@/lib/types/entityTypes';
import { FOLDER_HIERARCHY_SCHEMA } from '../schema/layer2-folder-hierarchy';
import { NETWORK_INSTANCE_SCHEMA } from '../schema/layer2-network-instance';
import { NETWORK_MEMBERSHIP_SCHEMA } from '../schema/layer2-network-membership';
import { NETWORK_RELATIONSHIP_SCHEMA } from '../schema/layer2-network-relationship';

// ==================== TYPES ====================

export interface CozoEntity {
    id: string;
    label: string;
    normalized: string;
    kind: EntityKind;
    subtype?: string;
    firstNote: string;
    createdAt: Date;
    createdBy: 'user' | 'extraction' | 'auto';

    // Computed fields
    aliases?: string[];
    mentionsByNote?: Map<string, number>;
    totalMentions?: number;
    lastSeenDate?: Date;
    metadata?: Record<string, any>;
    attributes?: Record<string, any>;
}

export interface CozoRelationship {
    id: string;
    sourceId: string;
    targetId: string;
    type: string;
    inverseType?: string;
    bidirectional: boolean;
    confidence: number;
    namespace?: string;
    createdAt: Date;
    updatedAt: Date;

    // Computed fields
    provenance?: RelationshipProvenance[];
    attributes?: Record<string, any>;
}

export interface RelationshipProvenance {
    source: 'user' | 'extraction' | 'llm' | 'pattern' | 'folder' | 'hierarchy' |
    'MANUAL' | 'NER_EXTRACTION' | 'LLM_EXTRACTION' | 'FOLDER_STRUCTURE' |
    'CO_OCCURRENCE' | 'IMPORT' | 'TIMELINE' | 'NETWORK' | string;
    originId: string;
    confidence: number;
    timestamp: Date;
    context?: string;
}

export interface EntityStats {
    totalMentions: number;
    noteCount: number;
    relationshipCount: number;
    aliases: string[];
}

export interface GlobalStats {
    totalEntities: number;
    totalRelationships: number;
    totalProvenance: number;
    entitiesByKind: Record<string, number>;
    relationshipsByType: Record<string, number>;
}

// ==================== GRAPH REGISTRY ====================

export class GraphRegistry {
    private initialized = false;

    private entityCache = new Map<string, CozoEntity>();
    private relationshipCache = new Map<string, CozoRelationship>();
    private cacheMaxSize = 500;

    private onEntityDeleteCallback?: (entityId: string) => void;
    private onEntityMergeCallback?: (oldId: string, newId: string) => void;

    async init(): Promise<void> {
        if (this.initialized) return;

        console.log('[GraphRegistry] Initializing...');

        await cozoDb.init();
        this.createSchema();

        this.initialized = true;
        console.log('[GraphRegistry] ✅ Initialized');
    }

    private createSchema(): void {
        console.log('[GraphRegistry] Creating schemas...');

        const basicSchemas = [
            { name: 'entities', script: `:create entities { id: String => label: String, normalized: String, kind: String, subtype: String?, first_note: String, created_at: Float, created_by: String }` },
            { name: 'entity_aliases', script: `:create entity_aliases { entity_id: String, normalized: String => alias: String }` },
            { name: 'entity_mentions', script: `:create entity_mentions { entity_id: String, note_id: String => mention_count: Int, last_seen: Float }` },
            { name: 'entity_metadata', script: `:create entity_metadata { entity_id: String, key: String => value: String }` },
            { name: 'relationships', script: `:create relationships { id: String => source_id: String, target_id: String, type: String, inverse_type: String?, bidirectional: Bool, confidence: Float, namespace: String?, created_at: Float, updated_at: Float }` },
            { name: 'relationship_provenance', script: `:create relationship_provenance { relationship_id: String, source: String, origin_id: String => confidence: Float, timestamp: Float, context: String? }` },
            { name: 'relationship_attributes', script: `:create relationship_attributes { relationship_id: String, key: String => value: String }` },
        ];

        // Combine basic schemas with Layer 2 schemas
        const allSchemas = [
            ...basicSchemas,
            { name: 'folder_hierarchy', script: FOLDER_HIERARCHY_SCHEMA.trim() },
            { name: 'network_instance', script: NETWORK_INSTANCE_SCHEMA.trim() },
            { name: 'network_membership', script: NETWORK_MEMBERSHIP_SCHEMA.trim() },
            { name: 'network_relationship', script: NETWORK_RELATIONSHIP_SCHEMA.trim() },
        ];

        for (const { name, script } of allSchemas) {
            try {
                const resultStr = cozoDb.run(script);
                const result = JSON.parse(resultStr);
                if (result.ok === false) {
                    const msg = result.message || result.display || 'Unknown error';
                    if (!msg.includes('already exists')) {
                        console.error(`[GraphRegistry] Schema ${name} failed:`, msg);
                    }
                } else {
                    console.log(`[GraphRegistry] Schema ${name} created`);
                }
            } catch (err) {
                const errMsg = String(err);
                if (!errMsg.includes('already exists')) {
                    console.error(`[GraphRegistry] Schema creation failed for ${name}:`, err);
                }
            }
        }

        console.log('[GraphRegistry] Schema creation complete');
    }

    // ==================== ENTITY OPERATIONS ====================

    registerEntity(
        label: string,
        kind: EntityKind,
        noteId: string,
        options?: {
            subtype?: string;
            aliases?: string[];
            metadata?: Record<string, any>;
            attributes?: Record<string, any>;
        }
    ): CozoEntity {
        const normalized = this.normalize(label);
        const existing = this.findEntityByLabel(label);

        if (existing) {
            this.incrementMention(existing.id, noteId);
            if (options?.metadata) {
                for (const [key, value] of Object.entries(options.metadata)) {
                    this.setEntityMetadata(existing.id, key, value);
                }
            }
            if (options?.aliases) {
                for (const alias of options.aliases) {
                    this.addAlias(existing.id, alias);
                }
            }
            this.entityCache.delete(existing.id);
            return this.getEntityById(existing.id)!;
        }

        const id = this.generateId();
        const now = Date.now();

        const insertQuery = `
      ?[id, label, normalized, kind, subtype, first_note, created_at, created_by] <- [[
        $id, $label, $normalized, $kind, $subtype, $first_note, $created_at, $created_by
      ]]
      :put entities {id, label, normalized, kind, subtype, first_note, created_at, created_by}
    `;

        const params = {
            id,
            label,
            normalized,
            kind,
            subtype: options?.subtype ?? null,
            first_note: noteId,
            created_at: now,
            created_by: 'user'
        };

        try {
            const result = cozoDb.runQuery(insertQuery, params);
            if (result.ok === false) {
                console.error('[GraphRegistry] Insert failed:', result);
                throw new Error(`Insert failed: ${JSON.stringify(result)}`);
            }
        } catch (err) {
            console.error('[GraphRegistry] registerEntity insert error:', err);
            throw err;
        }

        if (options?.aliases) {
            for (const alias of options.aliases) this.addAlias(id, alias);
        }
        if (options?.metadata) {
            for (const [key, value] of Object.entries(options.metadata)) {
                this.setEntityMetadata(id, key, value);
            }
        }
        this.incrementMention(id, noteId);

        const insertedEntity = this.getEntityById(id);
        if (!insertedEntity) {
            console.error('[GraphRegistry] Entity not found after insert, id:', id);
            throw new Error(`Entity insert succeeded but retrieval failed for id: ${id}`);
        }
        return insertedEntity;
    }

    getEntityById(id: string): CozoEntity | null {
        if (this.entityCache.has(id)) return this.entityCache.get(id)!;

        const query = `?[id, label, normalized, kind, subtype, first_note, created_at, created_by] := *entities{id, label, normalized, kind, subtype, first_note, created_at, created_by}, id == $id`;
        const result = cozoDb.runQuery(query, { id });

        if (!result.rows || result.rows.length === 0) return null;

        const entity = this.hydrateEntity(result.rows[0]);
        this.cacheEntity(entity);
        return entity;
    }

    // Alias for legacy compatibility (adapters expectation)
    getEntityByIdSync(id: string): CozoEntity | null {
        return this.getEntityById(id);
    }

    findEntityByLabel(label: string): CozoEntity | null {
        const normalized = this.normalize(label);

        let result = cozoDb.runQuery(
            `?[id, label, normalized, kind, subtype, first_note, created_at, created_by] := *entities{id, label, normalized, kind, subtype, first_note, created_at, created_by}, normalized == $normalized`,
            { normalized }
        );
        if (result.rows?.length > 0) return this.hydrateEntity(result.rows[0]);

        result = cozoDb.runQuery(
            `?[id, label, normalized, kind, subtype, first_note, created_at, created_by] := *entity_aliases{entity_id, normalized: alias_norm}, alias_norm == $normalized, *entities{id: entity_id, label, normalized, kind, subtype, first_note, created_at, created_by}`,
            { normalized }
        );
        if (result.rows?.length > 0) return this.hydrateEntity(result.rows[0]);

        return null;
    }

    // Alias for legacy compatibility
    findEntityByLabelSync(label: string): CozoEntity | null {
        return this.findEntityByLabel(label);
    }

    isRegisteredEntity(label: string): boolean {
        const normalized = this.normalize(label);
        try {
            const query = `?[exists] := *entities{normalized}, normalized == $normalized, exists = true ?[exists] := *entity_aliases{normalized}, normalized == $normalized, exists = true`;
            const result = cozoDb.runQuery(query, { normalized });
            return result.rows?.length > 0;
        } catch { return false; }
    }

    getAllEntities(filters?: { kind?: EntityKind; subtype?: string; minMentions?: number }): CozoEntity[] {
        const whereClauses: string[] = [];
        const params: Record<string, any> = {};

        if (filters?.kind) {
            whereClauses.push(`kind == $filter_kind`);
            params.filter_kind = filters.kind;
        }
        if (filters?.subtype) {
            whereClauses.push(`subtype == $filter_subtype`);
            params.filter_subtype = filters.subtype;
        }

        const whereClause = whereClauses.length > 0 ? `,\n        ${whereClauses.join(',\n        ')}` : '';
        const query = `?[id, label, normalized, kind, subtype, first_note, created_at, created_by] := *entities{id, label, normalized, kind, subtype, first_note, created_at, created_by}${whereClause}`;

        const result = cozoDb.runQuery(query, params);
        const entities = (result.rows || []).map((row: any) => this.hydrateEntity(row));

        if (filters?.minMentions) return entities.filter(e => (e.totalMentions || 0) >= filters.minMentions);
        return entities;
    }

    // Alias for legacy compatibility
    getAllEntitiesSync(filters?: { kind?: EntityKind; subtype?: string; minMentions?: number }): CozoEntity[] {
        return this.getAllEntities(filters);
    }

    getEntitiesByKind(kind: EntityKind): CozoEntity[] { return this.getAllEntities({ kind }); }
    getEntitiesBySubtype(kind: EntityKind, subtype: string): CozoEntity[] { return this.getAllEntities({ kind, subtype }); }

    searchEntities(query: string): CozoEntity[] {
        const normalized = this.normalize(query);
        const all = this.getAllEntities();
        return all.filter(entity => {
            if (entity.normalized === normalized) return true;
            if (entity.normalized.includes(normalized)) return true;
            if (entity.aliases?.some(a => this.normalize(a).includes(normalized))) return true;
            return false;
        });
    }

    updateEntity(id: string, updates: { label?: string; kind?: EntityKind; subtype?: string; metadata?: Record<string, any>; attributes?: Record<string, any> }): boolean {
        const entity = this.getEntityById(id);
        if (!entity) return false;

        if (updates.label || updates.kind || updates.subtype !== undefined) {
            const newLabel = updates.label || entity.label;
            const newNorm = this.normalize(newLabel);
            const newKind = updates.kind || entity.kind;
            const newSubtype = updates.subtype !== undefined ? updates.subtype : entity.subtype;

            const updateQuery = `?[id, label, normalized, kind, subtype, first_note, created_at, created_by] <- [[$id, $label, $normalized, $kind, $subtype, $first_note, $created_at, $created_by]] :put entities {id, label, normalized, kind, subtype, first_note, created_at, created_by}`;

            try {
                cozoDb.runQuery(updateQuery, {
                    id,
                    label: newLabel,
                    normalized: newNorm,
                    kind: newKind,
                    subtype: newSubtype ?? null,
                    first_note: entity.firstNote,
                    created_at: entity.createdAt.getTime(),
                    created_by: entity.createdBy
                });
            } catch (err) { console.error('[GraphRegistry] Update failed:', err); return false; }
        }

        if (updates.metadata) {
            for (const [key, value] of Object.entries(updates.metadata)) this.setEntityMetadata(id, key, value);
        }

        this.entityCache.delete(id);
        return true;
    }

    deleteEntity(id: string): boolean {
        if (this.onEntityDeleteCallback) this.onEntityDeleteCallback(id);

        const relIds = this.getRelationshipIdsForEntity(id);
        for (const relId of relIds) {
            this.deleteRelationshipProvenance(relId);
            this.deleteRelationshipAttributes(relId);
        }

        cozoDb.runQuery(`?[id] := *relationships{id, source_id, target_id}, (source_id == $entity_id || target_id == $entity_id) :rm relationships {id}`, { entity_id: id });
        cozoDb.runQuery(`?[entity_id, alias, normalized] := *entity_aliases{entity_id, alias, normalized}, entity_id == $entity_id :rm entity_aliases {entity_id, alias, normalized}`, { entity_id: id });
        cozoDb.runQuery(`?[entity_id, note_id] := *entity_mentions{entity_id, note_id}, entity_id == $entity_id :rm entity_mentions {entity_id, note_id}`, { entity_id: id });
        cozoDb.runQuery(`?[entity_id, key] := *entity_metadata{entity_id, key}, entity_id == $entity_id :rm entity_metadata {entity_id, key}`, { entity_id: id });
        cozoDb.runQuery(`?[id] := *entities{id}, id == $id :rm entities {id}`, { id });

        this.entityCache.delete(id);
        return true;
    }

    mergeEntities(targetId: string, sourceId: string): boolean {
        const target = this.getEntityById(targetId);
        const source = this.getEntityById(sourceId);
        if (!target || !source || targetId === sourceId) return false;

        if (this.onEntityMergeCallback) this.onEntityMergeCallback(sourceId, targetId);

        if (source.aliases) for (const alias of source.aliases) this.addAlias(targetId, alias);
        this.addAlias(targetId, source.label);

        if (source.mentionsByNote) {
            for (const [noteId, count] of source.mentionsByNote.entries()) this.incrementMention(targetId, noteId, count);
        }

        const rels = this.getRelationshipsForEntity(sourceId);
        for (const rel of rels) {
            const newSrc = rel.sourceId === sourceId ? targetId : rel.sourceId;
            const newTgt = rel.targetId === sourceId ? targetId : rel.targetId;
            cozoDb.runQuery(
                `?[id, source_id, target_id, type, inverse_type, bidirectional, confidence, namespace, created_at, updated_at] <- [[$id, $source_id, $target_id, $type, $inverse_type, $bidirectional, $confidence, $namespace, $created_at, $updated_at]] :put relationships {id, source_id, target_id, type, inverse_type, bidirectional, confidence, namespace, created_at, updated_at}`,
                {
                    id: rel.id,
                    source_id: newSrc,
                    target_id: newTgt,
                    type: rel.type,
                    inverse_type: rel.inverseType ?? null,
                    bidirectional: rel.bidirectional,
                    confidence: rel.confidence,
                    namespace: rel.namespace ?? null,
                    created_at: rel.createdAt.getTime(),
                    updated_at: Date.now()
                }
            );
        }

        if (source.metadata) {
            for (const [key, value] of Object.entries(source.metadata)) this.setEntityMetadata(targetId, key, value);
        }

        this.deleteEntity(sourceId);
        return true;
    }

    onNoteDeleted(noteId: string): void {
        console.log(`[GraphRegistry] Cleaning up note ${noteId}`);
        cozoDb.runQuery(`?[entity_id, note_id] := *entity_mentions{entity_id, note_id}, note_id == $note_id :rm entity_mentions {entity_id, note_id}`, { note_id: noteId });
        cozoDb.runQuery(`?[relationship_id, source, origin_id] := *relationship_provenance{relationship_id, source, origin_id}, origin_id == $origin_id :rm relationship_provenance {relationship_id, source, origin_id}`, { origin_id: noteId });
    }

    // ==================== ALIAS MANAGEMENT ====================

    addAlias(entityId: string, alias: string): boolean {
        const normalized = this.normalize(alias);
        const existing = cozoDb.runQuery(
            `?[entity_id] := *entity_aliases{entity_id, normalized}, normalized == $normalized`,
            { normalized }
        );

        if (existing.rows?.length > 0) {
            if (existing.rows[0][0] !== entityId) {
                console.warn(`[GraphRegistry] Alias "${alias}" already belongs to ${existing.rows[0][0]}`);
                return false;
            }
            return true;
        }

        cozoDb.runQuery(
            `?[entity_id, alias, normalized] <- [[$entity_id, $alias, $normalized]] :put entity_aliases {entity_id, alias, normalized}`,
            { entity_id: entityId, alias, normalized }
        );
        this.entityCache.delete(entityId);
        return true;
    }

    removeAlias(entityId: string, alias: string): boolean {
        const normalized = this.normalize(alias);
        cozoDb.runQuery(
            `?[entity_id, alias, normalized] := *entity_aliases{entity_id, alias, normalized}, entity_id == $entity_id, normalized == $normalized :rm entity_aliases {entity_id, alias, normalized}`,
            { entity_id: entityId, normalized }
        );
        this.entityCache.delete(entityId);
        return true;
    }

    getAliases(entityId: string): string[] {
        const result = cozoDb.runQuery(
            `?[alias] := *entity_aliases{entity_id, alias}, entity_id == $entity_id`,
            { entity_id: entityId }
        );
        return (result.rows || []).map((row: any) => row[0]);
    }

    // ==================== MENTION STATISTICS ====================

    private incrementMention(entityId: string, noteId: string, delta: number = 1): void {
        const now = Date.now();
        const result = cozoDb.runQuery(
            `?[count] := *entity_mentions{entity_id, note_id, mention_count: count}, entity_id == $entity_id, note_id == $note_id`,
            { entity_id: entityId, note_id: noteId }
        );
        const currentCount = result.rows?.length > 0 ? result.rows[0][0] : 0;
        cozoDb.runQuery(
            `?[entity_id, note_id, mention_count, last_seen] <- [[$entity_id, $note_id, $mention_count, $last_seen]] :put entity_mentions {entity_id, note_id, mention_count, last_seen}`,
            { entity_id: entityId, note_id: noteId, mention_count: currentCount + delta, last_seen: now }
        );
    }

    updateNoteMentions(entityId: string, noteId: string, count: number): void {
        if (count <= 0) {
            cozoDb.runQuery(
                `?[entity_id, note_id] := *entity_mentions{entity_id, note_id}, entity_id == $entity_id, note_id == $note_id :rm entity_mentions {entity_id, note_id}`,
                { entity_id: entityId, note_id: noteId }
            );
        } else {
            cozoDb.runQuery(
                `?[entity_id, note_id, mention_count, last_seen] <- [[$entity_id, $note_id, $mention_count, $last_seen]] :put entity_mentions {entity_id, note_id, mention_count, last_seen}`,
                { entity_id: entityId, note_id: noteId, mention_count: count, last_seen: Date.now() }
            );
        }
        this.entityCache.delete(entityId);
    }

    // ==================== METADATA MANAGEMENT ====================

    setEntityMetadata(entityId: string, key: string, value: any): void {
        const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
        cozoDb.runQuery(
            `?[entity_id, key, value] <- [[$entity_id, $key, $value]] :put entity_metadata {entity_id, key, value}`,
            { entity_id: entityId, key, value: valueStr }
        );
        this.entityCache.delete(entityId);
    }

    getEntityMetadata(entityId: string): Record<string, any> {
        const result = cozoDb.runQuery(
            `?[key, value] := *entity_metadata{entity_id, key, value}, entity_id == $entity_id`,
            { entity_id: entityId }
        );
        const metadata: Record<string, any> = {};
        for (const [key, value] of result.rows || []) {
            try { metadata[key] = JSON.parse(value); } catch { metadata[key] = value; }
        }
        return metadata;
    }

    // ==================== RELATIONSHIP OPERATIONS ====================

    addRelationship(
        sourceId: string, targetId: string, type: string, provenance: RelationshipProvenance,
        options?: { inverseType?: string; bidirectional?: boolean; namespace?: string; attributes?: Record<string, any> }
    ): CozoRelationship {
        const existing = this.findRelationship(sourceId, targetId, type, options?.namespace);

        if (existing) {
            this.addProvenance(existing.id, provenance);
            this.recalculateRelationshipConfidence(existing.id);
            this.relationshipCache.delete(existing.id);
            return (this.getRelationshipById(existing.id))!;
        }

        const id = this.generateId();
        const now = Date.now();

        cozoDb.runQuery(
            `?[id, source_id, target_id, type, inverse_type, bidirectional, confidence, namespace, created_at, updated_at] <- [[$id, $source_id, $target_id, $type, $inverse_type, $bidirectional, $confidence, $namespace, $created_at, $updated_at]] :put relationships {id, source_id, target_id, type, inverse_type, bidirectional, confidence, namespace, created_at, updated_at}`,
            {
                id,
                source_id: sourceId,
                target_id: targetId,
                type,
                inverse_type: options?.inverseType ?? null,
                bidirectional: options?.bidirectional || false,
                confidence: provenance.confidence,
                namespace: options?.namespace ?? null,
                created_at: now,
                updated_at: now
            }
        );

        this.addProvenance(id, provenance);
        if (options?.attributes) {
            for (const [key, value] of Object.entries(options.attributes)) this.setRelationshipAttribute(id, key, value);
        }

        return (this.getRelationshipById(id))!;
    }

    // Alias for legacy compatibility
    addRelationshipSync(
        sourceId: string, targetId: string, type: string, provenance: RelationshipProvenance,
        options?: { inverseType?: string; bidirectional?: boolean; namespace?: string; attributes?: Record<string, any> }
    ): CozoRelationship {
        return this.addRelationship(sourceId, targetId, type, provenance, options);
    }

    getRelationshipById(id: string): CozoRelationship | null {
        if (this.relationshipCache.has(id)) return this.relationshipCache.get(id)!;

        const result = cozoDb.runQuery(
            `?[id, source_id, target_id, type, inverse_type, bidirectional, confidence, namespace, created_at, updated_at] := *relationships{id, source_id, target_id, type, inverse_type, bidirectional, confidence, namespace, created_at, updated_at}, id == $id`,
            { id }
        );
        if (!result.rows?.length) return null;

        const relationship = this.hydrateRelationship(result.rows[0]);
        this.cacheRelationship(relationship);
        return relationship;
    }

    getRelationshipByIdSync(id: string): CozoRelationship | null {
        return this.getRelationshipById(id);
    }

    findRelationship(sourceId: string, targetId: string, type: string, namespace?: string): CozoRelationship | null {
        const params: Record<string, any> = { source_id: sourceId, target_id: targetId, type };
        let nsClause = '';
        if (namespace) {
            nsClause = `, namespace == $namespace`;
            params.namespace = namespace;
        }
        const result = cozoDb.runQuery(
            `?[id, source_id, target_id, type, inverse_type, bidirectional, confidence, namespace, created_at, updated_at] := *relationships{id, source_id, target_id, type, inverse_type, bidirectional, confidence, namespace, created_at, updated_at}, source_id == $source_id, target_id == $target_id, type == $type${nsClause}`,
            params
        );
        if (!result.rows?.length) return null;
        return this.hydrateRelationship(result.rows[0]);
    }

    findRelationshipSync(sourceId: string, targetId: string, type: string, namespace?: string): CozoRelationship | null {
        return this.findRelationship(sourceId, targetId, type, namespace);
    }

    getRelationshipIdsForEntity(entityId: string): string[] {
        const result = cozoDb.runQuery(
            `?[id] := *relationships{id, source_id, target_id}, (source_id == $entity_id || target_id == $entity_id)`,
            { entity_id: entityId }
        );
        return (result.rows || []).map((row: any) => row[0]);
    }

    getRelationshipsForEntity(entityId: string): CozoRelationship[] {
        const result = cozoDb.runQuery(
            `?[id, source_id, target_id, type, inverse_type, bidirectional, confidence, namespace, created_at, updated_at] := *relationships{id, source_id, target_id, type, inverse_type, bidirectional, confidence, namespace, created_at, updated_at}, (source_id == $entity_id || target_id == $entity_id)`,
            { entity_id: entityId }
        );
        return (result.rows || []).map((row: any) => this.hydrateRelationship(row));
    }

    getRelationshipsForEntitySync(entityId: string): CozoRelationship[] {
        return this.getRelationshipsForEntity(entityId);
    }

    getRelationshipsBySource(sourceId: string): CozoRelationship[] {
        const result = cozoDb.runQuery(
            `?[id, source_id, target_id, type, inverse_type, bidirectional, confidence, namespace, created_at, updated_at] := *relationships{id, source_id, target_id, type, inverse_type, bidirectional, confidence, namespace, created_at, updated_at}, source_id == $source_id`,
            { source_id: sourceId }
        );
        return (result.rows || []).map((row: any) => this.hydrateRelationship(row));
    }

    getRelationshipsBySourceSync(sourceId: string): CozoRelationship[] {
        return this.getRelationshipsBySource(sourceId);
    }

    getRelationshipsByTarget(targetId: string): CozoRelationship[] {
        const result = cozoDb.runQuery(
            `?[id, source_id, target_id, type, inverse_type, bidirectional, confidence, namespace, created_at, updated_at] := *relationships{id, source_id, target_id, type, inverse_type, bidirectional, confidence, namespace, created_at, updated_at}, target_id == $target_id`,
            { target_id: targetId }
        );
        return (result.rows || []).map((row: any) => this.hydrateRelationship(row));
    }

    getRelationshipsByTargetSync(targetId: string): CozoRelationship[] {
        return this.getRelationshipsByTarget(targetId);
    }

    getRelationshipsByType(type: string): CozoRelationship[] {
        const result = cozoDb.runQuery(
            `?[id, source_id, target_id, type, inverse_type, bidirectional, confidence, namespace, created_at, updated_at] := *relationships{id, source_id, target_id, type, inverse_type, bidirectional, confidence, namespace, created_at, updated_at}, type == $type`,
            { type }
        );
        return (result.rows || []).map((row: any) => this.hydrateRelationship(row));
    }

    getRelationshipsByTypeSync(type: string): CozoRelationship[] {
        return this.getRelationshipsByType(type);
    }

    getRelationshipsByNamespace(namespace: string): CozoRelationship[] {
        const result = cozoDb.runQuery(
            `?[id, source_id, target_id, type, inverse_type, bidirectional, confidence, namespace, created_at, updated_at] := *relationships{id, source_id, target_id, type, inverse_type, bidirectional, confidence, namespace, created_at, updated_at}, namespace == $namespace`,
            { namespace }
        );
        return (result.rows || []).map((row: any) => this.hydrateRelationship(row));
    }

    getRelationshipsByNamespaceSync(namespace: string): CozoRelationship[] {
        return this.getRelationshipsByNamespace(namespace);
    }

    getAllRelationshipsSync(): CozoRelationship[] {
        const result = cozoDb.runQuery(`?[id, source_id, target_id, type, inverse_type, bidirectional, confidence, namespace, created_at, updated_at] := *relationships{id, source_id, target_id, type, inverse_type, bidirectional, confidence, namespace, created_at, updated_at}`);
        return (result.rows || []).map((row: any) => this.hydrateRelationship(row));
    }

    deleteRelationship(id: string): boolean {
        this.deleteRelationshipProvenance(id);
        this.deleteRelationshipAttributes(id);
        cozoDb.runQuery(`?[id] := *relationships{id}, id == $id :rm relationships {id}`, { id });
        this.relationshipCache.delete(id);
        return true;
    }

    deleteRelationshipSync(id: string): boolean {
        return this.deleteRelationship(id);
    }

    deleteRelationshipsByEntity(entityId: string): number {
        const relationships = this.getRelationshipsForEntity(entityId);
        for (const rel of relationships) this.deleteRelationship(rel.id);
        return relationships.length;
    }

    // ==================== PROVENANCE MANAGEMENT ====================

    addProvenance(relationshipId: string, provenance: RelationshipProvenance): void {
        cozoDb.runQuery(
            `?[relationship_id, source, origin_id, confidence, timestamp, context] <- [[$relationship_id, $source, $origin_id, $confidence, $timestamp, $context]] :put relationship_provenance {relationship_id, source, origin_id, confidence, timestamp, context}`,
            {
                relationship_id: relationshipId,
                source: provenance.source,
                origin_id: provenance.originId,
                confidence: provenance.confidence,
                timestamp: provenance.timestamp.getTime(),
                context: provenance.context ?? null
            }
        );
        this.relationshipCache.delete(relationshipId);
    }

    addProvenanceSync(relationshipId: string, provenance: RelationshipProvenance): void {
        this.addProvenance(relationshipId, provenance);
    }

    private getProvenance(relationshipId: string): RelationshipProvenance[] {
        const result = cozoDb.runQuery(
            `?[source, origin_id, confidence, timestamp, context] := *relationship_provenance{relationship_id, source, origin_id, confidence, timestamp, context}, relationship_id == $relationship_id`,
            { relationship_id: relationshipId }
        );
        return (result.rows || []).map((row: any) => ({ source: row[0], originId: row[1], confidence: row[2], timestamp: new Date(row[3]), context: row[4] }));
    }

    private deleteRelationshipProvenance(relationshipId: string): void {
        cozoDb.runQuery(
            `?[relationship_id, source, origin_id] := *relationship_provenance{relationship_id, source, origin_id}, relationship_id == $relationship_id :rm relationship_provenance {relationship_id, source, origin_id}`,
            { relationship_id: relationshipId }
        );
    }

    recalculateRelationshipConfidence(relationshipId: string): void {
        const provenance = this.getProvenance(relationshipId);
        if (provenance.length === 0) { this.deleteRelationship(relationshipId); return; }

        const weights: Record<string, number> = {
            user: 1.0, extraction: 0.8, llm: 0.7, pattern: 0.6, folder: 0.5, hierarchy: 0.4,
            MANUAL: 1.0, NER_EXTRACTION: 0.6, LLM_EXTRACTION: 0.7, FOLDER_STRUCTURE: 1.0,
            CO_OCCURRENCE: 0.4, IMPORT: 0.8, TIMELINE: 0.9, NETWORK: 1.0
        };
        let totalWeight = 0, weightedSum = 0;

        for (const p of provenance) {
            const weight = weights[p.source] || 0.5;
            weightedSum += p.confidence * weight;
            totalWeight += weight;
        }

        const newConfidence = totalWeight > 0 ? Math.min(1, weightedSum / totalWeight) : 0;
        const rel = this.getRelationshipById(relationshipId);
        if (rel) {
            cozoDb.runQuery(
                `?[id, source_id, target_id, type, inverse_type, bidirectional, confidence, namespace, created_at, updated_at] <- [[$id, $source_id, $target_id, $type, $inverse_type, $bidirectional, $confidence, $namespace, $created_at, $updated_at]] :put relationships {id, source_id, target_id, type, inverse_type, bidirectional, confidence, namespace, created_at, updated_at}`,
                {
                    id: relationshipId,
                    source_id: rel.sourceId,
                    target_id: rel.targetId,
                    type: rel.type,
                    inverse_type: rel.inverseType ?? null,
                    bidirectional: rel.bidirectional,
                    confidence: newConfidence,
                    namespace: rel.namespace ?? null,
                    created_at: rel.createdAt.getTime(),
                    updated_at: Date.now()
                }
            );
        }
        this.relationshipCache.delete(relationshipId);
    }

    recalculateRelationshipConfidenceSync(relationshipId: string): void {
        this.recalculateRelationshipConfidence(relationshipId);
    }

    setRelationshipAttribute(relationshipId: string, key: string, value: any): void {
        const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
        cozoDb.runQuery(
            `?[relationship_id, key, value] <- [[$relationship_id, $key, $value]] :put relationship_attributes {relationship_id, key, value}`,
            { relationship_id: relationshipId, key, value: valueStr }
        );
        this.relationshipCache.delete(relationshipId);
    }

    setRelationshipAttributeSync(relationshipId: string, key: string, value: any): void {
        this.setRelationshipAttribute(relationshipId, key, value);
    }

    private getRelationshipAttributes(relationshipId: string): Record<string, any> {
        const result = cozoDb.runQuery(
            `?[key, value] := *relationship_attributes{relationship_id, key, value}, relationship_id == $relationship_id`,
            { relationship_id: relationshipId }
        );
        const attributes: Record<string, any> = {};
        for (const [key, value] of result.rows || []) {
            try { attributes[key] = JSON.parse(value); } catch { attributes[key] = value; }
        }
        return attributes;
    }

    private deleteRelationshipAttributes(relationshipId: string): void {
        cozoDb.runQuery(
            `?[relationship_id, key] := *relationship_attributes{relationship_id, key}, relationship_id == $relationship_id :rm relationship_attributes {relationship_id, key}`,
            { relationship_id: relationshipId }
        );
    }

    getEntityStats(entityId: string): EntityStats | null {
        const entity = this.getEntityById(entityId);
        if (!entity) return null;
        const relationships = this.getRelationshipsForEntity(entityId);
        return { totalMentions: entity.totalMentions || 0, noteCount: entity.mentionsByNote?.size || 0, relationshipCount: relationships.length, aliases: entity.aliases || [] };
    }

    getGlobalStats(): GlobalStats {
        if (!this.initialized || !cozoDb.isReady()) {
            return { totalEntities: 0, totalRelationships: 0, totalProvenance: 0, entitiesByKind: {}, relationshipsByType: {} };
        }

        try {
            const entityResult = cozoDb.runQuery(`?[count(id)] := *entities{id}`);
            const entityCount = entityResult?.rows?.[0]?.[0] ?? 0;

            const relResult = cozoDb.runQuery(`?[count(id)] := *relationships{id}`);
            const relCount = relResult?.rows?.[0]?.[0] ?? 0;

            const provResult = cozoDb.runQuery(`?[count(relationship_id)] := *relationship_provenance{relationship_id}`);
            const provCount = provResult?.rows?.[0]?.[0] ?? 0;

            const kindResult = cozoDb.runQuery(`?[kind, count(id)] := *entities{id, kind} :order kind`);
            const entitiesByKind: Record<string, number> = {};
            for (const [kind, count] of kindResult?.rows || []) entitiesByKind[kind] = count;

            const typeResult = cozoDb.runQuery(`?[type, count(id)] := *relationships{id, type} :order type`);
            const relationshipsByType: Record<string, number> = {};
            for (const [type, count] of typeResult?.rows || []) relationshipsByType[type] = count;

            return { totalEntities: entityCount, totalRelationships: relCount, totalProvenance: provCount, entitiesByKind, relationshipsByType };
        } catch (err) {
            console.error('[GraphRegistry] getGlobalStats failed:', err);
            return { totalEntities: 0, totalRelationships: 0, totalProvenance: 0, entitiesByKind: {}, relationshipsByType: {} };
        }
    }

    // ==================== EXPORT/IMPORT ====================

    async exportToFile(): Promise<Blob> {
        const relations = [
            'entities', 'entity_aliases', 'entity_mentions', 'entity_metadata',
            'relationships', 'relationship_provenance', 'relationship_attributes',
            'folder_hierarchy', 'network_instance', 'network_membership', 'network_relationship'
        ];
        return cozoDb.exportToFile(relations);
    }

    async importFromFile(fileContent: string): Promise<void> {
        await cozoDb.importFromFile(fileContent);
        this.entityCache.clear();
        this.relationshipCache.clear();
    }

    async export(): Promise<{ version: string; timestamp: number; stats: GlobalStats; data: string }> {
        // for adapter legacy support
        const exportData = cozoDb.exportRelations([
            'entities', 'entity_aliases', 'entity_mentions', 'entity_metadata',
            'relationships', 'relationship_provenance', 'relationship_attributes'
        ]);
        return { version: '1.0', timestamp: Date.now(), stats: this.getGlobalStats(), data: exportData };
    }

    async import(exported: { data: string }): Promise<void> {
        cozoDb.importRelations(exported.data);
        this.entityCache.clear();
        this.relationshipCache.clear();
    }

    async clear(): Promise<void> {
        const relations = ['entities', 'entity_aliases', 'entity_mentions', 'entity_metadata', 'relationships', 'relationship_provenance', 'relationship_attributes'];
        for (const relation of relations) {
            try { cozoDb.run(`?[...args] := *${relation}{...args} :rm ${relation} {...args}`); } catch (err) { console.error(`[GraphRegistry] Failed to clear ${relation}:`, err); }
        }
        this.entityCache.clear();
        this.relationshipCache.clear();
    }

    // ==================== HELPER METHODS ====================

    private normalize(text: string): string { return text.toLowerCase().trim(); }

    private generateId(): string {
        return crypto.randomUUID();
    }

    private cacheEntity(entity: CozoEntity): void {
        if (this.entityCache.size >= this.cacheMaxSize) { const firstKey = this.entityCache.keys().next().value; if (firstKey) this.entityCache.delete(firstKey); }
        this.entityCache.set(entity.id, entity);
    }

    private cacheRelationship(relationship: CozoRelationship): void {
        if (this.relationshipCache.size >= this.cacheMaxSize) { const firstKey = this.relationshipCache.keys().next().value; if (firstKey) this.relationshipCache.delete(firstKey); }
        this.relationshipCache.set(relationship.id, relationship);
    }

    private hydrateEntity(row: any[]): CozoEntity {
        const [id, label, normalized, kind, subtype, firstNote, createdAt, createdBy] = row;
        const aliases = this.getAliases(id);

        const mentionsResult = cozoDb.runQuery(
            `?[note_id, count, last_seen] := *entity_mentions{entity_id, note_id, mention_count: count, last_seen}, entity_id == $entity_id`,
            { entity_id: id }
        );
        const mentionsByNote = new Map<string, number>();
        let lastSeenDate = new Date(0);
        for (const [noteId, count, lastSeen] of mentionsResult.rows || []) {
            mentionsByNote.set(noteId, count);
            const date = new Date(lastSeen);
            if (date > lastSeenDate) lastSeenDate = date;
        }

        const totalMentions = Array.from(mentionsByNote.values()).reduce((a, b) => a + b, 0);
        const metadata = this.getEntityMetadata(id);

        return { id, label, normalized, kind: kind as EntityKind, subtype, firstNote, createdAt: new Date(createdAt), createdBy, aliases, mentionsByNote, totalMentions, lastSeenDate, metadata, attributes: metadata };
    }

    private hydrateRelationship(row: any[]): CozoRelationship {
        const [id, sourceId, targetId, type, inverseType, bidirectional, confidence, namespace, createdAt, updatedAt] = row;
        const provenance = this.getProvenance(id);
        const attributes = this.getRelationshipAttributes(id);
        return { id, sourceId, targetId, type, inverseType, bidirectional, confidence, namespace, createdAt: new Date(createdAt), updatedAt: new Date(updatedAt), provenance, attributes };
    }
}

export const graphRegistry = new GraphRegistry();
