// src/lib/nebuladb/adapters/opfs.ts
import { Adapter, CollectionOptions, Document, Query, UpdateQuery } from '../types';
import { MemoryAdapter } from '../adapter';
import { saveNebulaBootCache, buildNebulaBootCache } from '../bootCache';
import { getCurrentNoteId } from '@/lib/storage';

// ==========================================
// OPFS Helpers (Async Main Thread Friendly)
// ==========================================

async function getOpfsRoot() {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle('nebuladb', { create: true });
}

async function writeJson(filename: string, data: any) {
    const root = await getOpfsRoot();
    const handle = await root.getFileHandle(filename, { create: true });
    // @ts-ignore - types might be outdated
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(data));
    await writable.close();
}

async function readJson(filename: string): Promise<any | null> {
    try {
        const root = await getOpfsRoot();
        const handle = await root.getFileHandle(filename); // No create, fail if missing
        const file = await handle.getFile();
        const text = await file.text();
        return JSON.parse(text);
    } catch (e: any) {
        if (e.name === 'NotFoundError') return null;
        console.warn(`[NebulaDB] Failed to read ${filename}:`, e);
        return null;
    }
}

// ==========================================
// OPFS Adapter
// ==========================================

export class OPFSAdapter extends MemoryAdapter {
    private flushQueue: Set<string> = new Set();
    private flushTimer: any = null;
    private FLUSH_DEBOUNCE_MS = 500;
    private loadedCollections: Set<string> = new Set();
    private bootCacheEnabled = true; // Can be disabled during bulk operations

    async connect(): Promise<void> {
        // Load known collections?
        // We load lazily or we iterate directory?
        // Iterating directory is safer to discover persistent collections.
        try {
            const root = await getOpfsRoot();
            // @ts-ignore - async iterator (newer browsers)
            for await (const [name, handle] of root.entries()) {
                if (name.endsWith('.json')) {
                    const colName = name.replace('.json', '');
                    await this.loadCollection(colName);
                }
            }
        } catch (e) {
            console.warn('[NebulaDB] Erro listing OPFS:', e);
        }
    }

    private async loadCollection(name: string) {
        if (this.loadedCollections.has(name)) return;

        const data = await readJson(`${name}.json`);
        if (data && Array.isArray(data)) {
            const map = new Map<string, Document>();
            data.forEach((doc: Document) => map.set(doc.id, doc));
            this.data.set(name, map);
            console.log(`[NebulaDB] Loaded ${name}: ${map.size} docs`);
        } else {
            this.data.set(name, new Map());
        }
        this.loadedCollections.add(name);
    }

    async createCollection(name: string, options?: CollectionOptions): Promise<void> {
        if (!this.data.has(name)) {
            await this.loadCollection(name); // Try load existing
        }
        super.createCollection(name);
    }

    // --- Persist Triggers ---
    // We override write methods to trigger saves

    async insert(collection: string, doc: Document): Promise<Document> {
        const res = await super.insert(collection, doc);
        this.scheduleFlush(collection);
        return res;
    }

    async update(collection: string, query: Query, update: UpdateQuery): Promise<number> {
        const res = await super.update(collection, query, update);
        if (res > 0) this.scheduleFlush(collection);
        return res;
    }

    async delete(collection: string, query: Query): Promise<number> {
        const res = await super.delete(collection, query);
        if (res > 0) this.scheduleFlush(collection);
        return res;
    }

    async insertBatch(collection: string, docs: Document[]): Promise<Document[]> {
        const res = await super.insertBatch(collection, docs);
        if (res.length > 0) this.scheduleFlush(collection);
        return res;
    }

    // --- Flushing ---

    private scheduleFlush(collection: string) {
        this.flushQueue.add(collection);
        if (!this.flushTimer) {
            this.flushTimer = setTimeout(() => this.flush(), this.FLUSH_DEBOUNCE_MS);
        }
    }

    private async flush() {
        this.flushTimer = null;
        const toFlush = Array.from(this.flushQueue);
        this.flushQueue.clear();

        for (const name of toFlush) {
            const map = this.data.get(name);
            if (map) {
                const docs = Array.from(map.values());
                await writeJson(`${name}.json`, docs);
            }
        }

        // Update localStorage boot cache after successful flush
        // This ensures next boot has fresh data
        if (this.bootCacheEnabled && (toFlush.includes('notes') || toFlush.includes('folders'))) {
            this.updateBootCache();
        }
    }

    private updateBootCache() {
        try {
            const notes = Array.from(this.data.get('notes')?.values() || []);
            const folders = Array.from(this.data.get('folders')?.values() || []);
            const decorations = Array.from(this.data.get('decorations')?.values() || []);
            const lastOpenNoteId = getCurrentNoteId() || undefined;

            const cache = buildNebulaBootCache(notes, folders, decorations, lastOpenNoteId);
            saveNebulaBootCache(cache);
        } catch (e) {
            console.warn('[NebulaDB] Failed to update boot cache:', e);
        }
    }

    // Allow disabling boot cache during bulk sync
    setBootCacheEnabled(enabled: boolean) {
        this.bootCacheEnabled = enabled;
    }
}

