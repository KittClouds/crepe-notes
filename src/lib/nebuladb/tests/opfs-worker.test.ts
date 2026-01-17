import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpfsHardenedSnapshotAdapter, OpfsSnapshotError } from '../persistence/opfs-core';

// Crypto Web API Polyfill for Node environment
import { webcrypto } from 'node:crypto';
if (!global.crypto) {
    global.crypto = webcrypto as any;
}

// Mock File System Objects
class MockFileSystemWritable {
    constructor(private file: MockFileHandle) { }
    async write(content: string) {
        this.file.content = content;
    }
    async close() { }
}

class MockFile {
    constructor(private content: string) { }
    get size() { return this.content.length; }
    text() { return Promise.resolve(this.content); }
}

class MockFileHandle {
    kind = 'file' as const;
    content: string = '';

    constructor(public name: string) { }

    getFile() {
        return Promise.resolve(new MockFile(this.content));
    }

    createWritable({ mode }: { mode?: string } = {}) {
        if (mode === 'exclusive' && this.content !== '') {
            // Emulate simplistic locking/existence check logic if we wanted, 
            // but for unit test we just assume success unless we explicitly throw.
        }
        return Promise.resolve(new MockFileSystemWritable(this));
    }

    async move(nameOrDir: string | any) {
        // Renaming in mock directory
        const newName = typeof nameOrDir === 'string' ? nameOrDir : nameOrDir.name;
        // In a real mock, we'd need access to the parent directory to rename keys.
        // We'll rely on the directory mock to handle this logic or expose a helper.
    }
}

class MockDirectoryHandle {
    kind = 'directory' as const;
    files = new Map<string, MockFileHandle>();

    async getFileHandle(name: string, options?: { create?: boolean }) {
        if (this.files.has(name)) {
            return this.files.get(name)!;
        }
        if (options?.create) {
            const file = new MockFileHandle(name);
            // Patch move to work with this directory
            file.move = async (targetName: string) => {
                this.files.set(targetName, file);
                this.files.delete(name);
                file.name = targetName;
            };
            this.files.set(name, file);
            return file;
        }
        const err = new Error('Not Found');
        err.name = 'NotFoundError';
        throw err;
    }
}

// Setup Global Mocks
const mockRoot = new MockDirectoryHandle();

const mockNavigator = {
    storage: {
        getDirectory: vi.fn().mockResolvedValue(mockRoot),
        estimate: vi.fn().mockResolvedValue({ usage: 100, quota: 1000 }),
    }
};

vi.stubGlobal('navigator', mockNavigator);
vi.stubGlobal('TextEncoder', TextEncoder); // Use Node's
vi.stubGlobal('TextDecoder', TextDecoder);

describe('OpfsHardenedSnapshotAdapter', () => {
    let adapter: OpfsHardenedSnapshotAdapter;

    beforeEach(() => {
        adapter = new OpfsHardenedSnapshotAdapter('test.db');
        mockRoot.files.clear();
    });

    it('should save and load a snapshot correctly', async () => {
        const data = { foo: 'bar', num: 123 };

        await adapter.save(data);

        // Check if file exists
        expect(mockRoot.files.has('test.db')).toBe(true);

        // Load it back
        const loaded = await adapter.load();
        expect(loaded).toEqual(data);
    });

    it('should rotate previous snapshot to .bak', async () => {
        const v1 = { version: 1 };
        const v2 = { version: 2 };

        await adapter.save(v1);
        await adapter.save(v2);

        expect(mockRoot.files.has('test.db')).toBe(true);
        expect(mockRoot.files.has('test.db.bak')).toBe(true);

        const loaded = await adapter.load();
        expect(loaded).toEqual(v2);
    });

    it('should fallback to .bak if primary is corrupt', async () => {
        const goodParams = { good: true };
        await adapter.save(goodParams);

        // Move to bak manually (simulating a save rotation)
        const primary = mockRoot.files.get('test.db')!;
        await primary.move('test.db.bak');

        // Create a corrupt primary
        const corruptFile = new MockFileHandle('test.db');
        corruptFile.content = '{{{{ INVALID JSON';
        mockRoot.files.set('test.db', corruptFile);

        // Load should fallback
        const loaded = await adapter.load();
        expect(loaded).toEqual(goodParams);
    });

    it('should detect hash mismatch', async () => {
        const data = { secret: 'data' };
        await adapter.save(data);

        // Tamper with content but keep JSON valid
        const file = mockRoot.files.get('test.db')!;
        const env = JSON.parse(file.content);
        env.payloadJson = JSON.stringify({ secret: 'hacked' });
        // We do NOT update the hash
        file.content = JSON.stringify(env);

        // Load should fail primary and return null (no backup)
        const loaded = await adapter.load();
        expect(loaded).toBeNull();
    });
});
