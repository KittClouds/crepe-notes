/**
 * Entity Metadata Service - Dexie Backend
 * 
 * Replaces FactSheetService with Dexie-native metadata storage.
 * Uses entityMetadata table for key-value pairs.
 * Uses entityCards table for custom card groupings.
 */

import { db } from '@/lib/dexie/db';
import type { EntityMetadata, EntityCard } from '@/lib/dexie/db';

// =============================================================================
// TYPES
// =============================================================================

export type FieldType = 'text' | 'number' | 'boolean' | 'date' | 'select' | 'multiselect' | 'textarea' | 'entity-link' | 'relationship';

export interface MetadataField {
    entityId: string;
    key: string;
    value: string;
    fieldType?: FieldType;
    cardId?: string;
}

export interface MetaCard {
    id: string;
    entityId: string;
    name: string;
    color?: string;
    icon?: string;
    displayOrder: number;
    isCollapsed: boolean;
    createdAt: number;
    updatedAt: number;
}

// =============================================================================
// SCHEMA CREATION
// =============================================================================

/**
 * Ensure the entity_cards schema exists
 * Dexie handles this automatically via version().stores()
 */
export function ensureMetadataSchemas(): void {
    console.log('[EntityMetadataService] Dexie schemas auto-created');
}

// =============================================================================
// METADATA OPERATIONS
// =============================================================================

export class EntityMetadataService {

    /**
     * Get all metadata for an entity
     */
    async getMetadata(entityId: string): Promise<MetadataField[]> {
        const rows = await db.entityMetadata.where('entityId').equals(entityId).toArray();
        return rows.map(row => ({
            entityId: row.entityId,
            key: row.key,
            value: row.value,
        }));
    }

    /**
     * Get a single metadata value
     */
    async getValue(entityId: string, key: string): Promise<string | null> {
        const row = await db.entityMetadata.get([entityId, key]);
        return row?.value ?? null;
    }

    /**
     * Set a metadata value (upsert)
     */
    async setValue(entityId: string, key: string, value: any): Promise<void> {
        const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
        await db.entityMetadata.put({ entityId, key, value: stringValue });
    }

    /**
     * Set multiple metadata values at once
     */
    async setMultiple(entityId: string, metadata: Record<string, any>): Promise<void> {
        const entries = Object.entries(metadata);
        for (const [key, value] of entries) {
            if (value !== null && value !== undefined) {
                await this.setValue(entityId, key, value);
            } else {
                await this.deleteValue(entityId, key);
            }
        }
    }

    /**
     * Delete a metadata value
     */
    async deleteValue(entityId: string, key: string): Promise<void> {
        await db.entityMetadata.delete([entityId, key]);
    }

    /**
     * Delete all metadata for an entity
     */
    async deleteAllForEntity(entityId: string): Promise<void> {
        await db.entityMetadata.where('entityId').equals(entityId).delete();
    }

    // =========================================================================
    // META CARDS
    // =========================================================================

    /**
     * Get all custom cards for an entity
     */
    async getCards(entityId: string): Promise<MetaCard[]> {
        const rows = await db.entityCards
            .where('entityId')
            .equals(entityId)
            .sortBy('displayOrder');

        return rows.map(row => ({
            id: row.cardId,
            entityId: row.entityId,
            name: row.name,
            color: row.color || undefined,
            icon: row.icon || undefined,
            displayOrder: row.displayOrder,
            isCollapsed: row.isCollapsed,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        }));
    }

    /**
     * Create a new custom card
     */
    async createCard(params: {
        entityId: string;
        name: string;
        color?: string;
        icon?: string;
    }): Promise<MetaCard> {
        const { entityId, name, color, icon } = params;
        const cardId = crypto.randomUUID();
        const timestamp = Date.now();

        // Get current max order
        const existingCards = await this.getCards(entityId);
        const displayOrder = existingCards.length;

        const card: EntityCard = {
            entityId,
            cardId,
            name,
            color: color ?? '',
            icon: icon ?? '',
            displayOrder,
            isCollapsed: false,
            createdAt: timestamp,
            updatedAt: timestamp,
        };

        await db.entityCards.add(card);

        return {
            id: cardId,
            entityId,
            name,
            color,
            icon,
            displayOrder,
            isCollapsed: false,
            createdAt: timestamp,
            updatedAt: timestamp,
        };
    }

    /**
     * Update a card
     */
    async updateCard(entityId: string, cardId: string, updates: Partial<Omit<MetaCard, 'id' | 'entityId' | 'createdAt'>>): Promise<void> {
        const existing = await db.entityCards.get([entityId, cardId]);
        if (!existing) return;

        const timestamp = Date.now();
        await db.entityCards.put({
            ...existing,
            name: updates.name ?? existing.name,
            color: updates.color ?? existing.color,
            icon: updates.icon ?? existing.icon,
            displayOrder: updates.displayOrder ?? existing.displayOrder,
            isCollapsed: updates.isCollapsed ?? existing.isCollapsed,
            updatedAt: timestamp,
        });
    }

    /**
     * Delete a card and its associated fields
     */
    async deleteCard(entityId: string, cardId: string): Promise<void> {
        // Delete card
        await db.entityCards.delete([entityId, cardId]);

        // Delete metadata fields that belong to this card
        // Fields are stored with keys like "cardId:fieldName"
        const metadata = await this.getMetadata(entityId);
        for (const field of metadata) {
            if (field.key.startsWith(`${cardId}:`)) {
                await this.deleteValue(entityId, field.key);
            }
        }
    }

    /**
     * Delete all cards for an entity
     */
    async deleteAllCardsForEntity(entityId: string): Promise<void> {
        await db.entityCards.where('entityId').equals(entityId).delete();
    }

    // =========================================================================
    // CONVENIENCE: Structured Field Access
    // =========================================================================

    /**
     * Get a structured field (parses JSON if needed)
     */
    async getStructuredValue<T>(entityId: string, key: string): Promise<T | null> {
        const raw = await this.getValue(entityId, key);
        if (raw === null) return null;

        try {
            return JSON.parse(raw) as T;
        } catch {
            return raw as unknown as T;
        }
    }

    /**
     * Get all metadata as a record
     */
    async getAsRecord(entityId: string): Promise<Record<string, any>> {
        const metadata = await this.getMetadata(entityId);
        const record: Record<string, any> = {};

        for (const field of metadata) {
            try {
                record[field.key] = JSON.parse(field.value);
            } catch {
                record[field.key] = field.value;
            }
        }

        return record;
    }
}

// Singleton
export const entityMetadataService = new EntityMetadataService();
