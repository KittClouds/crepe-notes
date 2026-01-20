
import { describe, it, expect, vi } from 'vitest';
import { GraphStoreAdapter } from './graph';
import { GraphObjectStore } from '@/lib/opfs';

describe('GraphStoreAdapter', () => {
    it('redirects inserts to GraphObjectStore', async () => {
        // Mock GraphObjectStore
        const mockGraphStore = {
            saveObject: vi.fn(),
            deleteObject: vi.fn()
        } as unknown as GraphObjectStore;

        const adapter = new GraphStoreAdapter(mockGraphStore);
        await adapter.connect();

        // Nebula Insert
        const doc = { id: 'note-1', title: 'My Note', content: 'Body Text' };
        await adapter.insert('notes', doc);

        // Verify Graph Call
        expect(mockGraphStore.saveObject).toHaveBeenCalledWith(
            'note-1',
            'notes',
            'Body Text',
            'text/plain',
            expect.objectContaining({ title: 'My Note' })
        );
    });

    it('redirects deletes to GraphObjectStore', async () => {
        const mockGraphStore = {
            saveObject: vi.fn(),
            deleteObject: vi.fn()
        } as unknown as GraphObjectStore;

        const adapter = new GraphStoreAdapter(mockGraphStore);
        await adapter.insert('notes', { id: 'note-1' }); // Seed memory

        await adapter.delete('notes', { id: 'note-1' });

        expect(mockGraphStore.deleteObject).toHaveBeenCalledWith('note-1');
    });
});
