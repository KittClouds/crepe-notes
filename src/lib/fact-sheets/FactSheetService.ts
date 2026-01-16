// src/lib/fact-sheets/FactSheetService.ts
// Fact Sheet Service - Manages strictly typed (Primary) and flexible (Meta) fact sheets
// Persists directly to NebulaDB 'fact_sheets' collection.

import { db, Collections } from '../db';
import type { EntityKind } from '@/lib/types/entityTypes';

// ===================================
// TYPES
// ===================================

export type FactSheetType = 'primary' | 'meta';

export interface FactSheetDocument {
    id: string;             // Composite ID: "{entityId}:{type}"
    entityId: string;
    type: FactSheetType;
    kind?: EntityKind;      // Only for primary sheets
    data: Record<string, any>;
    createdAt: number;
    updatedAt: number;
}

export interface FactSheetUpdate {
    data: Record<string, any>;
}

// ===================================
// SERVICE
// ===================================

export class FactSheetService {

    /**
     * Get or create the Primary Fact Sheet for an entity
     * Primary sheets enforce the schema for the entity's Kind
     */
    async getPrimarySheet(entityId: string, kind: EntityKind): Promise<FactSheetDocument> {
        const id = this.getId(entityId, 'primary');
        const existing = await db.collection(Collections.FACT_SHEETS).findOne({ id });

        if (existing) {
            return existing as unknown as FactSheetDocument;
        }

        // Create default
        const newSheet: FactSheetDocument = {
            id,
            entityId,
            type: 'primary',
            kind,
            data: {},
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        await db.collection(Collections.FACT_SHEETS).insert(newSheet);
        return newSheet;
    }

    /**
     * Get or create the Meta Fact Sheet for an entity
     * Meta sheets store custom cards and extra fields
     */
    async getMetaSheet(entityId: string): Promise<FactSheetDocument> {
        const id = this.getId(entityId, 'meta');
        const existing = await db.collection(Collections.FACT_SHEETS).findOne({ id });

        if (existing) {
            return existing as unknown as FactSheetDocument;
        }

        // Create default
        const newSheet: FactSheetDocument = {
            id,
            entityId,
            type: 'meta',
            data: {}, // Will store custom cards like { "card-uuid": { title: "...", fields: [...] } }
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        await db.collection(Collections.FACT_SHEETS).insert(newSheet);
        return newSheet;
    }

    /**
     * Update a fact sheet (merges data)
     */
    async updateSheet(entityId: string, type: FactSheetType, updates: Partial<Record<string, any>>): Promise<void> {
        const id = this.getId(entityId, type);
        const sheet = await db.collection(Collections.FACT_SHEETS).findOne({ id });

        if (!sheet) {
            throw new Error(`FactSheet not found for ${entityId}:${type}`);
        }

        const newData = { ...(sheet.data || {}), ...updates };

        await db.collection(Collections.FACT_SHEETS).update(
            { id },
            {
                $set: {
                    data: newData,
                    updatedAt: Date.now()
                }
            }
        );
    }

    /**
     * Delete all sheets for an entity
     */
    async deleteSheetsForEntity(entityId: string): Promise<void> {
        await db.collection(Collections.FACT_SHEETS).delete({ entityId });
    }

    private getId(entityId: string, type: FactSheetType): string {
        return `${entityId}:${type}`;
    }
}

export const factSheetService = new FactSheetService();
