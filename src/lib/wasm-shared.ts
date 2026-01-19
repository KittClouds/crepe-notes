/**
 * Shared Memory Manager for high-performance WASM communication
 * 
 * Uses direct memory access (SharedArrayBuffer) to avoid serialization overhead.
 */

export interface WasmExports {
    memory: WebAssembly.Memory;
    alloc_u8: (size: number) => number;
    dealloc_u8: (ptr: number, size: number) => void;
    scan_shared: (ptr: number, len: number) => number;
    free_result_deep: (ptr: number) => void;
}

export interface CandidateResult {
    token: string;
    kind: number; // 255 = None, else EntityKind
    score: number;
    status: number;
}

export class SharedMemoryManager {
    private exports: WasmExports;

    constructor(exports: any) {
        this.exports = exports as WasmExports;
    }

    /**
     * Scan text using shared memory
     */
    scan(text: string): CandidateResult[] {
        // 1. Encode string to bytes
        const encoder = new TextEncoder();
        const encoded = encoder.encode(text);
        const len = encoded.length;

        // 2. Allocate memory in WASM
        const ptr = this.exports.alloc_u8(len);

        // 3. Write to shared buffer
        const mem = new Uint8Array(this.exports.memory.buffer);
        mem.set(encoded, ptr);

        // 4. Run scan
        const headerPtr = this.exports.scan_shared(ptr, len);

        // 5. Clean up input buffer immediately
        this.exports.dealloc_u8(ptr, len);

        if (headerPtr === 0) {
            return [];
        }

        // 6. Read result
        const results = this.readResults(headerPtr);

        // 7. Free result memory
        this.exports.free_result_deep(headerPtr);

        return results;
    }

    private readResults(headerPtr: number): CandidateResult[] {
        const view = new DataView(this.exports.memory.buffer);
        const mem8 = new Uint8Array(this.exports.memory.buffer);

        // Read Header
        // struct ScanResultHeader { candidate_count: u32, candidates_ptr: u32, ... }
        const candidateCount = view.getUint32(headerPtr, true); // Little endian
        const candidatesPtr = view.getUint32(headerPtr + 4, true);

        const results: CandidateResult[] = [];
        const decoder = new TextDecoder();

        // Layout of CandidatePacked:
        // start(4), ptr(4), len(4), kind(1), pad(3), score(4), status(1), pad(3) = 24 bytes
        const STRIDE = 24;

        for (let i = 0; i < candidateCount; i++) {
            const base = candidatesPtr + (i * STRIDE);

            // Read fields
            // const start = view.getUint32(base, true);
            const tokenPtr = view.getUint32(base + 4, true);
            const tokenLen = view.getUint32(base + 8, true);
            const kind = view.getUint8(base + 12);
            // skip 3 bytes padding
            const score = view.getFloat32(base + 16, true);
            const status = view.getUint8(base + 20);

            // Read string
            // We're creating a copy here (JS string), but we avoided the JSON.parse overhead of the whole struct
            // and we avoided allocating the string in Rust on the JS heap via bindgen string passing (until now).
            // Actually `DataView` access is fast.
            const tokenBytes = mem8.subarray(tokenPtr, tokenPtr + tokenLen);
            const token = decoder.decode(tokenBytes);

            results.push({
                token,
                kind,
                score,
                status
            });
        }

        return results;
    }
}
