import { Note, Folder, Tag } from '@/types/notes';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEYS = {
  NOTES: 'inkwell_notes',
  FOLDERS: 'inkwell_folders',
  TAGS: 'inkwell_tags',
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

// Helper to get data from localStorage
function getStorageItem<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    if (!item) return defaultValue;
    return JSON.parse(item, (key, value) => {
      if (key === 'createdAt' || key === 'updatedAt') {
        return new Date(value);
      }
      return value;
    });
  } catch {
    return defaultValue;
  }
}

// Helper to set data in localStorage
function setStorageItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Failed to save to localStorage: ${key}`, error);
  }
}

// Notes CRUD operations
export function getAllNotes(): Note[] {
  return getStorageItem<Note[]>(STORAGE_KEYS.NOTES, []);
}

export function getNoteById(id: string): Note | undefined {
  const notes = getAllNotes();
  return notes.find((note) => note.id === id);
}

export function createNote(partial?: Partial<Note>): Note {
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

  const notes = getAllNotes();
  notes.unshift(note);
  setStorageItem(STORAGE_KEYS.NOTES, notes);

  return note;
}

export function updateNote(id: string, updates: Partial<Note>): Note | undefined {
  const notes = getAllNotes();
  const index = notes.findIndex((note) => note.id === id);

  if (index === -1) return undefined;

  const updatedNote = {
    ...notes[index],
    ...updates,
    updatedAt: new Date(),
  };

  notes[index] = updatedNote;
  setStorageItem(STORAGE_KEYS.NOTES, notes);

  return updatedNote;
}

export function deleteNote(id: string): boolean {
  const notes = getAllNotes();
  const filteredNotes = notes.filter((note) => note.id !== id);

  if (filteredNotes.length === notes.length) return false;

  setStorageItem(STORAGE_KEYS.NOTES, filteredNotes);
  return true;
}

// Current note management
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
export function getAllFolders(): Folder[] {
  return getStorageItem<Folder[]>(STORAGE_KEYS.FOLDERS, []);
}

export interface CreateFolderOptions {
  entityKind?: string;
  entitySubtype?: string;
  entityLabel?: string;
  color?: string;
  isTypedRoot?: boolean;
  isSubtypeRoot?: boolean;
}

export function createFolder(name: string, parentId: string | null = null, options?: CreateFolderOptions): Folder {
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

  const folders = getAllFolders();
  folders.push(folder);
  setStorageItem(STORAGE_KEYS.FOLDERS, folders);

  return folder;
}

export function updateFolder(id: string, updates: Partial<Folder>): Folder | undefined {
  const folders = getAllFolders();
  const index = folders.findIndex((folder) => folder.id === id);

  if (index === -1) return undefined;

  const updatedFolder = {
    ...folders[index],
    ...updates,
    updatedAt: new Date(),
  };

  folders[index] = updatedFolder;
  setStorageItem(STORAGE_KEYS.FOLDERS, folders);

  return updatedFolder;
}

export function deleteFolder(id: string): boolean {
  const folders = getAllFolders();
  const filteredFolders = folders.filter((folder) => folder.id !== id);

  if (filteredFolders.length === folders.length) return false;

  setStorageItem(STORAGE_KEYS.FOLDERS, filteredFolders);
  return true;
}

// Tags CRUD operations
export function getAllTags(): Tag[] {
  return getStorageItem<Tag[]>(STORAGE_KEYS.TAGS, []);
}

export function createTag(name: string, color: string = '#3b82f6'): Tag {
  const tag: Tag = {
    id: uuidv4(),
    name,
    color,
    ownerId: 'local-user',
  };

  const tags = getAllTags();
  tags.push(tag);
  setStorageItem(STORAGE_KEYS.TAGS, tags);

  return tag;
}

// Search functionality
export function searchNotes(query: string): Note[] {
  const notes = getAllNotes();
  const lowerQuery = query.toLowerCase();

  return notes.filter((note) =>
    note.title.toLowerCase().includes(lowerQuery) ||
    note.markdownContent.toLowerCase().includes(lowerQuery) ||
    note.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
  );
}

// Find note by title (for wikilink resolution)
export function findNoteByTitle(title: string): Note | null {
  const notes = getAllNotes();
  const lowerTitle = title.toLowerCase();

  // Exact match first
  const exact = notes.find(note => note.title.toLowerCase() === lowerTitle);
  if (exact) return exact;

  // Partial match fallback
  const partial = notes.find(note => note.title.toLowerCase().includes(lowerTitle));
  return partial || null;
}

// Initialize with a default note if none exist
export function initializeStorage(): Note {
  const notes = getAllNotes();

  if (notes.length === 0) {
    return createNote({
      title: 'Getting Started',
    });
  }

  return notes[0];
}
