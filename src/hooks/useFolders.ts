// src/hooks/useFolders.ts
// TanStack Query hooks for folders - server state management

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    getAllFolders,
    createFolder as createFolderStorage,
    updateFolder as updateFolderStorage,
    deleteFolder as deleteFolderStorage,
    type CreateFolderOptions,
} from '@/lib/storage';
import type { Folder, FolderWithChildren } from '@/types/noteTypes';
import type { EntityKind } from '@/lib/types/entityTypes';

// Query key factory
export const folderKeys = {
    all: ['folders'] as const,
};

interface FolderCreateOptions {
    entityKind?: EntityKind;
    entitySubtype?: string;
    entityLabel?: string;
    isTypedRoot?: boolean;
    isSubtypeRoot?: boolean;
    color?: string;
}

// Fetch all folders
export function useFolders() {
    return useQuery({
        queryKey: folderKeys.all,
        queryFn: getAllFolders, // storage.ts export is now async, which works with useQuery
        staleTime: Infinity,
    });
}

// Create folder mutation
export function useCreateFolder() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (params: { name: string; parentId?: string | null; options?: FolderCreateOptions }): Promise<Folder> => {
            // Pass options to storage layer so entityKind etc. are persisted
            const folder = await createFolderStorage(params.name, params.parentId || null, params.options as CreateFolderOptions);
            return folder;
        },
        onSuccess: (newFolder) => {
            queryClient.setQueryData<Folder[]>(folderKeys.all, (old) =>
                old ? [...old, newFolder] : [newFolder]
            );
        },
    });
}

// Update folder mutation
export function useUpdateFolder() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Partial<Folder> }): Promise<Folder | undefined> => {
            return await updateFolderStorage(id, updates);
        },
        onSuccess: (updatedFolder) => {
            if (!updatedFolder) return;
            queryClient.setQueryData<Folder[]>(folderKeys.all, (old) =>
                old?.map(f => f.id === updatedFolder.id ? updatedFolder : f)
            );
        },
    });
}

// Delete folder mutation
export function useDeleteFolder() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string): Promise<string> => {
            const success = await deleteFolderStorage(id);
            // if (!success) throw Error... ? logic in useFolders was simple before
            return id;
        },
        onSuccess: (id) => {
            queryClient.setQueryData<Folder[]>(folderKeys.all, (old) =>
                old?.filter(f => f.id !== id)
            );
        },
    });
}

// Build folder tree from flat data
export function buildFolderTree(folders: Folder[], notes: any[]): FolderWithChildren[] {
    const folderMap = new Map<string, FolderWithChildren>();

    for (const folder of folders) {
        folderMap.set(folder.id, { ...folder, children: [], notes: [] });
    }

    const roots: FolderWithChildren[] = [];
    for (const folder of folders) {
        const node = folderMap.get(folder.id)!;
        const parentId = folder.parentId || (folder as any).parent_id;

        if (parentId && folderMap.has(parentId)) {
            folderMap.get(parentId)!.children.push(node);
        } else {
            roots.push(node);
        }
    }

    for (const note of notes) {
        const folderId = note.folderId || (note as any).parent_id;
        if (folderId && folderMap.has(folderId)) {
            folderMap.get(folderId)!.notes.push(note);
        }
    }

    return roots;
}
