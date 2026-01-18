// src/lib/nebuladb/types.ts

// ==========================================
// Document Types
// ==========================================

export interface Document {
    id: string;
    [key: string]: any;
}

export interface CollectionOptions {
    name: string;
    indexes?: IndexOptions[];
}

export interface IndexOptions {
    name: string;
    fields: string[];
    type?: 'unique' | 'single' | 'compound' | 'fulltext'; // simplified from spec
}

// ==========================================
// Query Types
// ==========================================

// MongoDB-like query operators
export type QueryOperator =
    | '$eq'
    | '$gt'
    | '$gte'
    | '$lt'
    | '$lte'
    | '$ne'
    | '$in'
    | '$nin'
    | '$contains'; // Custom for arrays/strings

export type QueryValue = string | number | boolean | null | Array<string | number>;

export type QueryFieldCondition =
    | QueryValue
    | { [key in QueryOperator]?: QueryValue };

export interface Query {
    [field: string]: QueryFieldCondition | Query[] | undefined;
    $and?: Query[];
    $or?: Query[];
}

// Update operators
export interface UpdateQuery {
    $set?: Record<string, any>;
    $unset?: Record<string, boolean>;
    $inc?: Record<string, number>;
    $push?: Record<string, any>;
    $pull?: Record<string, any>;
}

// ==========================================
// Adapter Types
// ==========================================

export interface Adapter {
    // Connection
    connect(): Promise<void>;
    disconnect(): Promise<void>;

    // Collections
    createCollection(name: string, options?: CollectionOptions): Promise<void>;

    // CRUD
    find(collection: string, query?: Query): Promise<Document[]>;
    findOne(collection: string, query?: Query): Promise<Document | null>;
    insert(collection: string, doc: Document): Promise<Document>;
    update(collection: string, query: Query, update: UpdateQuery): Promise<number>;
    delete(collection: string, query: Query): Promise<number>;

    // Batch
    insertBatch(collection: string, docs: Document[]): Promise<Document[]>;

    // Direct Access (Optional optimization)
    count(collection: string, query?: Query): Promise<number>;
}
