// src/lib/types/entityAttributes.ts
// Shared types for Entity Attributes and Fact Sheets

export type FieldType =
    | 'text' | 'number' | 'array' | 'object' | 'boolean'
    | 'slider' | 'counter' | 'toggle' | 'date' | 'color'
    | 'rating' | 'tags' | 'entity-link' | 'rich-text' | 'progress'
    | 'dropdown' | 'stat-grid' | 'relationship' | 'relationship-slot' | 'network-membership';

export interface EntityAttribute {
    id: string;
    entityId: string;
    fieldName: string;
    fieldType: FieldType;
    value: any;
    schemaId?: string;
    cardId?: string;
    createdAt: number;
    updatedAt: number;
}

export interface MetaCard {
    id: string;
    ownerId: string;
    name: string;
    color?: string;
    icon?: string;
    displayOrder: number;
    isCollapsed: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface MetaCardField {
    id: string;
    cardId: string;
    fieldName: string;
    schemaId?: string;
    customSchema?: FieldSchema;
    layoutHint?: 'full' | 'half' | 'third' | 'quarter';
    displayOrder: number;
}

export interface FieldSchema {
    id: string;
    name: string;
    fieldType: FieldType;
    label: string;
    description?: string;
    metadata?: Record<string, any>;
    validation?: ValidationRule[];
    defaultValue?: any;
    isSystem: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface ValidationRule {
    type: 'required' | 'min' | 'max' | 'pattern' | 'custom';
    value?: any;
    message: string;
}
