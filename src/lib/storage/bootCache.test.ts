import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveBootCache, loadBootCache, BootCacheSchema, BOOT_CACHE_KEY } from './bootCache';

const mockStore: Record<string, string> = {};

const localStorageMock = {
    getItem: vi.fn((key: string) => mockStore[key] || null),
    setItem: vi.fn((key: string, value: string) => {
        mockStore[key] = value.toString();
    }),
    removeItem: vi.fn((key: string) => {
        delete mockStore[key];
    }),
    clear: vi.fn(() => {
        for (const key in mockStore) delete mockStore[key];
    }),
    length: 0,
    key: vi.fn(),
};

describe('BootCache', () => {
    beforeEach(() => {
        // Clear mock store
        for (const key in mockStore) delete mockStore[key];

        // Inject mock
        vi.stubGlobal('localStorage', localStorageMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should return null if cache is missing', () => {
        const result = loadBootCache();
        expect(result).toBeNull();
    });

    it('should return null if cache is invalid JSON', () => {
        mockStore[BOOT_CACHE_KEY] = '{ invalid json';

        // Suppress console.warn for this test
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

        const result = loadBootCache();
        expect(result).toBeNull();

        consoleSpy.mockRestore();
    });

    it('should save and load valid cache', () => {
        const cache: BootCacheSchema = {
            version: 1,
            notes: [
                { id: '1', title: 'Note 1', updatedAt: 100, folderId: null, isEntity: false, tags: [], favorite: 0 },
            ],
            folders: [],
            lastOpenNoteId: '1',
        };

        saveBootCache(cache);

        // Check raw storage was updated
        expect(mockStore[BOOT_CACHE_KEY]).toBeDefined();

        const loaded = loadBootCache();
        expect(loaded).toEqual(cache);
    });

    it('should handle large payloads gracefully', () => {
        const notes = Array.from({ length: 1000 }).map((_, i) => ({
            id: String(i),
            title: `Note ${i}`,
            updatedAt: Date.now(),
            folderId: null,
            isEntity: false,
            tags: [],
            favorite: 0,
        }));

        const cache: BootCacheSchema = {
            version: 1,
            notes,
            folders: [],
        };

        saveBootCache(cache);
        const loaded = loadBootCache();
        expect(loaded?.notes).toHaveLength(1000);
    });
});
