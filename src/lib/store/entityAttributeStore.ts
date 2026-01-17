// src/lib/store/entityAttributeStore.ts
// Entity Attributes System - Pure TypeScript (no framework dependencies)
//
// Provides reactive state for entity attributes, meta cards, and field schemas.
// PERSISTED: Uses EntityMetadataService (CozoDB)

import { generateId } from '@/lib/utils/ids';
import type {
    FieldType,
    EntityAttribute,
    MetaCard,
    FieldSchema,
} from '@/lib/types/entityAttributes';
import type { EntityKind } from '@/lib/types/entityTypes';
import { entityMetadataService, ensureMetadataSchemas } from '@/lib/cozo/content/EntityMetadataService';
import { cozoDb } from '@/lib/cozo/db';
import { isPrimaryField } from '@/lib/fact-sheets/schema-definitions';
import { smartGraphRegistry } from '@/lib/registry/SmartGraphRegistry';

// ============================================
// IN-MEMORY STORE (Singleton)
// ============================================

class EntityAttributeStore {
    private attributes: Map<string, EntityAttribute[]> = new Map();
    private metaCards: Map<string, MetaCard[]> = new Map();
    private fieldSchemas: FieldSchema[] = [];
    private listeners: Set<() => void> = new Set();
    private initialized = false;

    // ============================================
    // SUBSCRIPTIONS
    // ============================================

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notify(): void {
        this.listeners.forEach(fn => fn());
    }

    // ============================================
    // INITIALIZATION
    // ============================================

    async init() {
        if (this.initialized) return;

        try {
            // Wait for CozoDB to be ready
            if (!cozoDb.isReady()) {
                console.log('[EntityAttributeStore] CozoDB not ready, deferring init...');
                return;
            }

            // Ensure schemas exist
            ensureMetadataSchemas();

            // Load all entities from graph registry to hydrate metadata
            const entities = smartGraphRegistry.getAllEntities?.() ?? [];

            for (const entity of entities) {
                this.hydrateEntityMetadata(entity.id);
            }

            this.initialized = true;
            this.notify();
            console.log('[EntityAttributeStore] Initialized from CozoDB');
        } catch (e) {
            console.error("Failed to init EntityAttributeStore", e);
        }
    }

    private hydrateEntityMetadata(entityId: string): void {
        // Load metadata from CozoDB
        const metadata = entityMetadataService.getAsRecord(entityId);
        const cards = entityMetadataService.getCards(entityId);

        const list: EntityAttribute[] = [];

        for (const [key, value] of Object.entries(metadata)) {
            // Parse key format: might be "cardId:fieldName" or just "fieldName"
            let fieldName = key;
            let cardId: string | undefined;
            let fieldType: FieldType = 'text';

            // Check if value is structured (has type info)
            if (value && typeof value === 'object' && 'value' in value && 'type' in value) {
                fieldName = key;
                fieldType = value.type || 'text';
                cardId = value.cardId;

                list.push({
                    id: `${entityId}:${key}`,
                    entityId,
                    fieldName,
                    value: value.value,
                    fieldType,
                    cardId,
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                });
            } else {
                // Simple key-value
                list.push({
                    id: `${entityId}:${key}`,
                    entityId,
                    fieldName: key,
                    value,
                    fieldType: 'text',
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                });
            }
        }

        this.attributes.set(entityId, list);

        // Load cards
        if (cards.length > 0) {
            this.metaCards.set(entityId, cards.map(c => ({
                id: c.id,
                ownerId: c.entityId,
                name: c.name,
                color: c.color,
                icon: c.icon,
                displayOrder: c.displayOrder,
                isCollapsed: c.isCollapsed,
                createdAt: c.createdAt,
                updatedAt: c.updatedAt,
            })));
        }
    }

    // ============================================
    // ENTITY ATTRIBUTES
    // ============================================

    getAttributes(entityId: string): EntityAttribute[] {
        // Lazy load if not cached
        if (!this.attributes.has(entityId)) {
            this.hydrateEntityMetadata(entityId);
        }
        return this.attributes.get(entityId) || [];
    }

    getAttribute(entityId: string, fieldName: string): any {
        const attrs = this.getAttributes(entityId);
        const attr = attrs.find(a => a.fieldName === fieldName);
        return attr?.value ?? null;
    }

    setAttribute(params: {
        entityId: string;
        fieldName: string;
        value: any;
        fieldType?: FieldType;
        schemaId?: string;
        cardId?: string;
    }): void {
        const { entityId, fieldName, value, fieldType = 'text', schemaId, cardId } = params;
        const timestamp = Date.now();

        // 1. Update In-Memory State
        const existing = this.attributes.get(entityId) || [];
        const existingIndex = existing.findIndex(a => a.fieldName === fieldName);

        const newAttribute: EntityAttribute = {
            id: existingIndex >= 0 ? existing[existingIndex].id : crypto.randomUUID(),
            entityId,
            fieldName,
            fieldType,
            value,
            schemaId,
            cardId,
            createdAt: existingIndex >= 0 ? existing[existingIndex].createdAt : timestamp,
            updatedAt: timestamp,
        };

        const updatedAttrs = [...existing];
        if (existingIndex >= 0) {
            updatedAttrs[existingIndex] = newAttribute;
        } else {
            updatedAttrs.push(newAttribute);
        }

        this.attributes.set(entityId, updatedAttrs);
        this.notify();

        // 2. Persist to CozoDB
        this.persistAttribute(entityId, fieldName, value, fieldType, cardId);
    }

