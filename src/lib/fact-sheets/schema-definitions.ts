// src/lib/fact-sheets/schema-definitions.ts
// Schema Definitions for Fact Sheets
// Maps EntityKind to its Schema definition

import type { EntityFactSheetSchema } from '@/types/factSheetTypes';
import { characterSchema } from '@/lib/entity-schemas/characterSchema';
import { locationSchema } from '@/lib/entity-schemas/locationSchema';
import { itemSchema } from '@/lib/entity-schemas/itemSchema';
import { factionSchema } from '@/lib/entity-schemas/factionSchema';
import { eventSchema } from '@/lib/entity-schemas/eventSchema';
import { conceptSchema } from '@/lib/entity-schemas/conceptSchema';
import { npcSchema } from '@/lib/entity-schemas/npcSchema';
import { sceneSchema } from '@/lib/entity-schemas/sceneSchema';
import type { EntityKind } from '@/lib/types/entityTypes';

export const SCHEMAS: Record<EntityKind, EntityFactSheetSchema | undefined> = {
    CHARACTER: characterSchema,
    LOCATION: locationSchema,
    ITEM: itemSchema,
    FACTION: factionSchema,
    EVENT: eventSchema,
    CONCEPT: conceptSchema,
    NPC: npcSchema,
    SCENE: sceneSchema,
    // Others use default/empty schemas or generic
    ARC: undefined,
    ACT: undefined,
    CHAPTER: undefined,
    BEAT: undefined,
    TIMELINE: undefined,
    NARRATIVE: undefined,
    NETWORK: undefined,
    CUSTOM: undefined,
    UNKNOWN: undefined,
    CREATURE: undefined,
    ORGANIZATION: undefined,
};

/**
 * Check if a field belongs to the primary schema for a given Kind
 */
export function isPrimaryField(kind: EntityKind | undefined, fieldName: string): boolean {
    if (!kind) return false;
    const schema = SCHEMAS[kind];
    if (!schema) return false;

    // Iterate all cards and fields to find match
    for (const card of schema.cards) {
        for (const field of card.fields) {
            if (field.name === fieldName) return true;
        }
    }
    return false;
}
