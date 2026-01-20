/**
 * Shared Memory Manager for high-performance WASM communication
 * 
 * Uses direct memory access (SharedArrayBuffer) to avoid serialization overhead.
 */

export interface WasmExports {
    memory: WebAssembly.Memory;
    // Scanner exports
    alloc_u8: (size: number) => number;
    dealloc_u8: (ptr: number, size: number) => void;
    scan_shared: (ptr: number, len: number) => number;
    free_result_deep: (ptr: number) => void;
    // CozoDB exports
    cozo_init: () => number;
    cozo_is_ready: () => number;
    cozo_query: (query_ptr: number, query_len: number) => number;
    cozo_upsert_node: (id_ptr: number, id_len: number, label_ptr: number, label_len: number, kind_ptr: number, kind_len: number) => number;
    cozo_upsert_edge: (source_ptr: number, source_len: number, target_ptr: number, target_len: number, relation_ptr: number, relation_len: number) => number;
    cozo_upsert_relationship: (
        id_ptr: number, id_len: number,
        source_ptr: number, source_len: number,
        target_ptr: number, target_len: number,
        type_ptr: number, type_len: number,
        confidence: number,
        bidirectional: number
    ) => number;

    cozo_export: () => number;
    cozo_import: (data_ptr: number, data_len: number) => number;
    cozo_node_count: () => number;
    cozo_edge_count: () => number;
    cozo_free_query_result: (ptr: number) => void;
    cozo_free_export_result: (ptr: number) => void;
}

export interface CandidateResult {
    token: string;
    kind: number; // 255 = None, else EntityKind
    score: number;
    status: number;
}

export interface CozoQueryResult {
    success: boolean;
    data?: any[];
    error?: string;
}

export class SharedMemoryManager {
    private exports: WasmExports;
    private encoder = new TextEncoder();
    private decoder = new TextDecoder();

    constructor(exports: any) {
        this.exports = exports as WasmExports;
    }

    // =================================================================
    // Scanner Methods
    // =================================================================

    /**
     * Scan text using shared memory
     */
    scan(text: string): CandidateResult[] {
        const encoded = this.encoder.encode(text);
        const len = encoded.length;

        const ptr = this.exports.alloc_u8(len);
        const mem = new Uint8Array(this.exports.memory.buffer);
        mem.set(encoded, ptr);

        const headerPtr = this.exports.scan_shared(ptr, len);
        this.exports.dealloc_u8(ptr, len);

        if (headerPtr === 0) {
            return [];
        }

        const results = this.readResults(headerPtr);
        this.exports.free_result_deep(headerPtr);

        return results;
    }

    private readResults(headerPtr: number): CandidateResult[] {
        const view = new DataView(this.exports.memory.buffer);
        const mem8 = new Uint8Array(this.exports.memory.buffer);

        const candidateCount = view.getUint32(headerPtr, true);
        const candidatesPtr = view.getUint32(headerPtr + 4, true);

        const results: CandidateResult[] = [];
        const STRIDE = 24;

        for (let i = 0; i < candidateCount; i++) {
            const base = candidatesPtr + (i * STRIDE);

            const tokenPtr = view.getUint32(base + 4, true);
            const tokenLen = view.getUint32(base + 8, true);
            const kind = view.getUint8(base + 12);
            const score = view.getFloat32(base + 16, true);
            const status = view.getUint8(base + 20);

            const tokenBytes = mem8.subarray(tokenPtr, tokenPtr + tokenLen);
            const token = this.decoder.decode(tokenBytes);

            results.push({ token, kind, score, status });
        }

        return results;
    }

    // =================================================================
    // CozoDB Methods
    // =================================================================

    /**
     * Initialize CozoDB. Call once on startup.
     */
    cozoInit(): boolean {
        return this.exports.cozo_init() === 0;
    }

    /**
     * Check if CozoDB is ready.
     */
    cozoIsReady(): boolean {
        return this.exports.cozo_is_ready() === 1;
    }

    /**
     * Execute a Datalog query.
     */
    cozoQuery(query: string): CozoQueryResult {
        const { ptr, len } = this.allocString(query);
        const resultPtr = this.exports.cozo_query(ptr, len);
        this.exports.dealloc_u8(ptr, len);

        const result = this.readQueryResult(resultPtr);
        this.exports.cozo_free_query_result(resultPtr);
        return result;
    }

    /**
     * Upsert a node into the graph.
     */
    cozoUpsertNode(id: string, label: string, kind: string): boolean {
        const idAlloc = this.allocString(id);
        const labelAlloc = this.allocString(label);
        const kindAlloc = this.allocString(kind);

        const result = this.exports.cozo_upsert_node(
            idAlloc.ptr, idAlloc.len,
            labelAlloc.ptr, labelAlloc.len,
            kindAlloc.ptr, kindAlloc.len
        );

        this.exports.dealloc_u8(idAlloc.ptr, idAlloc.len);
        this.exports.dealloc_u8(labelAlloc.ptr, labelAlloc.len);
        this.exports.dealloc_u8(kindAlloc.ptr, kindAlloc.len);

        return result === 0;
    }