    private persistAttribute(entityId: string, fieldName: string, value: any, fieldType: FieldType, cardId?: string) {
        // Determine if Primary or Meta
        const entity = smartGraphRegistry.getEntityById(entityId);
        const kind = entity?.kind;

        // Check schema logic
        const isPrimary = isPrimaryField(kind, fieldName);

        if (isPrimary) {
            // Primary field: Store raw value
            entityMetadataService.setValue(entityId, fieldName, value);
        } else {
            // Meta field: Store with type info
            const storageValue = {
                value,
                type: fieldType,
                cardId
            };
            entityMetadataService.setValue(entityId, fieldName, storageValue);
        }
    }

    setMultipleAttributes(params: {
        entityId: string;
        attributes: Record<string, any>;
        fieldTypes?: Record<string, FieldType>;
    }): void {
        const { entityId, attributes, fieldTypes = {} } = params;

        for (const [fieldName, value] of Object.entries(attributes)) {
            this.setAttribute({
                entityId,
                fieldName,
                value,
                fieldType: fieldTypes[fieldName] || 'text',
            });
        }
    }

    async deleteAttribute(entityId: string, fieldName: string): Promise<void> {
        const existing = this.attributes.get(entityId) || [];
        const filtered = existing.filter(a => a.fieldName !== fieldName);
        this.attributes.set(entityId, filtered);
        this.notify();

        // Delete from CozoDB
        entityMetadataService.deleteValue(entityId, fieldName);
    }

    // ============================================
    // META CARDS
    // ============================================

    getMetaCards(entityId: string): MetaCard[] {
        // Lazy load if not cached
        if (!this.metaCards.has(entityId)) {
            const cards = entityMetadataService.getCards(entityId);
            if (cards.length > 0) {
                this.metaCards.set(entityId, cards.map(c => ({
                    id: c.id,
                    ownerId: c.entityId,
                    name: c.name,
                    color: c.color,
                    icon: c.icon,
                    displayOrder: c.displayOrder,
                    isCollapsed: c.isCollapsed,
                    createdAt: c.createdAt,
                    updatedAt: c.updatedAt,
                })));
            }
        }
        return this.metaCards.get(entityId) || [];
    }

    createMetaCard(params: {
        ownerId: string;
        name: string;
        color?: string;
        icon?: string;
    }): MetaCard {
        const { ownerId, name, color, icon } = params;

        // Create in CozoDB
        const created = entityMetadataService.createCard({
            entityId: ownerId,
            name,
            color,
            icon,
        });

        // Update local cache
        const existingCards = this.metaCards.get(ownerId) || [];
        const newCard: MetaCard = {
            id: created.id,
            ownerId,
            name: created.name,
            color: created.color,
            icon: created.icon,
            displayOrder: created.displayOrder,
            isCollapsed: created.isCollapsed,
            createdAt: created.createdAt,
            updatedAt: created.updatedAt,
        };

        const newCards = [...existingCards, newCard];
        this.metaCards.set(ownerId, newCards);
        this.notify();

        return newCard;
    }

    updateMetaCard(cardId: string, updates: Partial<Pick<MetaCard, 'name' | 'color' | 'icon' | 'displayOrder' | 'isCollapsed'>>): void {
        const timestamp = Date.now();

        for (const [ownerId, cards] of this.metaCards.entries()) {
            const idx = cards.findIndex(c => c.id === cardId);
            if (idx >= 0) {
                // Update in CozoDB
                entityMetadataService.updateCard(ownerId, cardId, updates);

                // Update local cache
                const updatedCards = [...cards];
                updatedCards[idx] = { ...updatedCards[idx], ...updates, updatedAt: timestamp };
                this.metaCards.set(ownerId, updatedCards);
                this.notify();
                return;
            }
        }
    }

    deleteMetaCard(cardId: string): void {
        for (const [ownerId, cards] of this.metaCards.entries()) {
            if (cards.some(c => c.id === cardId)) {
                // Delete from CozoDB
                entityMetadataService.deleteCard(ownerId, cardId);

                // Update local cache
                const newCards = cards.filter(c => c.id !== cardId);
                this.metaCards.set(ownerId, newCards);

                // Also delete fields associated with this card
                const attributes = this.attributes.get(ownerId) || [];
                const keptAttributes = attributes.filter(a => a.cardId !== cardId);
                this.attributes.set(ownerId, keptAttributes);

                this.notify();
                return;
            }
        }
    }

    // ============================================
    // UTILS
    // ============================================

    getAttributesAsRecord(entityId: string): Record<string, any> {
        const attrs = this.getAttributes(entityId);
        const record: Record<string, any> = {};
        for (const attr of attrs) {
            record[attr.fieldName] = attr.value;
        }
        return record;
    }

    invalidateEntity(entityId: string): void {
        this.attributes.delete(entityId);
        this.metaCards.delete(entityId);
        this.notify();
    }

    clearAll(): void {
        // Delete all from CozoDB for each entity
        for (const entityId of this.attributes.keys()) {
            entityMetadataService.deleteAllForEntity(entityId);
            entityMetadataService.deleteAllCardsForEntity(entityId);
        }

        this.attributes.clear();
        this.metaCards.clear();
        this.fieldSchemas = [];
        this.notify();
    }
}

export const entityAttributeStore = new EntityAttributeStore();

// NOTE: init() should be called by AppOrchestrator after CozoDB is ready
// entityAttributeStore.init(); is called in AppOrchestrator.ts
