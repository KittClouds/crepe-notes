// src/lib/store/entityAttributeStore.ts
// Entity Attributes System - Pure TypeScript (no framework dependencies)
//
// Provides reactive state for entity attributes, meta cards, and field schemas.
// MEMORY-ONLY: Attributes exist only in-memory for display purposes.
// Future: Can be persisted to SurrealDB or localStorage.

import { generateId } from '@/lib/utils/ids';
import type {
    FieldType,
    EntityAttribute,
    MetaCard,
    FieldSchema,
    ValidationRule
} from '@/lib/types/entityAttributes';

// ============================================
// IN-MEMORY STORE (Singleton)
// ============================================

class EntityAttributeStore {
    private attributes: Map<string, EntityAttribute[]> = new Map();
    private metaCards: Map<string, MetaCard[]> = new Map();
    private fieldSchemas: FieldSchema[] = [];
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    private listeners: Set<() => void> = new Set();

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
    // ENTITY ATTRIBUTES
    // ============================================

    getAttributes(entityId: string): EntityAttribute[] {
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

    deleteAttribute(entityId: string, fieldName: string): void {
        const existing = this.attributes.get(entityId) || [];
        const filtered = existing.filter(a => a.fieldName !== fieldName);
        this.attributes.set(entityId, filtered);
        this.notify();
    }

    getAttributesAsRecord(entityId: string): Record<string, any> {
        const attrs = this.getAttributes(entityId);
        const record: Record<string, any> = {};
        for (const attr of attrs) {
            record[attr.fieldName] = attr.value;
        }
        return record;
    }

    // ============================================
    // META CARDS
    // ============================================

    getMetaCards(entityId: string): MetaCard[] {
        return this.metaCards.get(entityId) || [];
    }

    createMetaCard(params: {
        ownerId: string;
        name: string;
        color?: string;
        icon?: string;
    }): MetaCard {
        const { ownerId, name, color, icon } = params;
        const timestamp = Date.now();

        const existingCards = this.metaCards.get(ownerId) || [];
        // Use crypto.randomUUID() if generateId() not available, or import it
        const newCard: MetaCard = {
            id: crypto.randomUUID(),
            ownerId,
            name,
            color,
            icon,
            displayOrder: existingCards.length,
            isCollapsed: false,
            createdAt: timestamp,
            updatedAt: timestamp,
        };

        this.metaCards.set(ownerId, [...existingCards, newCard]);
        this.notify();
        return newCard;
    }

    updateMetaCard(cardId: string, updates: Partial<Pick<MetaCard, 'name' | 'color' | 'icon' | 'displayOrder' | 'isCollapsed'>>): void {
        const timestamp = Date.now();

        for (const [ownerId, cards] of this.metaCards.entries()) {
            const idx = cards.findIndex(c => c.id === cardId);
            if (idx >= 0) {
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
                this.metaCards.set(ownerId, cards.filter(c => c.id !== cardId));
                this.notify();
                return;
            }
        }
    }

    // ============================================
    // CACHE MANAGEMENT
    // ============================================

    invalidateEntity(entityId: string): void {
        this.attributes.delete(entityId);
        this.metaCards.delete(entityId);
        this.notify();
    }

    clearAll(): void {
        this.attributes.clear();
        this.metaCards.clear();
        this.fieldSchemas = [];
        this.notify();
    }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const entityAttributeStore = new EntityAttributeStore();
