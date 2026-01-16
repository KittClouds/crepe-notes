// src/lib/store/entityAttributeStore.ts
// Entity Attributes System - Pure TypeScript (no framework dependencies)
//
// Provides reactive state for entity attributes, meta cards, and field schemas.
// PERSISTED: Uses FactSheetService (NebulaDB)

import { generateId } from '@/lib/utils/ids';
import type {
    FieldType,
    EntityAttribute,
    MetaCard,
    FieldSchema,
} from '@/lib/types/entityAttributes';
import type { EntityKind } from '@/lib/types/entityTypes';
import { factSheetService } from '@/lib/fact-sheets';
import { db, Collections } from '../db';
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
            // Load ALL fact sheets from NebulaDB to hydrate cache
            // Optimized: We could load only on demand, but this mimics previous behavior for now
            const sheets = await db.collection(Collections.FACT_SHEETS).find({});

            for (const doc of sheets) {
                const sheet = doc as any;
                if (sheet.type === 'primary') {
                    this.hydratePrimaryData(sheet.entityId, sheet.data);
                } else if (sheet.type === 'meta') {
                    this.hydrateMetaData(sheet.entityId, sheet.data);
                }
            }

            this.initialized = true;
            this.notify();
            console.log('[EntityAttributeStore] Initialized from FactSheets');
        } catch (e) {
            console.error("Failed to init EntityAttributeStore", e);
        }
    }

    private hydratePrimaryData(entityId: string, data: Record<string, any>) {
        const list = this.attributes.get(entityId) || [];

        for (const [key, value] of Object.entries(data)) {
            // Primary fields: Value is just the value. Type/Schema is implicit in UI.
            // Check if already exists to avoid dupes
            if (!list.find(a => a.fieldName === key)) {
                list.push({
                    id: `${entityId}:${key}`,
                    entityId,
                    fieldName: key,
                    value,
                    fieldType: 'text', // Default, UI will restrict input based on Schema
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                });
            } else {
                // Update existing
                const idx = list.findIndex(a => a.fieldName === key);
                if (idx !== -1) list[idx].value = value;
            }
        }

        this.attributes.set(entityId, list);
    }

    private hydrateMetaData(entityId: string, data: Record<string, any>) {
        // Meta data contains "metaCards" array and loose fields
        if (data.metaCards) {
            this.metaCards.set(entityId, data.metaCards as MetaCard[]);
        }

        const list = this.attributes.get(entityId) || [];
        for (const [key, valueObj] of Object.entries(data)) {
            if (key === 'metaCards') continue;

            // Meta fields are stored as { value, type, cardId } or legacy raw value
            let value = valueObj;
            let fieldType: FieldType = 'text';
            let cardId: string | undefined = undefined;

            if (valueObj && typeof valueObj === 'object' && 'value' in valueObj && 'type' in valueObj) {
                value = valueObj.value;
                fieldType = valueObj.type;
                cardId = valueObj.cardId;
            }

            const existingIdx = list.findIndex(a => a.fieldName === key);
            if (existingIdx === -1) {
                list.push({
                    id: `${entityId}:${key}`,
                    entityId,
                    fieldName: key,
                    value,
                    fieldType,
                    cardId,
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                });
            } else {
                list[existingIdx].value = value;
                list[existingIdx].fieldType = fieldType;
                list[existingIdx].cardId = cardId;
            }
        }
        this.attributes.set(entityId, list);
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

        // 2. Persist to NebulaDB via FactSheetService
        this.persistAttribute(entityId, fieldName, value, fieldType, cardId);
    }

    private async persistAttribute(entityId: string, fieldName: string, value: any, fieldType: FieldType, cardId?: string) {
        // Determine if Primary or Meta
        const entity = smartGraphRegistry.getEntityById(entityId);
        const kind = entity?.kind;

        // Check schema logic
        const isPrimary = isPrimaryField(kind, fieldName);

        if (isPrimary && kind) {
            // Primary Sheet: Store raw value
            await factSheetService.getPrimarySheet(entityId, kind);
            await factSheetService.updateSheet(entityId, 'primary', { [fieldName]: value });
        } else {
            // Meta Sheet: Store metadata object
            await factSheetService.getMetaSheet(entityId);
            const storageValue = {
                value,
                type: fieldType,
                cardId
            };
            await factSheetService.updateSheet(entityId, 'meta', { [fieldName]: storageValue });
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

        const entity = smartGraphRegistry.getEntityById(entityId);
        const kind = entity?.kind;
        const isPrimary = isPrimaryField(kind, fieldName);

        // We set to null to indicate deletion in the merge logic
        if (isPrimary && kind) {
            await factSheetService.updateSheet(entityId, 'primary', { [fieldName]: null });
        } else {
            await factSheetService.updateSheet(entityId, 'meta', { [fieldName]: null });
        }
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
        const newCard: MetaCard = {
            id: generateId(),
            ownerId,
            name,
            color,
            icon,
            displayOrder: existingCards.length,
            isCollapsed: false,
            createdAt: timestamp,
            updatedAt: timestamp,
        };

        const newCards = [...existingCards, newCard];
        this.metaCards.set(ownerId, newCards);
        this.notify();

        this.persistMetaCards(ownerId, newCards);
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
                this.persistMetaCards(ownerId, updatedCards);
                return;
            }
        }
    }

    deleteMetaCard(cardId: string): void {
        for (const [ownerId, cards] of this.metaCards.entries()) {
            if (cards.some(c => c.id === cardId)) {
                const newCards = cards.filter(c => c.id !== cardId);
                this.metaCards.set(ownerId, newCards);
                // Also delete fields associated with this card
                const attributes = this.attributes.get(ownerId) || [];
                const cardsFields = attributes.filter(a => a.cardId === cardId);
                const keptAttributes = attributes.filter(a => a.cardId !== cardId);
                this.attributes.set(ownerId, keptAttributes);

                this.notify();
                this.persistMetaCards(ownerId, newCards);

                // Delete fields from DB
                // We do this by setting them to null in the sheet
                const deletionUpdate: Record<string, any> = {};
                cardsFields.forEach(f => deletionUpdate[f.fieldName] = null);
                if (Object.keys(deletionUpdate).length > 0) {
                    factSheetService.updateSheet(ownerId, 'meta', deletionUpdate);
                }

                return;
            }
        }
    }

    private async persistMetaCards(entityId: string, cards: MetaCard[]) {
        try {
            await factSheetService.getMetaSheet(entityId);
            await factSheetService.updateSheet(entityId, 'meta', { metaCards: cards });
        } catch (error) {
            console.error('Failed to persist meta cards:', error);
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
        this.attributes.clear();
        this.metaCards.clear();
        this.fieldSchemas = [];
        this.notify();

        db.collection(Collections.FACT_SHEETS).delete({});
    }
}

export const entityAttributeStore = new EntityAttributeStore();
entityAttributeStore.init();
