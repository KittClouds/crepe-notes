import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dexieDb, type DexieNote } from './db';

// Query keys
export const noteKey = (id: string) => ['note', id] as const;
export const notesListKey = () => ['notes'] as const;
export const decorationsKey = (noteId: string) => ['decorations', noteId] as const;

// Read note from Dexie (instant)
export function useNote(noteId: string | null) {
    return useQuery({
        queryKey: noteKey(noteId ?? ''),
        enabled: !!noteId,
        queryFn: async () => {
            const note = await dexieDb.notes.get(noteId!);
            if (!note || note.status === 'deleted') return null;
            return note;
        },
        staleTime: Infinity,        // Never stale - we control invalidation
        gcTime: 1000 * 60 * 30,     // Keep 30 min
    });
}

// Update note with optimistic update
export function useUpdateNote() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ noteId, patch }: {
            noteId: string;
            patch: Partial<DexieNote>
        }) => {
            const updated = { ...patch, updatedAt: Date.now(), syncedAt: null };
            await dexieDb.notes.update(noteId, updated);
            return await dexieDb.notes.get(noteId);
        },
        onMutate: async ({ noteId, patch }) => {
            await qc.cancelQueries({ queryKey: noteKey(noteId) });
            const prev = qc.getQueryData<DexieNote>(noteKey(noteId));

            qc.setQueryData<DexieNote>(noteKey(noteId), (curr) =>
                curr ? { ...curr, ...patch, updatedAt: Date.now() } : curr!
            );

            return { prev };
        },
        onError: (_err, vars, ctx) => {
            if (ctx?.prev) qc.setQueryData(noteKey(vars.noteId), ctx.prev);
        },
        onSettled: () => {
            qc.invalidateQueries({ queryKey: notesListKey() });
        },
    });
}

// Soft delete (tombstone)
export function useDeleteNote() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (noteId: string) => {
            await dexieDb.notes.update(noteId, {
                status: 'deleted',
                content: '',           // Clear heavy data
                markdownContent: '',
                updatedAt: Date.now(),
                syncedAt: null,
            });
        },
        onSuccess: (_, noteId) => {
            qc.invalidateQueries({ queryKey: noteKey(noteId) });
            qc.invalidateQueries({ queryKey: notesListKey() });
        },
    });
}
