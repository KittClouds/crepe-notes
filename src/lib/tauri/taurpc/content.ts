// src/lib/tauri/taurpc/content.ts
// Content API Stub - Notes, Folders, Entities, Relationships, Calendar, Periods, Bindings
// Will be replaced by auto-generated TauRPC bindings

import { isTauri } from '../index';
import type { Note, Folder, Entity, Relationship, CalendarEvent, Period, FieldBinding, Network } from './types';

const DEFAULT_WORLD = 'default';

/**
 * Content API - matches Rust ContentApi trait
 * path = "content"
 */
export const contentApi = {
    // ========================================================================
    // Notes
    // ========================================================================
    async createNote(params: {
        world_id?: string;
        title: string;
        content?: string;
        folder_id?: string;
        entity_kind?: string;
        entity_subtype?: string;
        is_entity?: boolean;
    }): Promise<Note | null> {
        if (isTauri()) {
            // TODO: const result = await taurpc.content.create_note(JSON.stringify({...params, world_id: params.world_id ?? DEFAULT_WORLD}));
            // return JSON.parse(result);
        }
        console.warn('[contentApi.createNote] STUB');
        return null;
    },

    async getNote(id: string, worldId = DEFAULT_WORLD): Promise<Note | null> {
        if (isTauri()) {
            // TODO: const result = await taurpc.content.get_note(worldId, id);
            // return result ? JSON.parse(result) : null;
        }
        return null;
    },

    async listNotes(worldId = DEFAULT_WORLD): Promise<Note[]> {
        if (isTauri()) {
            // TODO: const result = await taurpc.content.list_notes(worldId);
            // return JSON.parse(result);
        }
        return [];
    },

    async updateNote(params: {
        world_id?: string;
        id: string;
        title?: string;
        content?: string;
        folder_id?: string;
        entity_kind?: string;
        entity_subtype?: string;
        is_entity?: boolean;
        is_pinned?: boolean;
        favorite?: boolean;
    }): Promise<Note | null> {
        if (isTauri()) {
            // TODO: const result = await taurpc.content.update_note(JSON.stringify({...params, world_id: params.world_id ?? DEFAULT_WORLD}));
            // return JSON.parse(result);
        }
        return null;
    },

    async deleteNote(id: string, worldId = DEFAULT_WORLD): Promise<boolean> {
        if (isTauri()) {
            // TODO: return taurpc.content.delete_note(worldId, id);
        }
        return false;
    },

    // ========================================================================
    // Folders
    // ========================================================================
    async createFolder(params: {
        world_id?: string;
        name: string;
        parent_id?: string;
        entity_kind?: string;
        entity_subtype?: string;
        color?: string;
        is_typed_root?: boolean;
    }): Promise<Folder | null> {
        if (isTauri()) {
            // TODO: const result = await taurpc.content.create_folder(JSON.stringify({...params, world_id: params.world_id ?? DEFAULT_WORLD}));
            // return JSON.parse(result);
        }
        return null;
    },

    async getFolder(id: string, worldId = DEFAULT_WORLD): Promise<Folder | null> {
        if (isTauri()) {
            // TODO
        }
        return null;
    },

    async listFolders(worldId = DEFAULT_WORLD): Promise<Folder[]> {
        if (isTauri()) {
            // TODO
        }
        return [];
    },

    async getFolderTree(worldId = DEFAULT_WORLD): Promise<Folder[]> {
        if (isTauri()) {
            // TODO
        }
        return [];
    },

    async updateFolder(params: {
        world_id?: string;
        id: string;
        name?: string;
        parent_id?: string;
        entity_kind?: string;
        entity_subtype?: string;
        color?: string;
        collapsed?: boolean;
    }): Promise<Folder | null> {
        if (isTauri()) {
            // TODO
        }
        return null;
    },

    async deleteFolder(id: string, worldId = DEFAULT_WORLD): Promise<boolean> {
        if (isTauri()) {
            // TODO
        }
        return false;
    },

    // ========================================================================
    // Entities
    // ========================================================================
    async createEntity(params: {
        world_id?: string;
        label: string;
        entity_kind: string;
        entity_subtype?: string;
        note_id?: string;
        folder_id?: string;
        aliases?: string[];
        attributes?: Record<string, unknown>;
    }): Promise<Entity | null> {
        if (isTauri()) {
            // TODO
        }
        return null;
    },

    async getEntity(id: string, worldId = DEFAULT_WORLD): Promise<Entity | null> {
        if (isTauri()) {
            // TODO
        }
        return null;
    },

    async listEntities(worldId = DEFAULT_WORLD): Promise<Entity[]> {
        if (isTauri()) {
            // TODO
        }
        return [];
    },

    async listEntitiesByKind(kind: string, worldId = DEFAULT_WORLD): Promise<Entity[]> {
        if (isTauri()) {
            // TODO
        }
        return [];
    },

    async deleteEntity(id: string, worldId = DEFAULT_WORLD): Promise<boolean> {
        if (isTauri()) {
            // TODO
        }
        return false;
    },

    // ========================================================================
    // Relationships
    // ========================================================================
    async createRelationship(params: {
        world_id?: string;
        source_id: string;
        target_id: string;
        relationship_code: string;
        network_id?: string;
        strength?: number;
        start_date?: number;
        end_date?: number;
        notes?: string;
        attributes?: Record<string, unknown>;
    }): Promise<Relationship | null> {
        if (isTauri()) {
            // TODO
        }
        return null;
    },

    async getRelationship(id: string, worldId = DEFAULT_WORLD): Promise<Relationship | null> {
        if (isTauri()) {
            // TODO
        }
        return null;
    },

    async getEntityRelationships(entityId: string, worldId = DEFAULT_WORLD): Promise<Relationship[]> {
        if (isTauri()) {
            // TODO
        }
        return [];
    },

    async deleteRelationship(id: string, worldId = DEFAULT_WORLD): Promise<boolean> {
        if (isTauri()) {
            // TODO
        }
        return false;
    },

    // ========================================================================
    // Calendar Events
    // ========================================================================
    async createCalEvent(params: {
        world_id?: string;
        calendar_id: string;
        title: string;
        date_year: number;
        date_month: number;
        date_day: number;
        description?: string;
        date_hour?: number;
        date_minute?: number;
        all_day?: boolean;
        category?: string;
        tags?: string[];
        color?: string;
        icon?: string;
        entity_id?: string;
        entity_kind?: string;
        source_note_id?: string;
    }): Promise<CalendarEvent | null> {
        if (isTauri()) {
            // TODO
        }
        return null;
    },

    async getCalEvent(id: string, worldId = DEFAULT_WORLD): Promise<CalendarEvent | null> {
        if (isTauri()) {
            // TODO
        }
        return null;
    },

    async listCalEvents(worldId = DEFAULT_WORLD): Promise<CalendarEvent[]> {
        if (isTauri()) {
            // TODO
        }
        return [];
    },

    async listCalEventsByMonth(year: number, month: number, worldId = DEFAULT_WORLD): Promise<CalendarEvent[]> {
        if (isTauri()) {
            // TODO
        }
        return [];
    },

    async deleteCalEvent(id: string, worldId = DEFAULT_WORLD): Promise<boolean> {
        if (isTauri()) {
            // TODO
        }
        return false;
    },

    // ========================================================================
    // Periods
    // ========================================================================
    async createPeriod(params: {
        world_id?: string;
        calendar_id: string;
        name: string;
        start_year: number;
        color: string;
        description?: string;
        start_month?: number;
        end_year?: number;
        end_month?: number;
        parent_id?: string;
        period_type?: string;
        icon?: string;
    }): Promise<Period | null> {
        if (isTauri()) {
            // TODO
        }
        return null;
    },

    async getPeriod(id: string, worldId = DEFAULT_WORLD): Promise<Period | null> {
        if (isTauri()) {
            // TODO
        }
        return null;
    },

    async listPeriods(worldId = DEFAULT_WORLD): Promise<Period[]> {
        if (isTauri()) {
            // TODO
        }
        return [];
    },

    async getPeriodChildren(parentId: string, worldId = DEFAULT_WORLD): Promise<Period[]> {
        if (isTauri()) {
            // TODO
        }
        return [];
    },

    async deletePeriod(id: string, worldId = DEFAULT_WORLD): Promise<boolean> {
        if (isTauri()) {
            // TODO
        }
        return false;
    },

    // ========================================================================
    // Field Bindings
    // ========================================================================
    async createBinding(params: {
        world_id?: string;
        source_entity_id: string;
        source_field_name: string;
        target_entity_id: string;
        target_field_name: string;
        binding_type: string;
        transform?: Record<string, unknown>;
        aggregation_fn?: string;
        allow_override?: boolean;
    }): Promise<FieldBinding | null> {
        if (isTauri()) {
            // TODO
        }
        return null;
    },

    async getBinding(id: string, worldId = DEFAULT_WORLD): Promise<FieldBinding | null> {
        if (isTauri()) {
            // TODO
        }
        return null;
    },

    async listBindings(worldId = DEFAULT_WORLD): Promise<FieldBinding[]> {
        if (isTauri()) {
            // TODO
        }
        return [];
    },

    async listBindingsByEntity(entityId: string, worldId = DEFAULT_WORLD): Promise<FieldBinding[]> {
        if (isTauri()) {
            // TODO
        }
        return [];
    },

    async deleteBinding(id: string, worldId = DEFAULT_WORLD): Promise<boolean> {
        if (isTauri()) {
            // TODO
        }
        return false;
    },

    // ========================================================================
    // Networks
    // ========================================================================
    async createNetwork(params: {
        world_id?: string;
        name: string;
        schema_id: string;
        root_folder_id?: string;
        root_entity_id?: string;
        namespace?: string;
        description?: string;
        tags?: string[];
    }): Promise<Network | null> {
        if (isTauri()) {
            // TODO
        }
        return null;
    },

    async getNetwork(id: string, worldId = DEFAULT_WORLD): Promise<Network | null> {
        if (isTauri()) {
            // TODO
        }
        return null;
    },

    async listNetworks(worldId = DEFAULT_WORLD): Promise<Network[]> {
        if (isTauri()) {
            // TODO
        }
        return [];
    },

    async deleteNetwork(id: string, worldId = DEFAULT_WORLD): Promise<boolean> {
        if (isTauri()) {
            // TODO
        }
        return false;
    },
};
