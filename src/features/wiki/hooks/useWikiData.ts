/**
 * useWikiData Hook
 * Derives Wiki-specific data from notes state.
 * MIGRATED: Replaced Jotai with useNotesStore (TanStack-backed)
 */
import { useMemo } from 'react';
import { useNotesStore } from '@/hooks/useNotesStore';
import type { Note } from '@/types/noteTypes';
import { WIKI_CATEGORIES, type WikiCategory } from '../types/wikiTypes';

export interface WikiDataResult {
    /** All entity notes */
    entities: Note[];
    /** Recently updated notes (last 10) */
    recentlyUpdated: Note[];
    /** Get notes by entity kind */
    getByKind: (kind: string) => Note[];
    /** Get category stats */
    getCategoryStats: () => Array<{ category: WikiCategory; count: number }>;
    /** Get a single entity by ID */
    getEntityById: (id: string) => Note | undefined;
}

export function useWikiData(): WikiDataResult {
    const { state } = useNotesStore();
    const notes = state.notes;

    // Filter to only entity notes
    const entities = useMemo(() => {
        return notes.filter(n => n.isEntity);
    }, [notes]);

    // Recently updated (sorted by updated_at descending, take 10)
    const recentlyUpdated = useMemo(() => {
        return [...entities]
            .sort((a, b) => {
                const aTime = a.updatedAt instanceof Date ? a.updatedAt.getTime() : (a.updated_at || 0);
                const bTime = b.updatedAt instanceof Date ? b.updatedAt.getTime() : (b.updated_at || 0);
                return bTime - aTime;
            })
            .slice(0, 10);
    }, [entities]);

    // Get notes by entity kind
    const getByKind = useMemo(() => {
        return (kind: string): Note[] => {
            return entities.filter(n =>
                n.entityKind?.toUpperCase() === kind.toUpperCase()
            );
        };
    }, [entities]);

    // Get category stats
    const getCategoryStats = useMemo(() => {
        return () => {
            return WIKI_CATEGORIES.map(category => ({
                category,
                count: entities.filter(n =>
                    n.entityKind?.toUpperCase() === category.entityKind.toUpperCase()
                ).length,
            }));
        };
    }, [entities]);

    // Get entity by ID
    const getEntityById = useMemo(() => {
        return (id: string): Note | undefined => {
            return notes.find(n => n.id === id);
        };
    }, [notes]);

    return {
        entities,
        recentlyUpdated,
        getByKind,
        getCategoryStats,
        getEntityById,
    };
}
