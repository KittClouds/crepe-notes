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
    const createNote = async (folderId?: string, title?: string) => {
        const result = await createNoteMutation.mutateAsync({ folderId, title });
        // Get the created note ID and select it
        // Note: We use onSuccess in the mutation to handle this
        return result;
    };

    const updateNote = async (id: string, updates: Partial<Note>) => {
        return await updateNoteMutation.mutateAsync({ id, updates });
    };

    const deleteNote = async (id: string) => {
        closeNote(id); // Close tab first
        return await deleteNoteMutation.mutateAsync(id);
    };

    const createFolder = async (name: string, parentId?: string | null, options?: any) => {
        return await createFolderMutation.mutateAsync({ name, parentId, options });
    };

    const updateFolder = async (id: string, updates: any) => {
        return await updateFolderMutation.mutateAsync({ id, updates });
    };

    const deleteFolder = async (id: string) => {
        return await deleteFolderMutation.mutateAsync(id);
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
