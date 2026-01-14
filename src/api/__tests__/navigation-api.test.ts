// src/api/__tests__/navigation-api.test.ts
// Tests for NavigationApi - protects critical navigation path
//
// Run with: npx vitest run src/api/__tests__/navigation-api.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getNavigationApi } from '../navigation-api';

describe('NavigationApi', () => {
    beforeEach(() => {
        // Reset state between tests
        const api = getNavigationApi();
        api.setNotes([]);
        api.setCurrentNoteId(null);
    });

    describe('handler subscription', () => {
        it('should fire handler when navigating by ID', () => {
            const api = getNavigationApi();
            const handler = vi.fn();

            api.onNavigate(handler);
            api.navigateToNoteById('test-123');

            expect(handler).toHaveBeenCalledWith('test-123');
        });

        it('should allow unsubscribing handlers', () => {
            const api = getNavigationApi();
            const handler = vi.fn();

            const unsubscribe = api.onNavigate(handler);
            unsubscribe();
            api.navigateToNoteById('test-123');

            expect(handler).not.toHaveBeenCalled();
        });

        it('should support multiple handlers', () => {
            const api = getNavigationApi();
            const handler1 = vi.fn();
            const handler2 = vi.fn();

            api.onNavigate(handler1);
            api.onNavigate(handler2);
            api.navigateToNoteById('test-123');

            expect(handler1).toHaveBeenCalledWith('test-123');
            expect(handler2).toHaveBeenCalledWith('test-123');
        });
    });

    describe('note lookup', () => {
        it('should navigate to note by exact title match', () => {
            const api = getNavigationApi();
            const handler = vi.fn();

            api.setNotes([
                { id: 'note-1', title: 'My Note', content: '' } as any,
                { id: 'note-2', title: 'Other Note', content: '' } as any,
            ]);
            api.onNavigate(handler);
            api.navigateToNoteByTitle('My Note');

            expect(handler).toHaveBeenCalledWith('note-1');
        });

        it('should match title case-insensitively', () => {
            const api = getNavigationApi();
            const handler = vi.fn();

            api.setNotes([
                { id: 'note-1', title: 'My Note', content: '' } as any,
            ]);
            api.onNavigate(handler);
            api.navigateToNoteByTitle('my note');

            expect(handler).toHaveBeenCalledWith('note-1');
        });

        it('should find note by entity label', () => {
            const api = getNavigationApi();
            const handler = vi.fn();

            api.setNotes([
                { id: 'note-1', title: 'Sanji Profile', isEntity: 1, entityLabel: 'Sanji', content: '' } as any,
            ]);
            api.onNavigate(handler);
            api.navigateToNoteByTitle('Sanji');

            expect(handler).toHaveBeenCalledWith('note-1');
        });
    });

    describe('notes state injection', () => {
        it('should use injected notes for lookups', () => {
            const api = getNavigationApi();
            const handler = vi.fn();

            // First, no notes - should not navigate
            api.onNavigate(handler);
            api.navigateToNoteByTitle('Test');
            expect(handler).not.toHaveBeenCalled();

            // Now inject notes
            api.setNotes([
                { id: 'test-id', title: 'Test', content: '' } as any,
            ]);
            api.navigateToNoteByTitle('Test');
            expect(handler).toHaveBeenCalledWith('test-id');
        });

        it('should update notes without affecting handlers', () => {
            const api = getNavigationApi();
            const handler = vi.fn();

            api.onNavigate(handler);

            // Update notes multiple times
            api.setNotes([{ id: 'v1', title: 'V1', content: '' } as any]);
            api.setNotes([{ id: 'v2', title: 'V2', content: '' } as any]);
            api.setNotes([{ id: 'v3', title: 'V3', content: '' } as any]);

            // Handler should still work
            api.navigateToNoteByTitle('V3');
            expect(handler).toHaveBeenCalledWith('v3');
        });
    });
});
