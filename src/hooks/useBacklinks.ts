// src/hooks/useBacklinks.ts
// Computes backlinks for the current note by scanning all notes for wikilinks

import { useMemo } from 'react';
import type { Note } from '@/types/noteTypes';

export interface BacklinkItem {
    /** Source note that links to current note */
    sourceNoteId: string;
    sourceNoteTitle: string;
    /** The wikilink text as it appears in source */
    linkText: string;
    /** Context snippet around the wikilink */
    context?: string;
}

export interface BacklinksResult {
    /** All backlinks to the current note */
    backlinks: BacklinkItem[];
    /** Total count */
    count: number;
    /** Grouped by source note */
    grouped: Record<string, BacklinkItem[]>;
}

/**
 * Wikilink pattern: <<Title>> or <<Title|Alias>>
 * Also matches [[Title]] style
 */
const WIKILINK_PATTERNS = [
    /<<([^|>]+)(?:\|[^>]+)?>>/, // <<Title>> or <<Title|Alias>>
    /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/, // [[Title]] or [[Title|Alias]]
];

/**
 * Extract all wikilink targets from content
 */
function extractWikilinkTargets(content: string): string[] {
    const targets: string[] = [];

    // Global patterns
    const globalPatterns = [
        /<<([^|>]+)(?:\|[^>]+)?>>/g,
        /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g,
    ];

    for (const pattern of globalPatterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
            if (match[1]) {
                targets.push(match[1].trim().toLowerCase());
            }
        }
    }

    return targets;
}

/**
 * Get context around a wikilink match
 */
function getContextSnippet(content: string, target: string, maxLength = 80): string | undefined {
    const lowerContent = content.toLowerCase();
    const lowerTarget = target.toLowerCase();

    // Find position of target in any wikilink format
    const patterns = [
        `<<${lowerTarget}`,
        `[[${lowerTarget}`,
    ];

    for (const pattern of patterns) {
        const idx = lowerContent.indexOf(pattern);
        if (idx !== -1) {
            const start = Math.max(0, idx - 30);
            const end = Math.min(content.length, idx + target.length + 50);
            let snippet = content.slice(start, end);
            if (start > 0) snippet = '...' + snippet;
            if (end < content.length) snippet = snippet + '...';
            return snippet;
        }
    }

    return undefined;
}

/**
 * Hook to compute backlinks for a given note
 */
export function useBacklinks(currentNote: Note | null, allNotes: Note[]): BacklinksResult {
    return useMemo(() => {
        if (!currentNote || !currentNote.title) {
            return { backlinks: [], count: 0, grouped: {} };
        }

        const currentTitle = currentNote.title.toLowerCase();
        const backlinks: BacklinkItem[] = [];

        for (const note of allNotes) {
            // Skip self
            if (note.id === currentNote.id) continue;

            // Get content as string
            const content = typeof note.content === 'string'
                ? note.content
                : JSON.stringify(note.content);

            // Extract wikilink targets
            const targets = extractWikilinkTargets(content);

            // Check if any target matches current note title
            if (targets.includes(currentTitle)) {
                backlinks.push({
                    sourceNoteId: note.id,
                    sourceNoteTitle: note.title,
                    linkText: currentNote.title,
                    context: getContextSnippet(content, currentNote.title),
                });
            }
        }

        // Group by source note
        const grouped: Record<string, BacklinkItem[]> = {};
        for (const bl of backlinks) {
            if (!grouped[bl.sourceNoteTitle]) {
                grouped[bl.sourceNoteTitle] = [];
            }
            grouped[bl.sourceNoteTitle].push(bl);
        }

        return {
            backlinks,
            count: backlinks.length,
            grouped,
        };
    }, [currentNote?.id, currentNote?.title, allNotes]);
}
