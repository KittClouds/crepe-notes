// src/api/editor-api.ts
// EditorApi interface + Tauri/Mock implementations
// Clean boundary between frontend and backend

import type { Note, NoteCreateParams, NoteUpdateParams } from './types';

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
}

// =============================================================================
// TAURI IMPLEMENTATION (Production)
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
}

// =============================================================================
// MOCK IMPLEMENTATION (Development without Tauri)
// =============================================================================

const STORAGE_KEY = 'crepe-notes-mock-db';

function getMockDb(): { notes: Record<string, Note> } {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        return JSON.parse(stored);
    }
    return { notes: {} };
}

function saveMockDb(db: { notes: Record<string, Note> }): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

export class MockEditorApi implements EditorApi {
    async getNote(worldId: string, noteId: string): Promise<Note | null> {
        await this.simulateLatency();
        const db = getMockDb();
        const note = db.notes[noteId];
        if (note && note.worldId === worldId) {
            return note;
        }
        return null;
    }

    async createNote(params: NoteCreateParams): Promise<Note> {
        await this.simulateLatency();
        const db = getMockDb();
        const now = Date.now();
        const note: Note = {
            id: crypto.randomUUID(),
            worldId: params.worldId,
            title: params.title,
            content: params.content || '',
            folderId: params.folderId,
            entityKind: params.entityKind,
            entitySubtype: params.entitySubtype,
            isEntity: params.isEntity || false,
            isPinned: false,
            favorite: false,
            createdAt: now,
            updatedAt: now,
        };
        db.notes[note.id] = note;
        saveMockDb(db);
        console.log('[MockEditorApi] Created note:', note.id, note.title);
        return note;
    }

    async updateNote(params: NoteUpdateParams): Promise<Note> {
        await this.simulateLatency();
        const db = getMockDb();
        const existing = db.notes[params.id];
        if (!existing) {
            throw new Error(`Note not found: ${params.id}`);
        }

        const updated: Note = {
            ...existing,
            title: params.title ?? existing.title,
            content: params.content ?? existing.content,
            folderId: params.folderId ?? existing.folderId,
            entityKind: params.entityKind ?? existing.entityKind,
            entitySubtype: params.entitySubtype ?? existing.entitySubtype,
            isEntity: params.isEntity ?? existing.isEntity,
            isPinned: params.isPinned ?? existing.isPinned,
            favorite: params.favorite ?? existing.favorite,
            updatedAt: Date.now(),
        };

        db.notes[params.id] = updated;
        saveMockDb(db);
        console.log('[MockEditorApi] Updated note:', params.id);
        return updated;
    }

    async deleteNote(worldId: string, noteId: string): Promise<boolean> {
        await this.simulateLatency();
        const db = getMockDb();
        if (db.notes[noteId] && db.notes[noteId].worldId === worldId) {
            delete db.notes[noteId];
            saveMockDb(db);
            console.log('[MockEditorApi] Deleted note:', noteId);
            return true;
        }
        return false;
    }

    async listNotes(worldId: string): Promise<Note[]> {
        await this.simulateLatency();
        const db = getMockDb();
        return Object.values(db.notes).filter(n => n.worldId === worldId);
    }

    private simulateLatency(): Promise<void> {
        // Simulate network latency (50-150ms)
        const delay = 50 + Math.random() * 100;
        return new Promise(resolve => setTimeout(resolve, delay));
    }
}

// =============================================================================
// FACTORY
// =============================================================================

let _instance: EditorApi | null = null;

/**
 * Get the EditorApi instance.
 * Uses TauriEditorApi in Tauri environment, MockEditorApi in browser.
 */
export function getEditorApi(): EditorApi {
    if (_instance) return _instance;

    // Check if we're in Tauri
    const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

    if (isTauri) {
        console.log('[EditorApi] Using TauriEditorApi');
        _instance = new TauriEditorApi();
    } else {
        console.log('[EditorApi] Using MockEditorApi (localStorage)');
        _instance = new MockEditorApi();
    }

    return _instance;
}

/**
 * Override the EditorApi instance (for testing).
 */
export function setEditorApi(api: EditorApi): void {
    _instance = api;
}
