/**
 * @deprecated FactSheetService is deprecated. Use EntityMetadataService from @/lib/cozo/content instead.
 * 
 * This file is kept for reference during migration. It will be removed after verification.
 * 
 * Migration:
 * - factSheetService.getPrimarySheet() -> entityMetadataService.getAsRecord()
 * - factSheetService.getMetaSheet() -> entityMetadataService.getCards()
 * - factSheetService.updateSheet() -> entityMetadataService.setValue() / setMultiple()
 */

import type { EntityKind } from '@/lib/types/entityTypes';
import { entityMetadataService, ensureMetadataSchemas } from '@/lib/storage/content/EntityMetadataService';

// ===================================
// TYPES (kept for compatibility)
// ===================================

export type FactSheetType = 'primary' | 'meta';

export interface FactSheetDocument {
    id: string;
    entityId: string;
    type: FactSheetType;
    kind?: EntityKind;
    data: Record<string, any>;
    createdAt: number;
    updatedAt: number;
}

export interface FactSheetUpdate {
    data: Record<string, any>;
}

// ===================================
// SERVICE (Facade over EntityMetadataService)
// ===================================

export class FactSheetService {

    /**
     * @deprecated Use entityMetadataService.getAsRecord() instead
     */
    async getPrimarySheet(entityId: string, kind: EntityKind): Promise<FactSheetDocument> {
        ensureMetadataSchemas();
        const data = entityMetadataService.getAsRecord(entityId);

        return {
            id: `${entityId}:primary`,
            entityId,
            type: 'primary',
            kind,
            data,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
    }

    /**
     * @deprecated Use entityMetadataService.getCards() and getAsRecord() instead
     */
    async getMetaSheet(entityId: string): Promise<FactSheetDocument> {
        ensureMetadataSchemas();
        const cards = entityMetadataService.getCards(entityId);
        const data = entityMetadataService.getAsRecord(entityId);

        return {
            id: `${entityId}:meta`,
            entityId,
            type: 'meta',
            data: { ...data, metaCards: cards },
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
    }

    /**
     * @deprecated Use entityMetadataService.setValue() or setMultiple() instead
     */
    async updateSheet(entityId: string, type: FactSheetType, updates: Partial<Record<string, any>>): Promise<void> {
        ensureMetadataSchemas();
        entityMetadataService.setMultiple(entityId, updates);
    }

    /**
     * @deprecated Use entityMetadataService.deleteAllForEntity() instead
     */
    async deleteSheetsForEntity(entityId: string): Promise<void> {
        entityMetadataService.deleteAllForEntity(entityId);
        entityMetadataService.deleteAllCardsForEntity(entityId);
    }

    private getId(entityId: string, type: FactSheetType): string {
        return `${entityId}:${type}`;
    }
}

export const factSheetService = new FactSheetService();