    /**
     * Upsert Edge (Deprecated: internally uses relationships)
     */
    cozoUpsertEdge(source: string, target: string, relation: string): boolean {
        const sEnc = this.encoder.encode(source);
        const tEnc = this.encoder.encode(target);
        const rEnc = this.encoder.encode(relation);

        const sPtr = this.exports.alloc_u8(sEnc.length);
        const tPtr = this.exports.alloc_u8(tEnc.length);
        const rPtr = this.exports.alloc_u8(rEnc.length);

        const mem = new Uint8Array(this.exports.memory.buffer);
        mem.set(sEnc, sPtr);
        mem.set(tEnc, tPtr);
        mem.set(rEnc, rPtr);

        const result = this.exports.cozo_upsert_edge(
            sPtr, sEnc.length,
            tPtr, tEnc.length,
            rPtr, rEnc.length
        );

        this.exports.dealloc_u8(sPtr, sEnc.length);
        this.exports.dealloc_u8(tPtr, tEnc.length);
        this.exports.dealloc_u8(rPtr, rEnc.length);

        return result === 0;
    }

    /**
     * Upsert Relationship (Full Schema)
     */
    cozoUpsertRelationship(
        id: string,
        source: string,
        target: string,
        type: string,
        confidence: number,
        bidirectional: boolean
    ): boolean {
        const idEnc = this.encoder.encode(id);
        const sEnc = this.encoder.encode(source);
        const tEnc = this.encoder.encode(target);
        const typeEnc = this.encoder.encode(type);

        const idPtr = this.exports.alloc_u8(idEnc.length);
        const sPtr = this.exports.alloc_u8(sEnc.length);
        const tPtr = this.exports.alloc_u8(tEnc.length);
        const typePtr = this.exports.alloc_u8(typeEnc.length);

        const mem = new Uint8Array(this.exports.memory.buffer);
        mem.set(idEnc, idPtr);
        mem.set(sEnc, sPtr);
        mem.set(tEnc, tPtr);
        mem.set(typeEnc, typePtr);

        const result = this.exports.cozo_upsert_relationship(
            idPtr, idEnc.length,
            sPtr, sEnc.length,
            tPtr, tEnc.length,
            typePtr, typeEnc.length,
            confidence,
            bidirectional ? 1 : 0
        );

        this.exports.dealloc_u8(idPtr, idEnc.length);
        this.exports.dealloc_u8(sPtr, sEnc.length);
        this.exports.dealloc_u8(tPtr, tEnc.length);
        this.exports.dealloc_u8(typePtr, typeEnc.length);

        return result === 0;
    }

    /**
     * Export the entire DB to JSON string.
     */
    cozoExport(): string | null {
        const resultPtr = this.exports.cozo_export();
        const view = new DataView(this.exports.memory.buffer);
        const mem8 = new Uint8Array(this.exports.memory.buffer);

        const success = view.getUint8(resultPtr);
        const dataPtr = view.getUint32(resultPtr + 4, true);
        const dataLen = view.getUint32(resultPtr + 8, true);

        let result: string | null = null;
        if (success === 1 && dataLen > 0) {
            const bytes = mem8.subarray(dataPtr, dataPtr + dataLen);
            result = this.decoder.decode(bytes);
        }

        this.exports.cozo_free_export_result(resultPtr);
        return result;
    }

    /**
     * Import DB from JSON string.
     */
    cozoImport(data: string): boolean {
        const { ptr, len } = this.allocString(data);
        const result = this.exports.cozo_import(ptr, len);
        this.exports.dealloc_u8(ptr, len);
        return result === 0;
    }

    /**
     * Get node count.
     */
    cozoNodeCount(): number {
        return this.exports.cozo_node_count();
    }

    /**
     * Get edge count.
     */
    cozoEdgeCount(): number {
        return this.exports.cozo_edge_count();
    }

    // =================================================================
    // Helpers
    // =================================================================

    private allocString(s: string): { ptr: number; len: number } {
        const encoded = this.encoder.encode(s);
        const len = encoded.length;
        const ptr = this.exports.alloc_u8(len);
        const mem = new Uint8Array(this.exports.memory.buffer);
        mem.set(encoded, ptr);
        return { ptr, len };
    }

    private readQueryResult(resultPtr: number): CozoQueryResult {
        const view = new DataView(this.exports.memory.buffer);
        const mem8 = new Uint8Array(this.exports.memory.buffer);

        // QueryResultHeader: success(1), pad(3), json_ptr(4), json_len(4)
        const success = view.getUint8(resultPtr);
        const jsonPtr = view.getUint32(resultPtr + 4, true);
        const jsonLen = view.getUint32(resultPtr + 8, true);

        if (jsonLen === 0) {
            return { success: success === 1, data: [] };
        }

        const bytes = mem8.subarray(jsonPtr, jsonPtr + jsonLen);
        const jsonStr = this.decoder.decode(bytes);

        if (success === 1) {
            try {
                return { success: true, data: JSON.parse(jsonStr) };
            } catch {
                return { success: false, error: 'JSON parse error' };
            }
        } else {
            return { success: false, error: jsonStr };
        }
    }
}

