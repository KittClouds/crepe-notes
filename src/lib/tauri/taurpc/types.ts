// src/lib/tauri/taurpc/types.ts
// TauRPC Types - Mirrors Rust structs with #[taurpc::ipc_type]
// These will be replaced by auto-generated bindings when running `pnpm tauri dev`

// ============================================================================
// Core Types
// ============================================================================

export interface HealthStatus {
    ok: boolean;
    version: string;
}

// ============================================================================
// Content Types
// ============================================================================

export interface Note {
    id: string;
    world_id: string;
    title: string;
    content?: string;
    folder_id?: string;
    entity_kind?: string;
    entity_subtype?: string;
    entity_label?: string;
    is_entity: boolean;
    is_pinned: boolean;
    favorite: boolean;
    created_at: string;
    updated_at: string;
}

export interface Folder {
    id: string;
    world_id: string;
    name: string;
    parent_id?: string;
    entity_kind?: string;
    entity_subtype?: string;
    color?: string;
    collapsed: boolean;
    is_typed_root: boolean;
    created_at: string;
    updated_at: string;
}

export interface Entity {
    id: string;
    world_id: string;
    label: string;
    entity_kind: string;
    entity_subtype?: string;
    note_id?: string;
    folder_id?: string;
    aliases: string[];
    attributes?: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}

export interface Relationship {
    id: string;
    world_id: string;
    source_id: string;
    target_id: string;
    relationship_code: string;
    network_id?: string;
    strength: number;
    start_date?: number;
    end_date?: number;
    notes?: string;
    attributes?: Record<string, unknown>;
    created_at: string;
}

export interface CalendarEvent {
    id: string;
    world_id: string;
    calendar_id: string;
    title: string;
    description?: string;
    date_year: number;
    date_month: number;
    date_day: number;
    date_hour?: number;
    date_minute?: number;
    all_day: boolean;
    category?: string;
    tags: string[];
    color?: string;
    icon?: string;
    entity_id?: string;
    entity_kind?: string;
    source_note_id?: string;
    created_at: string;
}

export interface Period {
    id: string;
    world_id: string;
    calendar_id: string;
    name: string;
    start_year: number;
    start_month?: number;
    end_year?: number;
    end_month?: number;
    color: string;
    description?: string;
    parent_id?: string;
    period_type?: string;
    icon?: string;
}

export interface FieldBinding {
    id: string;
    world_id: string;
    source_entity_id: string;
    source_field_name: string;
    target_entity_id: string;
    target_field_name: string;
    binding_type: string;
    transform?: Record<string, unknown>;
    aggregation_fn?: string;
    allow_override: boolean;
    created_at: string;
}

export interface Network {
    id: string;
    world_id: string;
    name: string;
    schema_id: string;
    root_folder_id?: string;
    root_entity_id?: string;
    namespace: string;
    description?: string;
    tags: string[];
    member_count: number;
    relationship_count: number;
    max_depth: number;
    created_at: string;
    updated_at: string;
}

// ============================================================================
// Scan Types
// ============================================================================

export interface ScanResult {
    entities: Array<{
        kind: string;
        label: string;
        start: number;
        end: number;
    }>;
    decorations: Array<{
        from: number;
        to: number;
        type: string;
        data?: Record<string, unknown>;
    }>;
}

export interface ResoRankResult {
    doc_id: string;
    title: string;
    score: number;
    snippet?: string;
}
