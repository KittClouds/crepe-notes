
import { Adapter, CollectionOptions, Document, Query, UpdateQuery } from '../types';
import { MemoryAdapter } from '../adapter';
import { GraphObjectStore } from '@/lib/opfs';

export class GraphStoreAdapter extends MemoryAdapter {
    constructor(private graphStore: GraphObjectStore) {
        super();
    }

    async connect(): Promise<void> {
        await super.connect();
        // Hydration is now explicit via hydrate() method
    }

    /**
     * Hydrate NebulaDB from GraphObjectStore
     * This is an expensive operation that requires CozoDB to be ready.
     * Should be called after UI is interactive.
     */
    async hydrate(): Promise<void> {
        // Hydration: Load all notes from Cozo 'notes' table
        // This relies on the "Legacy Sync" dual-write we implemented in WalManager.
        console.log('[GraphAdapter] Starting hydration...');
        try {
            // Updated to match ContentSchema.ts columns: id, title, content, created_at, updated_at
            // We ignore markdown_content for hydration if it's dup of content
            const result = await this.graphStore.runQuery(
                `?[id, title, content, created_at, updated_at] := *notes{id, title, content, created_at, updated_at}`
            );

            // Handle raw Cozo string result vs Object
            const parsed = typeof result === 'string' ? JSON.parse(result) : result;
            if (parsed.ok === false) {
                console.warn("Hydration failed:", parsed);
                return;
            }

            const rows = parsed.rows || [];
            const docs: Document[] = rows.map((row: any[]) => ({
                id: row[0],
                title: row[1],
                content: row[2],
                html: '', // Schema mismatch fix
                ctime: row[3], // created_at
                mtime: row[4], // updated_at
                kind: 'note'
            }));

            // Populate 'notes' collection
            if (docs.length > 0) {
                const map = new Map();
                docs.forEach(d => map.set(d.id, d));
                this.data.set('notes', map);
                console.log(`[GraphAdapter] Hydrated ${docs.length} notes`);
            }

            // TODO: Hydrate other collections like folders similarly
        } catch (e) {
            console.error("Failed to hydrate Nebula:", e);
        }
    }

    async insert(collection: string, doc: Document): Promise<Document> {
        // 1. Optimistic Memory Update
        const result = await super.insert(collection, doc);

        // 2. Persist to Graph
        await this.persistToGraph(collection, result);

        return result;
    }

    async update(collection: string, query: Query, update: UpdateQuery): Promise<number> {
        // 1. Optimistic Update
        const count = await super.update(collection, query, update);

        // 2. Persist
        if (count > 0) {
            const updatedDocs = await this.find(collection, query);
            for (const doc of updatedDocs) {
                await this.persistToGraph(collection, doc);
            }
        }
        return count;
    }

    async delete(collection: string, query: Query): Promise<number> {
        const toDelete = await this.find(collection, query);
        const count = await super.delete(collection, query);

        for (const doc of toDelete) {
            await this.graphStore.deleteObject(doc.id);
        }
        return count;
    }

    private async persistToGraph(collection: string, doc: Document) {
        const { id, content, ...props } = doc;
        const kind = collection;

        if (typeof content === 'string') {
            await this.graphStore.saveObject(id, kind, content, 'text/plain', props);
        } else {
            await this.graphStore.saveObject(id, kind, null, undefined, props);
        }
    }
}
