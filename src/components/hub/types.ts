// src/components/hub/types.ts
// Hub Panel Types

export interface EntityStats {
    entityKind: string;
    entityLabel: string;
    mentionsInThisNote: number;
    totalMentions?: number;
}

// Entity Theme Types
export interface EntityThemeColor {
    kind: string;
    bg: string;
    border: string;
}

// Pattern Types
export interface PatternDef {
    id: string;
    name: string;
    pattern: string;
    entityKind?: string;
    description?: string;
    isActive: boolean;
}

// Field Types
export interface FieldDef {
    id: string;
    name: string;
    fieldType: string;
    label: string;
    description?: string;
    metadata?: Record<string, unknown>;
}

// Relationship Types
export interface RelationshipTypeDef {
    id: string;
    code: string;
    displayLabel: string;
    sourceKind: string;
    targetKind: string;
    cardinality: 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many';
    description?: string;
    isDirectional: boolean;
}

// Network Types (stub for rework)
export interface NetworkDef {
    id: string;
    name: string;
    schemaId: string;
    description?: string;
}
