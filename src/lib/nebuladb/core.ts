// src/lib/nebuladb/core.ts
import type { Adapter, CollectionOptions, Document, Query, UpdateQuery } from './types';

// ==========================================
// Collection
// ==========================================

export class Collection {
    private name: string;
    private db: NebulaDB;
    // private subscribers: Set<(docs: Document[]) => void> = new Set();

    // Track active queries for reactivity
    private reactiveQueries: Map<(docs: Document[]) => void, Query> = new Map();

    constructor(name: string, db: NebulaDB) {
        this.name = name;
        this.db = db;
    }

    // --- CRUD ---

    async find(query: Query = {}): Promise<Document[]> {
        return this.db.adapter.find(this.name, query);
    }

    async findOne(query: Query = {}): Promise<Document | null> {
        return this.db.adapter.findOne(this.name, query);
    }

    async insert(doc: Document): Promise<Document> {
        const result = await this.db.adapter.insert(this.name, doc);
        this.notifySubscribers();
        return result;
    }

    async insertBatch(docs: Document[]): Promise<Document[]> {
        const result = await this.db.adapter.insertBatch(this.name, docs);
        this.notifySubscribers();
        return result;
    }

    async update(query: Query, update: UpdateQuery): Promise<number> {
        const count = await this.db.adapter.update(this.name, query, update);
        if (count > 0) this.notifySubscribers();
        return count;
    }

    async delete(query: Query): Promise<number> {
        const count = await this.db.adapter.delete(this.name, query);
        if (count > 0) this.notifySubscribers();
        return count;
    }

    /**
     * Clear the collection (truncate)
     */
    async clear(): Promise<void> {
        // Simple implementation: delete ALL
        await this.delete({});
    }

    // --- Reactivity ---

    subscribe(query: Query, callback: (docs: Document[]) => void): () => void {
        // Initial fetch
        this.find(query).then(callback);

        // Register
        this.reactiveQueries.set(callback, query);

        return () => {
            this.reactiveQueries.delete(callback);
        };
    }

    private async notifySubscribers() {
        for (const [callback, query] of this.reactiveQueries) {
            // Re-run query for each subscriber
            // Optimization: In a real DB we'd usage oplog filtering, here we just re-query.
            // But we can debounce if needed.
            const docs = await this.find(query);
            callback(docs);
        }
    }
}

// ==========================================
// NebulaDB Core
// ==========================================

export class NebulaDB {
    adapter: Adapter;
    private collections: Map<string, Collection> = new Map();

    constructor(config: { adapter: Adapter }) {
        this.adapter = config.adapter;
    }

    async connect(): Promise<void> {
        await this.adapter.connect();
    }

    collection(name: string, options?: CollectionOptions): Collection {
        if (!this.collections.has(name)) {
            this.collections.set(name, new Collection(name, this));
            // Ensure backend knows about it
            this.adapter.createCollection(name, options).catch(console.error);
        }
        return this.collections.get(name)!;
    }
}

export function createDb(config: { adapter: Adapter }): NebulaDB {
    return new NebulaDB(config);
}
