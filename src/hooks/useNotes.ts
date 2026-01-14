// src/hooks/useNotes.ts
// TanStack Query hooks for notes - server state management

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    getAllNotes,
    getNoteById,
    createNote as createNoteStorage,
    updateNote as updateNoteStorage,
    deleteNote as deleteNoteStorage,
} from '@/lib/storage';
import type { Note } from '@/types/noteTypes';

// Query key factory
export const noteKeys = {
    all: ['notes'] as const,
    detail: (id: string) => ['notes', id] as const,
};

// Fetch all notes
export function useNotes() {
    return useQuery({
        queryKey: noteKeys.all,
        queryFn: () => {
            const notes = getAllNotes();
            // Don't overwrite content - it may contain JSON doc
            // Only set content if it's empty and markdownContent exists
            return notes.map(n => ({
                ...n,
                // If content already exists (JSON doc), keep it. Otherwise use markdown.
                content: n.content || n.markdownContent || '',
            })) as Note[];
        },
        staleTime: Infinity, // localStorage doesn't change externally
    });
}

// Fetch single note
export function useNote(id: string | null) {
    return useQuery({
        queryKey: noteKeys.detail(id || ''),
        queryFn: () => id ? getNoteById(id) : null,
        enabled: !!id,
        staleTime: Infinity,
    });
}

// Create note mutation
export function useCreateNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (params: { folderId?: string; title?: string }): Promise<Note> => {
            const note = createNoteStorage({
                title: params.title || 'Untitled Note',
                folderId: params.folderId || null,
            });
            // Keep content as-is, only set if empty
            return {
                ...note,
                content: note.content || note.markdownContent || ''
            } as Note;
        },
        onSuccess: (newNote) => {
            queryClient.setQueryData<Note[]>(noteKeys.all, (old) =>
                old ? [newNote, ...old] : [newNote]
            );
        },
    });
}

// Update note mutation
export function useUpdateNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Partial<Note> }): Promise<Note | undefined> => {
            return updateNoteStorage(id, updates as any);
        },
        onMutate: async ({ id, updates }) => {
            await queryClient.cancelQueries({ queryKey: noteKeys.all });
            const previousNotes = queryClient.getQueryData<Note[]>(noteKeys.all);

            queryClient.setQueryData<Note[]>(noteKeys.all, (old) =>
                old?.map(n => n.id === id ? { ...n, ...updates } : n)
            );

            return { previousNotes };
        },
        onError: (_, __, context) => {
            if (context?.previousNotes) {
                queryClient.setQueryData(noteKeys.all, context.previousNotes);
            }
        },
    });
}

// Delete note mutation
export function useDeleteNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string): Promise<string> => {
            const success = deleteNoteStorage(id);
            if (!success) throw new Error('Failed to delete note');
            return id;
        },
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: noteKeys.all });
            const previousNotes = queryClient.getQueryData<Note[]>(noteKeys.all);

            queryClient.setQueryData<Note[]>(noteKeys.all, (old) =>
                old?.filter(n => n.id !== id)
            );

            return { previousNotes };
        },
        onError: (_, __, context) => {
            if (context?.previousNotes) {
                queryClient.setQueryData(noteKeys.all, context.previousNotes);
            }
        },
    });
}
