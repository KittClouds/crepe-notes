// src/types/notes.ts
// Re-export from noteTypes for backwards compatibility

export * from './noteTypes';

export interface NoteVersion {
  id: string;
  noteId: string;
  markdownContent: string;
  createdAt: Date;
  createdBy: string;
}

export interface SharePermission {
  id: string;
  noteId: string;
  userId: string;
  email: string;
  permission: 'viewer' | 'editor';
  createdAt: Date;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

export interface EditorState {
  currentNote: import('./noteTypes').Note | null;
  syncStatus: import('./noteTypes').SyncStatus;
  collaborators: User[];
  isReadOnly: boolean;
}
