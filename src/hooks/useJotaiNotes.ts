/**
 * useJotaiNotes - Compatibility shim
 * 
 * Maps our V2 useNotesStore to the old Jotai interface
 * so legacy fact-sheet components work without modification.
 */
import { useNotesStore } from '@/hooks/useNotesStore';
import type { Note, Folder } from '@/types/noteTypes';

/**
 * Hook that provides the same interface as legacy useJotaiNotes
 */
export function useJotaiNotes() {
    const {
        state,
        updateNote,
        createNote,
        deleteNote,
        selectNote,
        createFolder,
        updateFolder,
        deleteFolder,
    } = useNotesStore();

    // Get selected note
    const selectedNote = state.notes.find(n => n.id === state.selectedNoteId) || null;

    // Favorite notes
    const favoriteNotes = state.notes.filter(n => n.favorite);

    // Global notes (notes without folder)
    const globalNotes = state.notes.filter(n => !n.folderId);

    /**
     * Update note content
     */
    const updateNoteContent = async (id: string, content: string) => {
        await updateNote(id, { markdownContent: content, content });
    };

    /**
     * Get entity note by ID
     */
    const getEntityNote = (id: string): Note | undefined => {
        return state.notes.find(n => n.id === id);
    };

    /**
     * Create new note (returns Note)
     */
    const handleCreateNote = async (
        folderId?: string,
        title?: string,
        _sourceNoteId?: string
    ): Promise<Note> => {
        const noteId = await createNote({
            title: title || 'Untitled Note',
            folderId: folderId || null,
            markdownContent: '',
        });

        // Return a basic note object
        return {
            id: noteId,
            title: title || 'Untitled Note',
            content: '',
            markdownContent: '',
            folderId: folderId || null,
            favorite: false,
            isEntity: false,
            tags: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        } as unknown as Note;
    };

    /**
     * Create folder (returns Folder)
     */
    const handleCreateFolder = async (
        name: string,
        parentId?: string,
        options?: {
            entityKind?: string;
            isTypedRoot?: boolean;
            color?: string;
        }
    ): Promise<Folder> => {
        const folderId = await createFolder(name, parentId, options);

        return {
            id: folderId,
            name,
            parentId: parentId || null,
            entityKind: options?.entityKind,
            isTypedRoot: options?.isTypedRoot,
            color: options?.color,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        } as unknown as Folder;
    };

    return {
        state: {
            notes: state.notes,
            folders: state.folders,
            isSaving: state.isSaving,
            lastSaved: state.lastSaved,
            searchQuery: state.searchQuery || '',
            selectedNoteId: state.selectedNoteId,
            openNoteIds: state.openNoteIds || [],
        },
        selectedNote,
        favoriteNotes,
        globalNotes,
        folderTree: state.folders, // Simplified
        selectNote,
        closeNote: (id: string) => {
            // Stub - we'd need to implement open tabs
            console.log('[useJotaiNotes] closeNote stub:', id);
        },
        setSearchQuery: (_q: string) => {
            // Stub
        },
        createNote: handleCreateNote,
        updateNote: async (id: string, updates: Partial<Note>) => {
            await updateNote(id, updates);
        },
        updateNoteContent,
        deleteNote: async (id: string) => {
            await deleteNote(id);
        },
        getEntityNote,
        createFolder: handleCreateFolder,
        updateFolder: async (id: string, updates: Partial<Folder>) => {
            await updateFolder(id, updates);
        },
        deleteFolder: async (id: string) => {
            await deleteFolder(id);
        },
    };
}

// Granular hooks for backward compat
export function useSelectedNote() {
    const { selectedNote } = useJotaiNotes();
    return selectedNote;
}

export function useSelectedNoteId(): [string | null, (id: string) => void] {
    const { state, selectNote } = useJotaiNotes();
    return [state.selectedNoteId, selectNote];
}

export function useFolderTree() {
    const { folderTree } = useJotaiNotes();
    return folderTree;
}

export function useFavoriteNotes() {
    const { favoriteNotes } = useJotaiNotes();
    return favoriteNotes;
}

export function useNoteUpdater() {
    const { updateNote, updateNoteContent } = useJotaiNotes();
    return {
        updateContent: updateNoteContent,
        updateNote,
    };
}
