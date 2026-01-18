/**
 * Scope Isolation Tests
 * 
 * Verifies the scope computation and filtering logic.
 */

import { describe, it, expect } from 'vitest';
import { computeNodeScope, computeActiveScope, getNotesInScope } from '@/lib/scope/computeNodeScope';
import type { ArboristNode } from '@/lib/arborist/types';

// =============================================================================
// computeNodeScope Tests
// =============================================================================

describe('computeNodeScope', () => {
    it('global note has note scope with self ID', () => {
        const node: ArboristNode = {
            id: 'note-123',
            name: 'Global Note',
            type: 'note',
            narrativeId: undefined,
        };

        const scope = computeNodeScope(node);

        expect(scope.scopeType).toBe('note');
        expect(scope.scopeId).toBe('note-123');
        expect(scope.narrativeId).toBeUndefined();
    });

    it('folder has folder scope with self ID', () => {
        const node: ArboristNode = {
            id: 'folder-456',
            name: 'My Folder',
            type: 'folder',
            narrativeId: undefined,
        };

        const scope = computeNodeScope(node);

        expect(scope.scopeType).toBe('folder');
        expect(scope.scopeId).toBe('folder-456');
        expect(scope.narrativeId).toBeUndefined();
    });

    it('note inside narrative has narrative scope (vault-wide)', () => {
        const node: ArboristNode = {
            id: 'note-789',
            name: 'Chapter 1',
            type: 'note',
            narrativeId: 'narrative-001', // Inside a narrative vault
        };

        const scope = computeNodeScope(node);

        expect(scope.scopeType).toBe('narrative');
        expect(scope.scopeId).toBe('narrative-001'); // Uses vault ID, not note ID
        expect(scope.narrativeId).toBe('narrative-001');
    });

    it('folder inside narrative has narrative scope', () => {
        const node: ArboristNode = {
            id: 'arc-folder-123',
            name: 'East Blue Arc',
            type: 'folder',
            narrativeId: 'narrative-one-piece',
        };

        const scope = computeNodeScope(node);

        expect(scope.scopeType).toBe('narrative');
        expect(scope.scopeId).toBe('narrative-one-piece');
        expect(scope.narrativeId).toBe('narrative-one-piece');
    });
});

// =============================================================================
// computeActiveScope Tests
// =============================================================================

describe('computeActiveScope', () => {
    it('null selection returns global scope', () => {
        const scope = computeActiveScope(null);

        expect(scope.type).toBe('folder');
        expect(scope.id).toBe('vault:global');
        expect(scope.narrativeId).toBeUndefined();
    });

    it('note selection returns note scope', () => {
        const node: ArboristNode = {
            id: 'selected-note',
            name: 'Test Note',
            type: 'note',
        };

        const scope = computeActiveScope(node);

        expect(scope.type).toBe('note');
        expect(scope.id).toBe('selected-note');
    });

    it('folder selection returns folder scope', () => {
        const node: ArboristNode = {
            id: 'selected-folder',
            name: 'Test Folder',
            type: 'folder',
        };

        const scope = computeActiveScope(node);

        expect(scope.type).toBe('folder');
        expect(scope.id).toBe('selected-folder');
    });
});

// =============================================================================
// getNotesInScope Tests
// =============================================================================

describe('getNotesInScope', () => {
    const sampleTree: ArboristNode[] = [
        {
            id: 'folder-1',
            name: 'Folder 1',
            type: 'folder',
            children: [
                { id: 'note-a', name: 'Note A', type: 'note' },
                { id: 'note-b', name: 'Note B', type: 'note' },
            ],
        },
        {
            id: 'note-global',
            name: 'Global Note',
            type: 'note',
        },
    ];

    it('note scope returns single note', () => {
        const scope = { type: 'note' as const, id: 'note-a' };
        const notes = getNotesInScope(scope, sampleTree);

        expect(notes).toEqual(['note-a']);
    });

    it('folder scope returns all notes in folder', () => {
        const scope = { type: 'folder' as const, id: 'folder-1' };
        const notes = getNotesInScope(scope, sampleTree);

        expect(notes).toContain('note-a');
        expect(notes).toContain('note-b');
        expect(notes).not.toContain('note-global');
    });

    it('missing node returns empty array', () => {
        const scope = { type: 'folder' as const, id: 'non-existent' };
        const notes = getNotesInScope(scope, sampleTree);

        expect(notes).toEqual([]);
    });
});

// =============================================================================
// Integration: Entity Scoping Acceptance Tests
// =============================================================================

describe('Scope Isolation Acceptance', () => {
    it('two global notes are isolated from each other', () => {
        const noteA: ArboristNode = { id: 'note-A', name: 'Note A', type: 'note' };
        const noteB: ArboristNode = { id: 'note-B', name: 'Note B', type: 'note' };

        const scopeA = computeActiveScope(noteA);
        const scopeB = computeActiveScope(noteB);

        // They should have different scope IDs
        expect(scopeA.id).not.toBe(scopeB.id);
        expect(scopeA.id).toBe('note-A');
        expect(scopeB.id).toBe('note-B');
    });

    it('folder aggregates notes, but note is isolated', () => {
        const tree: ArboristNode[] = [{
            id: 'folder-F',
            name: 'Folder F',
            type: 'folder',
            children: [
                { id: 'F-note-1', name: 'Note 1', type: 'note' },
                { id: 'F-note-2', name: 'Note 2', type: 'note' },
            ],
        }];

        // Folder scope includes both notes
        const folderNotes = getNotesInScope({ type: 'folder', id: 'folder-F' }, tree);
        expect(folderNotes).toHaveLength(2);

        // Individual note scope includes only itself
        const noteNotes = getNotesInScope({ type: 'note', id: 'F-note-1' }, tree);
        expect(noteNotes).toEqual(['F-note-1']);
    });

    it('narrative vault aggregates all descendants', () => {
        const tree: ArboristNode[] = [{
            id: 'narrative-V',
            name: 'Narrative Vault',
            type: 'folder',
            isNarrativeRoot: true,
            narrativeId: 'narrative-V',
            children: [
                {
                    id: 'arc-1',
                    name: 'Arc 1',
                    type: 'folder',
                    narrativeId: 'narrative-V',
                    children: [
                        { id: 'ch-1', name: 'Chapter 1', type: 'note', narrativeId: 'narrative-V' },
                    ],
                },
                { id: 'overview', name: 'Overview', type: 'note', narrativeId: 'narrative-V' },
            ],
        }];

        // Selecting narrative returns narrative scope
        const scope = computeActiveScope(tree[0]);
        expect(scope.type).toBe('narrative');
        expect(scope.id).toBe('narrative-V');

        // All descendant notes are in scope
        const notes = getNotesInScope({ type: 'narrative' as any, id: 'narrative-V' }, tree);
        // Note: current implementation treats 'narrative' type like 'folder' for note collection
        expect(notes).toContain('ch-1');
        expect(notes).toContain('overview');
    });
});
