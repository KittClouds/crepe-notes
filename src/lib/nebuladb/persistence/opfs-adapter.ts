import { MemoryAdapter } from '../adapter';
import type { Document, Query, UpdateQuery, CollectionOptions } from '../types';
import { saveBootCache, buildBootCacheFromMaps } from '../../storage/bootCache';

// Typings for worker messages
type WorkerMessage =
    | { type: 'LOAD_RESULT', id: number, success: boolean, data?: any, error?: string }
    | { type: 'SAVE_RESULT', id: number, success: boolean, error?: string }
    | { type: 'ERROR', id: number, success: boolean, error?: string };

export class OpfsAdapter extends MemoryAdapter {
    private worker: Worker | null = null;
    private nextId = 1;
    private pending = new Map<number, { resolve: (val?: any) => void, reject: (err: any) => void }>();

    // Key used by storage.ts (duplicated here to avoid circular dep)
    private readonly CURRENT_NOTE_KEY = 'inkwell_current_note_id';

    // Connection state management
    private connectionPromise: Promise<void> | null = null;
    private isConnected: boolean = false;

    constructor() {
        super();
    }

    async connect(): Promise<void> {
        if (this.connectionPromise) return this.connectionPromise;

        this.connectionPromise = (async () => {
            console.log('[OpfsAdapter] Connecting...');
            try {
                // Initialize Worker
                this.worker = new Worker(new URL('./opfs.worker.ts', import.meta.url), {
                    type: 'module'
                });

                this.worker.onmessage = (e) => this.handleMessage(e.data);

                // Request Load - Critical step: waits for worker FS read
                console.log('[OpfsAdapter] Waiting for snapshot load from worker...');
                const snapshot = await this.sendToWorker('LOAD', {});

                if (snapshot) {
                    this.deserializeData(snapshot);
                    console.log(`[OpfsAdapter] Loaded snapshot. Notes count: ${this.data.get('notes')?.size || 0}`);
                } else {
                    console.log('[OpfsAdapter] No snapshot found, starting fresh');
                }

                this.isConnected = true;
            } catch (err) {
                console.error('[OpfsAdapter] Failed to connect/load', err);
                this.isConnected = false;
                throw err;
            }
        })();

        return this.connectionPromise;
    }

    async disconnect(): Promise<void> {
        this.worker?.terminate();
        this.worker = null;
        this.isConnected = false;
        this.connectionPromise = null;
        await super.disconnect();
    }

    private async waitForConnect() {
        if (this.isConnected) return;
        if (this.connectionPromise) {
            await this.connectionPromise;
        } else {
            // Implicit connect if accessed before explicit connect
            await this.connect();
        }
    }

    // ==========================================
    // Read Overrides (Wait for load)
    // ==========================================

    async find(collection: string, query: Query = {}): Promise<Document[]> {
        await this.waitForConnect();
        return super.find(collection, query);
    }

    async findOne(collection: string, query: Query = {}): Promise<Document | null> {
        await this.waitForConnect();
        return super.findOne(collection, query);
    }

    async count(collection: string, query?: Query): Promise<number> {
        await this.waitForConnect();
        return super.count(collection, query);
    }

    // ==========================================
    // Persistence Hooks
    // ==========================================

    async insert(collection: string, doc: Document): Promise<Document> {
        await this.waitForConnect();
        // Debug logging
        // console.log(`[OpfsAdapter] Inserting into ${collection}:`, doc.id);
        const result = await super.insert(collection, doc);
        // console.log(`[OpfsAdapter] Inserted into memory. Map size:`, this.data.get(collection)?.size);
        await this.triggerSave();
        return result;
    }

    async update(collection: string, query: Query, update: UpdateQuery): Promise<number> {
        await this.waitForConnect();
        const result = await super.update(collection, query, update);
        if (result > 0) await this.triggerSave();
        return result;
    }

    async delete(collection: string, query: Query): Promise<number> {
        await this.waitForConnect();
        const result = await super.delete(collection, query);
        if (result > 0) await this.triggerSave();
        return result;
    }

    async insertBatch(collection: string, docs: Document[]): Promise<Document[]> {
        await this.waitForConnect();
        const result = await super.insertBatch(collection, docs);
        if (result.length > 0) await this.triggerSave();
        return result;
    }

    // ==========================================
    // Serialization / Deserialization
    // ==========================================

    private serializeData(): any {
        const out: Record<string, Record<string, any>> = {};
        for (const [colName, colMap] of this.data.entries()) {
            out[colName] = {};
            for (const [docId, doc] of colMap.entries()) {
                out[colName][docId] = doc;
            }
        }
        return out;
    }

    private deserializeData(snapshot: any) {
        this.data.clear();
        for (const colName in snapshot) {
            const colMap = new Map<string, Document>();
            const docs = snapshot[colName];
            for (const docId in docs) {
                colMap.set(docId, docs[docId]);
            }
            this.data.set(colName, colMap);
        }
    }

    // ==========================================
    // Worker Communication
    // ==========================================

    private async triggerSave() {
        if (!this.worker) return;

        // 1. Sync Cache updates (Fast)
        this.updateSidebarCache();

        // 2. Full Persist (Slow/Async)
        const payload = this.serializeData();
        try {
            await this.sendToWorker('SAVE', payload);
        } catch (err) {
            console.error('[OpfsAdapter] Save failed', err);
        }
    }

    private updateSidebarCache() {
        try {
            const notesMap = this.data.get('notes');
            const foldersMap = this.data.get('folders');

            if (notesMap && foldersMap) {
                const currentNoteId = localStorage.getItem(this.CURRENT_NOTE_KEY) || undefined;
                const cache = buildBootCacheFromMaps(notesMap, foldersMap, currentNoteId);
                saveBootCache(cache);
            }
        } catch (err) {
            console.warn('[OpfsAdapter] Failed to update boot cache', err);
        }
    }

    private sendToWorker(type: 'LOAD' | 'SAVE', payload: any): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.worker) return reject(new Error('Worker not connected'));

            const id = this.nextId++;
            this.pending.set(id, { resolve, reject });
            this.worker.postMessage({ id, type, payload });

            // Timeout safety
            setTimeout(() => {
                if (this.pending.has(id)) {
                    this.pending.get(id)?.reject(new Error('Worker timeout'));
                    this.pending.delete(id);
                }
            }, 10000); // 10s timeout for I/O
        });
    }

    private handleMessage(msg: WorkerMessage) {
        const p = this.pending.get(msg.id);
        if (!p) return;

        if (msg.success) {
            p.resolve(msg.type === 'LOAD_RESULT' ? msg.data : undefined);
        } else {
            p.reject(new Error(msg.error || 'Unknown worker error'));
        }
        this.pending.delete(msg.id);
    }
}
