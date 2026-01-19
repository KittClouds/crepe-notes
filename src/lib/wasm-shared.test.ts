
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SharedMemoryManager, WasmExports } from './wasm-shared';

describe('SharedMemoryManager', () => {
    let mockMemory: WebAssembly.Memory;
    let mockExports: WasmExports;

    beforeEach(() => {
        // Mock WebAssembly.Memory with a simple ArrayBuffer
        // In a real shared env this would be SharedArrayBuffer
        const buffer = new ArrayBuffer(1024);
        mockMemory = {
            buffer: buffer,
            grow: () => 0
        } as unknown as WebAssembly.Memory;

        mockExports = {
            memory: mockMemory,
            alloc_u8: vi.fn((size) => 100), // Allocate at offset 100
            dealloc_u8: vi.fn(),
            scan_shared: vi.fn(),
            free_result_deep: vi.fn(),
        };
    });

    it('should write text to memory and read results', () => {
        const manager = new SharedMemoryManager(mockExports);
        const text = "Luffy";

        // Setup mock response
        // Header at 200: candidate_count=1, candidates_ptr=300
        const headerPtr = 200;
        const candidatesPtr = 300;

        // Mock scan_shared to return headerPtr
        vi.mocked(mockExports.scan_shared).mockReturnValue(headerPtr);

        // Write mock result data into memory
        const view = new DataView(mockMemory.buffer);

        // Header
        view.setUint32(headerPtr, 1, true); // count
        view.setUint32(headerPtr + 4, candidatesPtr, true); // ptr

        // Candidate Packed at 300
        // Layout: ptr(4) @+4, len(4) @+8, kind(1) @+12, score(4) @+16, status(1) @+20
        const tokenPtr = 400;
        const tokenLen = 5;

        view.setUint32(candidatesPtr + 4, tokenPtr, true);
        view.setUint32(candidatesPtr + 8, tokenLen, true);
        view.setUint8(candidatesPtr + 12, 1); // Kind: CHARACTER (example)
        view.setFloat32(candidatesPtr + 16, 1.5, true); // Score
        view.setUint8(candidatesPtr + 20, 1); // Status: Promoted

        // Write token string "Luffy" at 400
        const mem8 = new Uint8Array(mockMemory.buffer);
        const encoder = new TextEncoder();
        const tokenBytes = encoder.encode("Luffy");
        mem8.set(tokenBytes, tokenPtr);

        // Execute
        const results = manager.scan(text);

        // Verify alloc called with correct size
        expect(mockExports.alloc_u8).toHaveBeenCalledWith(text.length);

        // Verify input text was written to offset 100
        const inputSlice = mem8.subarray(100, 100 + text.length);
        const decoder = new TextDecoder();
        expect(decoder.decode(inputSlice)).toBe("Luffy");

        // Verify scan_shared called
        expect(mockExports.scan_shared).toHaveBeenCalledWith(100, text.length);

        // Verify output parsing
        expect(results).toHaveLength(1);
        expect(results[0]).toEqual({
            token: "Luffy",
            kind: 1,
            score: 1.5,
            status: 1
        });

        // Verify cleanup
        expect(mockExports.dealloc_u8).toHaveBeenCalledWith(100, text.length);
        expect(mockExports.free_result_deep).toHaveBeenCalledWith(headerPtr);
    });
});
