export interface Note {
  id: string;
  title: string;
  markdownContent: string;
  folderId: string | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  ownerId: string;
}

export interface NoteVersion {
  id: string;
  noteId: string;
  markdownContent: string;
  createdAt: Date;
  createdBy: string;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  ownerId: string;
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

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

export interface EditorState {
  currentNote: Note | null;
  syncStatus: SyncStatus;
  collaborators: User[];
  isReadOnly: boolean;
}
