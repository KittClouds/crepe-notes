// src/api/editor-api.ts
// EditorApi interface + Web/Tauri implementations
// Clean boundary between frontend and backend

import type { Note, NoteCreateParams, NoteUpdateParams } from './types';
import {
    getAllNotes,
    getNoteById,
    createNote,
    updateNote,
    deleteNote,
    searchNotes
} from '@/lib/storage';

// =============================================================================
// EDITOR API INTERFACE
// =============================================================================

export interface EditorApi {
    // Note operations
    getNote(worldId: string, noteId: string): Promise<Note | null>;
    createNote(params: NoteCreateParams): Promise<Note>;
    updateNote(params: NoteUpdateParams): Promise<Note>;
    deleteNote(worldId: string, noteId: string): Promise<boolean>;
    listNotes(worldId: string): Promise<Note[]>;
    searchNotes(worldId: string, query: string): Promise<Note[]>;
}

// =============================================================================
// TAURI IMPLEMENTATION (Native)
// =============================================================================

export class TauriEditorApi implements EditorApi {
    async getNote(worldId: string, noteId: string): Promise<Note | null> {
        const { invoke } = await import('@tauri-apps/api/core');
        const result = await invoke<string | null>('content.get_note', {
            worldId,
            id: noteId,
        });
        return result ? JSON.parse(result) : null;
    }

    async createNote(params: NoteCreateParams): Promise<Note> {
        const { invoke } = await import('@tauri-apps/api/core');
        const result = await invoke<string>('content.create_note', {
            params: JSON.stringify({
                world_id: params.worldId,
                title: params.title,
                content: params.content,
                folder_id: params.folderId,
                entity_kind: params.entityKind,
                entity_subtype: params.entitySubtype,
                is_entity: params.isEntity,
            }),
        });
        return JSON.parse(result);
    }

    async updateNote(params: NoteUpdateParams): Promise<Note> {
        const { invoke } = await import('@tauri-apps/api/core');
        const result = await invoke<string>('content.update_note', {
            params: JSON.stringify({
                world_id: params.worldId,
                id: params.id,
                title: params.title,
                content: params.content,
                folder_id: params.folderId,
                entity_kind: params.entityKind,
                entity_subtype: params.entitySubtype,
                is_entity: params.isEntity,
                is_pinned: params.isPinned,
                favorite: params.favorite,
            }),
        });
        return JSON.parse(result);
    }

    async deleteNote(worldId: string, noteId: string): Promise<boolean> {
        const { invoke } = await import('@tauri-apps/api/core');
        return invoke<boolean>('content.delete_note', {
            worldId,
            id: noteId,
        });
    }

    async listNotes(worldId: string): Promise<Note[]> {
        const { invoke } = await import('@tauri-apps/api/core');
        const result = await invoke<string>('content.list_notes', { worldId });
        return JSON.parse(result);
    }

    async searchNotes(worldId: string, query: string): Promise<Note[]> {
        // Fallback if not implemented in Tauri yet, or add invoke
        const notes = await this.listNotes(worldId);
        return notes.filter(n => n.title.toLowerCase().includes(query.toLowerCase()));
    }
}

// =============================================================================
// WEB IMPLEMENTATION (NebulaDB)
// =============================================================================

export class WebEditorApi implements EditorApi {
    async getNote(worldId: string, noteId: string): Promise<Note | null> {
        const note = await getNoteById(noteId);
        // Map backend type if needed, strict check on worldId ignored for local webapp
        return note ? (note as unknown as Note) : null;
    }

    async createNote(params: NoteCreateParams): Promise<Note> {
        const note = await createNote({
            title: params.title,
            // mapping content to markdownContent (storage uses markdownContent)
            markdownContent: params.content,
            folderId: params.folderId,
            entityKind: params.entityKind as any,
            entitySubtype: params.entitySubtype,
            isEntity: params.isEntity,
        });
        return note as unknown as Note;
    }

    async updateNote(params: NoteUpdateParams): Promise<Note> {
        const updates: any = {
            title: params.title,
            markdownContent: params.content, // map
            folderId: params.folderId,
            entityKind: params.entityKind,
            entitySubtype: params.entitySubtype,
            isEntity: params.isEntity,
            isPinned: params.isPinned ? 1 : 0, // boolean to number if needed or keeps boolean
            favorite: params.favorite ? 1 : 0,
        };

        // Clean undefined
        Object.keys(updates).forEach(key => updates[key] === undefined && delete updates[key]);

        const updated = await updateNote(params.id, updates);
        if (!updated) throw new Error(`Note not found: ${params.id}`);
        return updated as unknown as Note;
    }

    async deleteNote(worldId: string, noteId: string): Promise<boolean> {
        return await deleteNote(noteId);
    }

    async listNotes(worldId: string): Promise<Note[]> {
        const notes = await getAllNotes();
        return notes as unknown as Note[];
    }

    async searchNotes(worldId: string, query: string): Promise<Note[]> {
        const results = await searchNotes(query);
        return results as unknown as Note[];
    }
}

// =============================================================================
// FACTORY
// =============================================================================

let _instance: EditorApi | null = null;

/**
 * Get the EditorApi instance.
 * Uses TauriEditorApi in Tauri environment, WebEditorApi in browser.
 */
export function getEditorApi(): EditorApi {
    if (_instance) return _instance;

    // Check if we're in Tauri
    const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

    if (isTauri) {
        console.log('[EditorApi] Using TauriEditorApi');
        _instance = new TauriEditorApi();
    } else {
        console.log('[EditorApi] Using WebEditorApi (NebulaDB)');
        _instance = new WebEditorApi();
    }

    return _instance;
}

/**
 * Override the EditorApi instance (for testing).
 */
export function setEditorApi(api: EditorApi): void {
    _instance = api;
}
