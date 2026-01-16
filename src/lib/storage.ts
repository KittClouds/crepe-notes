import { Note, Folder, Tag } from '@/types/notes';
import { v4 as uuidv4 } from 'uuid';
import { db, Collections } from './db';

const STORAGE_KEYS = {
  CURRENT_NOTE_ID: 'inkwell_current_note_id',
} as const;

// Default note content for new notes
const DEFAULT_NOTE_CONTENT = `# Welcome to Inkwell

Start writing your thoughts here. This editor supports **Markdown** formatting.

## Features

- **Bold** and *italic* text
- Lists and checkboxes
- Code blocks with syntax highlighting
- Tables and images
- And much more...

Happy writing! ✨
`;

// Notes CRUD operations
export async function getAllNotes(): Promise<Note[]> {
  const notes = await db.collection(Collections.NOTES).find({});
  // db returns Document[], cast to Note[]
  // Since we store dates as strings/numbers in JSON/IDB usually, we might need hydration if Note expects Date objects
  // NebulaDB (via IndexedDB) can store Date objects natively! 
  return notes as unknown as Note[];
}

export async function getNoteById(id: string): Promise<Note | undefined> {
  const note = await db.collection(Collections.NOTES).findOne({ id });
  return note as unknown as Note | undefined;
}

export async function createNote(partial?: Partial<Note>): Promise<Note> {
  const now = new Date();
  const note: Note = {
    id: uuidv4(),
    title: partial?.title ?? 'Untitled Note',
    markdownContent: partial?.markdownContent ?? DEFAULT_NOTE_CONTENT,
    folderId: partial?.folderId ?? null,
    tags: partial?.tags ?? [],
    createdAt: now,
    updatedAt: now,
    ownerId: partial?.ownerId ?? 'local-user',
  };

  await db.collection(Collections.NOTES).insert(note as any);
  return note;
}

export async function updateNote(id: string, updates: Partial<Note>): Promise<Note | undefined> {
  // We need to fetch current to merge? Or usage update operator?
  // Our NebulaDB adapter supports $set which is partial update.
  // But we need to return the updated object.
  // Ideally: update -> findOne

  const now = new Date();
  const actualUpdates = { ...updates, updatedAt: now };

  const count = await db.collection(Collections.NOTES).update(
    { id },
    { $set: actualUpdates }
  );

  if (count === 0) return undefined;

  return getNoteById(id);
}

export async function deleteNote(id: string): Promise<boolean> {
  const count = await db.collection(Collections.NOTES).delete({ id });
  return count > 0;
}

// Current note management (UI State - keep in localStorage for now or move to DB settings?)
// Keeping in localStorage is faster for sync initialization of UI routers.
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

// Folders CRUD operations
export async function getAllFolders(): Promise<Folder[]> {
  const folders = await db.collection(Collections.FOLDERS).find({});
  return folders as unknown as Folder[];
}

export interface CreateFolderOptions {
  entityKind?: string;
  entitySubtype?: string;
  entityLabel?: string;
  color?: string;
  isTypedRoot?: boolean;
  isSubtypeRoot?: boolean;
}

export async function createFolder(name: string, parentId: string | null = null, options?: CreateFolderOptions): Promise<Folder> {
  const now = new Date();
  const folder: Folder = {
    id: uuidv4(),
    name,
    parentId,
    ownerId: 'local-user',
    createdAt: now,
    updatedAt: now,
    // Entity properties
    entityKind: options?.entityKind,
    entitySubtype: options?.entitySubtype,
    entityLabel: options?.entityLabel,
    color: options?.color,
    isTypedRoot: options?.isTypedRoot,
    isSubtypeRoot: options?.isSubtypeRoot,
  };

  await db.collection(Collections.FOLDERS).insert(folder as any);
  return folder;
}

export async function updateFolder(id: string, updates: Partial<Folder>): Promise<Folder | undefined> {
  const now = new Date();
  const actualUpdates = { ...updates, updatedAt: now };

  const count = await db.collection(Collections.FOLDERS).update(
    { id },
    { $set: actualUpdates }
  );

  if (count === 0) return undefined;

  // Return full object
  const folder = await db.collection(Collections.FOLDERS).findOne({ id });
  return folder as unknown as Folder;
}

export async function deleteFolder(id: string): Promise<boolean> {
  const count = await db.collection(Collections.FOLDERS).delete({ id });
  return count > 0;
}

// Tags CRUD operations
export async function getAllTags(): Promise<Tag[]> {
  const tags = await db.collection(Collections.TAGS).find({});
  return tags as unknown as Tag[];
}

export async function createTag(name: string, color: string = '#3b82f6'): Promise<Tag> {
  const tag: Tag = {
    id: uuidv4(),
    name,
    color,
    ownerId: 'local-user',
  };

  await db.collection(Collections.TAGS).insert(tag as any);
  return tag;
}

// Search functionality
export async function searchNotes(query: string): Promise<Note[]> {
  // Full text search in NebulaDB is not implemented efficiently yet, so we fetch all and filter.
  // Or usage $contains if we implemented it?
  // The 'MemoryAdapter' implements match logic. 'IndexedDBAdapter' does find() -> filter in memory.
  // So this logic can remain similar but async.

  const notes = await getAllNotes();
  const lowerQuery = query.toLowerCase();

  return notes.filter((note) =>
    note.title.toLowerCase().includes(lowerQuery) ||
    note.markdownContent.toLowerCase().includes(lowerQuery) ||
    note.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
  );
}

// Find note by title (for wikilink resolution)
export async function findNoteByTitle(title: string): Promise<Note | null> {
  // Optimize: query DB directly?
  // DB query: { title: { $eq: title } } (case sensitive in basic impl)
  // We need case insensitive.
  // For now, fetch all is safest until we add normalized indexes.

  const notes = await getAllNotes();
  const lowerTitle = title.toLowerCase();

  // Exact match first
  const exact = notes.find(note => note.title.toLowerCase() === lowerTitle);
  if (exact) return exact;

  // Partial match fallback
  const partial = notes.find(note => note.title.toLowerCase().includes(lowerTitle));
  return partial || null;
}

// Initialize with a default note if none exist
export async function initializeStorage(): Promise<Note> {
  // This might be called on app mount.
  const notes = await getAllNotes();

  if (notes.length === 0) {
    return createNote({
      title: 'Getting Started',
    });
  }

  return notes[0];
}

