/**
 * Storage Layer - CozoDB Backend
 * 
 * Storage Layer - CozoDB backend for notes, folders, tags.
 * Keeps function signatures for backwards compatibility.
 */

import { Note, Folder, Tag } from '@/types/notes';
import type { EntityKind } from '@/lib/types/entityTypes';
import { NoteRepo, FolderRepo, TagRepo } from './storage/content';
// CalendarRepo removed - now in Rust/OPFS backend
// Import Dexie types (what the repos actually return)
import type {
  Note as DexieNote,
  Folder as DexieFolder,
  Tag as DexieTag,
} from '@/lib/dexie/db';


const STORAGE_KEYS = {
  CURRENT_NOTE_ID: 'inkwell_current_note_id',
} as const;

const DEFAULT_WORLD_ID = 'default';

// =============================================================================
// TYPE ADAPTERS (Dexie -> Legacy)
// =============================================================================

function dexieNoteToLegacy(dexie: DexieNote): Note {
  return {
    id: dexie.id,
    title: dexie.title,
    content: dexie.content,
    markdownContent: dexie.markdownContent,
    folderId: dexie.folderId || null,
    tags: [], // Tags stored separately via note_tags relation
    createdAt: new Date(dexie.createdAt),
    updatedAt: new Date(dexie.updatedAt),
    ownerId: dexie.ownerId,
    isEntity: dexie.isEntity,
    entityKind: (dexie.entityKind || undefined) as EntityKind | undefined,
    entitySubtype: dexie.entitySubtype || undefined,
    favorite: dexie.favorite ? 1 : 0,
    isPinned: dexie.isPinned ? 1 : 0,
  };
}

function dexieFolderToLegacy(dexie: DexieFolder): Folder {
  // Detect if this is a narrative vault root
  const isNarrativeRoot = dexie.entityKind === 'NARRATIVE' || dexie.isNarrativeRoot;

  return {
    id: dexie.id,
    name: dexie.name,
    parentId: dexie.parentId || null,
    ownerId: dexie.ownerId,
    createdAt: new Date(dexie.createdAt),
    updatedAt: new Date(dexie.updatedAt),
    color: dexie.color || undefined,
    entityKind: (dexie.entityKind || undefined) as EntityKind | undefined,
    entitySubtype: dexie.entitySubtype || undefined,
    entityLabel: dexie.entityLabel || undefined,
    isTypedRoot: dexie.isTypedRoot,
    // Narrative Vault Isolation
    isNarrativeRoot,
    // narrativeId is propagated by arborist adapter, not stored in DB
    // NARRATIVE folders have narrativeId = self.id
    narrativeId: isNarrativeRoot ? dexie.id : (dexie.narrativeId || undefined),
  };
}

function dexieTagToLegacy(dexie: DexieTag): Tag {
  return {
    id: dexie.id,
    name: dexie.name,
    color: dexie.color,
    ownerId: dexie.ownerId,
  };
}

// =============================================================================
// Notes CRUD operations
// =============================================================================

export async function getAllNotes(): Promise<Note[]> {
  const notes = await NoteRepo.listAll(DEFAULT_WORLD_ID);
  return notes.map(dexieNoteToLegacy);
}

export async function getNoteById(id: string): Promise<Note | undefined> {
  const note = await NoteRepo.get(id);
  return note ? dexieNoteToLegacy(note) : undefined;
}

export async function createNote(partial?: Partial<Note>): Promise<Note> {
  const defaultContent = partial?.markdownContent ?? partial?.content ?? '';

  const note = await NoteRepo.create({
    worldId: DEFAULT_WORLD_ID,
    title: partial?.title ?? 'Untitled Note',
    content: defaultContent,
    markdownContent: defaultContent,
    folderId: partial?.folderId ?? null,
    entityKind: partial?.entityKind,
    entitySubtype: partial?.entitySubtype,
    isEntity: !!partial?.isEntity,
  });

  return dexieNoteToLegacy(note);
}

