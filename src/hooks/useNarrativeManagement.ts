
import { useCallback, useMemo } from 'react';
import { useNotes, useCreateNote, useUpdateNote } from './useNotes';
import { useFolders, useCreateFolder } from './useFolders';
import { useCalendarContext } from '@/contexts/CalendarContext';
import { Folder } from '@/types/noteTypes';
import { EntityKind } from '@/lib/types/entityTypes';

// Stub schema - simplified version
const NARRATIVE_FOLDER_SCHEMA = {
    allowedSubfolders: [
        { label: 'Chapter', entityKind: 'CHAPTER' as EntityKind, subtype: 'chapter', icon: 'book' },
        { label: 'Scene', entityKind: 'SCENE' as EntityKind, subtype: 'scene', icon: 'film' },
        { label: 'Act', entityKind: 'ACT' as EntityKind, subtype: 'act', icon: 'layers' },
    ],
    allowedNoteTypes: [
        { label: 'Event', entityKind: 'EVENT' as EntityKind, icon: 'calendar' },
        { label: 'Note', entityKind: 'NOTE' as EntityKind, icon: 'file-text' },
    ]
};

export interface NarrativeOption {
    type: 'folder' | 'note';
    label: string;
    entityKind: EntityKind;
    subtype?: string;
    icon?: string;
}

export interface NarrativeRoot {
    id: string;
    name: string;
}


export function useNarrativeManagement() {
    const { data: folders = [] } = useFolders();
    const { data: notes = [] } = useNotes();
    const createFolderMutation = useCreateFolder();
    const createNoteMutation = useCreateNote();
    const updateNoteMutation = useUpdateNote();

    // 1. Identify Narrative Roots
    const narrativeRoots = useMemo(() => {
        const roots: NarrativeRoot[] = [];

        for (const folder of folders) {
            const kind = (folder as any).entityKind || (folder as any).entity_kind;
            if (kind === 'NARRATIVE') {
                roots.push({ id: folder.id, name: folder.name });
            }
        }

        return roots;
    }, [folders]);


    // 2. Get Available Types (Schema Aware)
    const getAvailableTypes = useCallback((): NarrativeOption[] => {
        const options: NarrativeOption[] = [];

        NARRATIVE_FOLDER_SCHEMA.allowedSubfolders?.forEach(sub => {
            options.push({
                type: 'folder',
                label: `Add ${sub.label}`,
                entityKind: sub.entityKind || 'UNKNOWN',
                subtype: sub.subtype,
                icon: sub.icon
            });
        });

        NARRATIVE_FOLDER_SCHEMA.allowedNoteTypes?.forEach(note => {
            options.push({
                type: 'note',
                label: note.label,
                entityKind: note.entityKind || 'UNKNOWN',
                icon: note.icon
            });
        });

        return options;
    }, []);

    // 3. Create Narrative Root
    const createNarrativeRoot = useCallback(async (name: string) => {
        const folder = await createFolderMutation.mutateAsync({
            name,
            parentId: null,
            options: { entityKind: 'NARRATIVE' }
        });
        return folder;
    }, [createFolderMutation]);

    // 4. Create Node strictly inside a Root
    const createNarrativeNode = useCallback(async (
        rootId: string,
        title: string,
        option: NarrativeOption,
        date: { year: number, month: number, day: number }
    ) => {
        let parentId = rootId;

        // Find container in root's children
        const rootFolder = folders.find(f => f.id === rootId);
        if (rootFolder) {
            const containerMap: Record<string, string> = {
                'CHARACTER': 'Characters',
                'SCENE': 'Scenes',
                'CHAPTER': 'Chapters',
                'ACT': 'Acts',
                'EVENT': 'Events'
            };
            const targetName = containerMap[option.entityKind];

            if (targetName) {
                const existingContainer = folders.find(f =>
                    f.parentId === rootId && f.name === targetName
                );

                if (existingContainer) {
                    parentId = existingContainer.id;
                } else {
                    // Create Container if missing
                    const newContainer = await createFolderMutation.mutateAsync({
                        name: targetName,
                        parentId: rootId,
                        options: { entityKind: option.entityKind }
                    });
                    parentId = newContainer.id;
                }
            }
        }

        // Create the Entity
        const frontmatter = `---
type: ${option.entityKind}
title: ${title}
fantasy_date:
  year: ${date.year}
  month: ${date.month}
  day: ${date.day}
---

# ${title}

`;

        let entityId: string;

        if (option.type === 'folder') {
            const folder = await createFolderMutation.mutateAsync({
                name: title,
                parentId,
                options: {
                    entityKind: option.entityKind,
                    entitySubtype: option.subtype,
                }
            });
            entityId = folder.id;
        } else {
            const note = await createNoteMutation.mutateAsync({
                folderId: parentId,
                title
            });
            await updateNoteMutation.mutateAsync({
                id: note.id,
                updates: { markdownContent: frontmatter }
            });
            entityId = note.id;
        }

        return { id: entityId, kind: option.entityKind };

    }, [createFolderMutation, createNoteMutation, updateNoteMutation, folders]);

    return {
        narrativeRoots,
        createNarrativeRoot,
        createNarrativeNode,
        getAvailableTypes
    };
}
