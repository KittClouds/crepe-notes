// src/lib/nebuladb/adapter.ts
import type { Adapter, CollectionOptions, Document, Query, UpdateQuery } from './types';

// ==========================================
// Memory Adapter (Reference/Testing)
// ==========================================

export class MemoryAdapter implements Adapter {
    protected data: Map<string, Map<string, Document>> = new Map();

    async connect(): Promise<void> {
        // No-op
    }

    async disconnect(): Promise<void> {
        this.data.clear();
    }

    async createCollection(name: string): Promise<void> {
        if (!this.data.has(name)) {
            this.data.set(name, new Map());
        }
    }

    // Reuse matching logic (will be exported or duplicated in OPFS)
    public match(doc: Document, query: Query): boolean {
        for (const key in query) {
            if (key === '$and') {
                const subQueries = query[key] as Query[];
                if (!subQueries.every(q => this.match(doc, q))) return false;
                continue;
            }
            if (key === '$or') {
                const subQueries = query[key] as Query[];
                if (!subQueries.some(q => this.match(doc, q))) return false;
                continue;
            }

            const val = doc[key];
            const condition = query[key];

            if (typeof condition === 'object' && condition !== null) {
                // Operator check
                const cond = condition as Record<string, any>;
                if (cond.$eq !== undefined && val !== cond.$eq) return false;
                if (cond.$ne !== undefined && val === cond.$ne) return false;
                if (cond.$gt !== undefined && !(val > cond.$gt)) return false;
                if (cond.$gte !== undefined && !(val >= cond.$gte)) return false;
                if (cond.$lt !== undefined && !(val < cond.$lt)) return false;
                if (cond.$lte !== undefined && !(val <= cond.$lte)) return false;
                if (cond.$in !== undefined && !(cond.$in as any[]).includes(val)) return false;
                if (cond.$nin !== undefined && (cond.$nin as any[]).includes(val)) return false;
                if (cond.$contains !== undefined && (Array.isArray(val) || typeof val === 'string') && !(val as any).includes(cond.$contains)) return false;
            } else {
                // Direct equality
                if (val !== condition) return false;
            }
        }
        return true;
    }

    async find(collection: string, query: Query = {}): Promise<Document[]> {
        const coll = this.data.get(collection);
        if (!coll) return [];

        const results: Document[] = [];
        for (const doc of coll.values()) {
            if (this.match(doc, query)) {
                results.push({ ...doc }); // deep clone ideally
            }
        }
        return results;
    }

    async findOne(collection: string, query: Query = {}): Promise<Document | null> {
        const results = await this.find(collection, query);
        return results[0] || null;
    }

    async insert(collection: string, doc: Document): Promise<Document> {
        let coll = this.data.get(collection);
        if (!coll) {
            await this.createCollection(collection);
            coll = this.data.get(collection)!;
        }
        coll.set(doc.id, { ...doc });
        return doc;
    }

    async update(collection: string, query: Query, update: UpdateQuery): Promise<number> {
        const docs = await this.find(collection, query);
        const coll = this.data.get(collection);
        if (!coll) return 0;

        let count = 0;
        for (const doc of docs) {
            const newDoc = this.applyUpdate(doc, update);
            coll.set(newDoc.id, newDoc);
            count++;
        }
        return count;
    }

    private applyUpdate(doc: Document, update: UpdateQuery): Document {
        const clone = { ...doc };
        if (update.$set) Object.assign(clone, update.$set);
        if (update.$unset) {
            for (const key in update.$unset) delete clone[key];
        }
        // Implement other operators as needed
        return clone;
    }

    async delete(collection: string, query: Query): Promise<number> {
        const docs = await this.find(collection, query);
        const coll = this.data.get(collection);
        if (!coll) return 0;

        let count = 0;
        for (const doc of docs) {
            if (coll.delete(doc.id)) count++;
        }
        return count;
    }

    async insertBatch(collection: string, docs: Document[]): Promise<Document[]> {
        let coll = this.data.get(collection);
        if (!coll) {
            await this.createCollection(collection);
            coll = this.data.get(collection)!;
        }

        const inserted: Document[] = [];
        for (const doc of docs) {
            coll.set(doc.id, { ...doc });
            inserted.push(doc);
        }
        return inserted;
    }

    async count(collection: string, query?: Query): Promise<number> {
        const docs = await this.find(collection, query);
        return docs.length;
    }
}