export async function updateNote(id: string, updates: Partial<Note>): Promise<Note | undefined> {
  const updated = await NoteRepo.update(id, {
    title: updates.title,
    content: updates.content,
    markdownContent: updates.markdownContent ?? updates.content,
    folderId: updates.folderId,
    entityKind: updates.entityKind ?? null,
    entitySubtype: updates.entitySubtype ?? null,
    isEntity: updates.isEntity !== undefined ? !!updates.isEntity : undefined,
    isPinned: updates.isPinned !== undefined ? !!updates.isPinned : undefined,
    favorite: updates.favorite !== undefined ? !!updates.favorite : undefined,
  });

  return updated ? dexieNoteToLegacy(updated) : undefined;
}

export async function deleteNote(id: string): Promise<boolean> {
  return await NoteRepo.delete(id);
}

// Current note management (UI State - localStorage)
export function getCurrentNoteId(): string | null {
  return localStorage.getItem(STORAGE_KEYS.CURRENT_NOTE_ID);
}

export function setCurrentNoteId(id: string | null): void {
  if (id) {
    localStorage.setItem(STORAGE_KEYS.CURRENT_NOTE_ID, id);
  } else {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_NOTE_ID);
  }
}

// =============================================================================
// Folders CRUD operations
// =============================================================================

export async function getAllFolders(): Promise<Folder[]> {
  const folders = await FolderRepo.listAll(DEFAULT_WORLD_ID);
  return folders.map(dexieFolderToLegacy);
}

export interface CreateFolderOptions {
  entityKind?: EntityKind;
  entitySubtype?: string;
  entityLabel?: string;
  color?: string;
  isTypedRoot?: boolean;
  isSubtypeRoot?: boolean;
}

export async function createFolder(
  name: string,
  parentId: string | null = null,
  options?: CreateFolderOptions
): Promise<Folder> {
  const folder = await FolderRepo.create({
    worldId: DEFAULT_WORLD_ID,
    name,
    parentId,
    entityKind: options?.entityKind,
    entitySubtype: options?.entitySubtype,
    entityLabel: options?.entityLabel,
    color: options?.color,
    isTypedRoot: options?.isTypedRoot,
    isSubtypeRoot: options?.isSubtypeRoot,
  });

  return dexieFolderToLegacy(folder);
}

export async function updateFolder(id: string, updates: Partial<Folder>): Promise<Folder | undefined> {
  const updated = await FolderRepo.update(id, {
    name: updates.name,
    parentId: updates.parentId,
    entityKind: updates.entityKind ?? null,
    entitySubtype: updates.entitySubtype ?? null,
    entityLabel: updates.entityLabel ?? null,
    color: updates.color ?? null,
    collapsed: undefined, // Not in legacy type
  });

  return updated ? dexieFolderToLegacy(updated) : undefined;
}

export async function deleteFolder(id: string): Promise<boolean> {
  return await FolderRepo.delete(id);
}

// =============================================================================
// Tags CRUD operations
// =============================================================================

export async function getAllTags(): Promise<Tag[]> {
  const tags = await TagRepo.listAll(DEFAULT_WORLD_ID);
  return tags.map(dexieTagToLegacy);
}

export async function createTag(name: string, color: string = '#3b82f6'): Promise<Tag> {
  const tag = await TagRepo.create({
    worldId: DEFAULT_WORLD_ID,
    name,
    color,
  });

  return dexieTagToLegacy(tag);
}

// =============================================================================
// Search functionality
// =============================================================================

export async function searchNotes(query: string): Promise<Note[]> {
  const notes = await NoteRepo.search(query, DEFAULT_WORLD_ID);
  return notes.map(dexieNoteToLegacy);
}

export async function findNoteByTitle(title: string): Promise<Note | null> {
  const note = await NoteRepo.findByTitle(title, DEFAULT_WORLD_ID);
  return note ? dexieNoteToLegacy(note) : null;
}

// =============================================================================
// Initialization
// =============================================================================

export async function initializeStorage(): Promise<Note> {
  const notes = await getAllNotes();

  if (notes.length === 0) {
    return createNote({
      title: 'Getting Started',
    });
  }

  return notes[0];
}


