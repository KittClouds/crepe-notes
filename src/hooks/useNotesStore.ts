// src/hooks/useNotesStore.ts
// Composite hook combining TanStack Query (server state) + UI state (client state)
// This is the single API for all note/folder operations across the app

import { useMemo, useEffect } from 'react';
import { useNotes, useCreateNote, useUpdateNote, useDeleteNote } from './useNotes';
import { useFolders, useCreateFolder, useUpdateFolder, useDeleteFolder, buildFolderTree } from './useFolders';
import { useUIState } from '@/contexts/UIStateContext';
import type { Note, FolderWithChildren } from '@/types/noteTypes';

export function useNotesStore() {
    // Server state from TanStack Query
    const { data: notes = [], isLoading: notesLoading } = useNotes();
    const { data: folders = [], isLoading: foldersLoading } = useFolders();

    // Mutations
    const createNoteMutation = useCreateNote();
    const updateNoteMutation = useUpdateNote();
    const deleteNoteMutation = useDeleteNote();
    const createFolderMutation = useCreateFolder();
    const updateFolderMutation = useUpdateFolder();
    const deleteFolderMutation = useDeleteFolder();

    // UI state
    const { state: uiState, selectNote, closeNote, setSearchQuery, initializeWithNotes } = useUIState();

    // Auto-select first note on load
    useEffect(() => {
        if (notes.length > 0 && !uiState.selectedNoteId) {
            initializeWithNotes(notes.map(n => n.id));
        }
    }, [notes, uiState.selectedNoteId, initializeWithNotes]);

    // Build folder tree
    const folderTree = useMemo((): FolderWithChildren[] => {
        return buildFolderTree(folders, notes);
    }, [folders, notes]);

    // Notes without folder
    const globalNotes = useMemo(() => {
        return notes.filter(n => !n.folderId && !n.parent_id);
    }, [notes]);

    // Favorite notes
    const favoriteNotes = useMemo(() => {
        return notes.filter(n => n.favorite === 1);
    }, [notes]);

    // Wrapped CRUD functions
    const createNote = (folderId?: string, title?: string) => {
        const result = createNoteMutation.mutate({ folderId, title });
        // Get the created note ID and select it
        // Note: We use onSuccess in the mutation to handle this
        return result;
    };

    const updateNote = (id: string, updates: Partial<Note>) => {
        return updateNoteMutation.mutate({ id, updates });
    };

    const deleteNote = (id: string) => {
        closeNote(id); // Close tab first
        return deleteNoteMutation.mutate(id);
    };

    const createFolder = (name: string, parentId?: string | null, options?: any) => {
        return createFolderMutation.mutate({ name, parentId, options });
    };

    const updateFolder = (id: string, updates: any) => {
        return updateFolderMutation.mutate({ id, updates });
    };

    const deleteFolder = (id: string) => {
        return deleteFolderMutation.mutate(id);
    };

    // Combined state object for backwards compatibility
    const state = {
        notes,
        folders,
        selectedNoteId: uiState.selectedNoteId,
        openNoteIds: uiState.openNoteIds,
        searchQuery: uiState.searchQuery,
        isLoading: notesLoading || foldersLoading,
    };

    return {
        state,
        folderTree,
        globalNotes,
        favoriteNotes,
        createNote,
        updateNote,
        deleteNote,
        createFolder,
        updateFolder,
        deleteFolder,
        selectNote,
        closeNote,
        setSearchQuery,
    };
}
