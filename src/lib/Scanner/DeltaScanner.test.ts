/**
 * DeltaScanner - TDD Contract
 * 
 * Computes document deltas and sends only changed content to WASM.
 * Tracks what's been processed to avoid redundant scanning.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeltaScanner, type DocumentDelta, type DeltaScanResult } from './DeltaScanner';
import type { EntitySpan } from '../kittcore';

describe('DeltaScanner', () => {
    let scanner: DeltaScanner;
    let mockWasmScan: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockWasmScan = vi.fn().mockResolvedValue({ relations: [] });
        scanner = new DeltaScanner({
            wasmScan: mockWasmScan,
        });
    });

    // =========================================================================
    // DELTA COMPUTATION
    // =========================================================================

    it('should send full content on first scan', async () => {
        const content = 'Alice walked to the castle.';
        const entities: EntitySpan[] = [
            { id: 'e1', label: 'Alice', start: 0, end: 5 },
        ];

        await scanner.scan('note-1', content, entities);

        expect(mockWasmScan).toHaveBeenCalledTimes(1);
        expect(mockWasmScan).toHaveBeenCalledWith(
            expect.objectContaining({
                noteId: 'note-1',
                isFullScan: true,
                content,
            })
        );
    });

    it('should skip scan if content unchanged', async () => {
        const content = 'Alice walked to the castle.';
        const entities: EntitySpan[] = [];

        await scanner.scan('note-1', content, entities);
        await scanner.scan('note-1', content, entities);

        expect(mockWasmScan).toHaveBeenCalledTimes(1);
    });

    it('should send delta on content change', async () => {
        const content1 = 'Alice walked.';
        const content2 = 'Alice walked to the castle.';

        await scanner.scan('note-1', content1, []);
        await scanner.scan('note-1', content2, []);

        expect(mockWasmScan).toHaveBeenCalledTimes(2);

        const secondCall = mockWasmScan.mock.calls[1][0];
        expect(secondCall.isFullScan).toBe(false);
        expect(secondCall.delta.inserts).toContainEqual(
            expect.objectContaining({ text: ' to the castle' })
        );
    });

    it('should detect deletions', async () => {
        const content1 = 'Alice and Bob walked.';
        const content2 = 'Alice walked.';

        await scanner.scan('note-1', content1, []);
        await scanner.scan('note-1', content2, []);

        const secondCall = mockWasmScan.mock.calls[1][0];
        expect(secondCall.delta.deletes).toHaveLength(1);
    });

    // =========================================================================
    // ENTITY AWARENESS
    // =========================================================================

    it('should include entities in delta', async () => {
        const content = 'Bob went to the castle.';
        const entities: EntitySpan[] = [
            { id: 'e1', label: 'Bob', start: 0, end: 3 },
        ];

        await scanner.scan('note-1', content, entities);

        expect(mockWasmScan).toHaveBeenCalledWith(
            expect.objectContaining({
                entities: expect.arrayContaining([
                    expect.objectContaining({ label: 'Bob' }),
                ]),
            })
        );
    });

    it('should only send new entities on update', async () => {
        const content1 = 'Alice walked.';
        const content2 = 'Alice walked with Bob.';

        const entities1: EntitySpan[] = [
            { id: 'e1', label: 'Alice', start: 0, end: 5 },
        ];
        const entities2: EntitySpan[] = [
            { id: 'e1', label: 'Alice', start: 0, end: 5 },
            { id: 'e2', label: 'Bob', start: 18, end: 21 },
        ];

        await scanner.scan('note-1', content1, entities1);
        await scanner.scan('note-1', content2, entities2);

        const secondCall = mockWasmScan.mock.calls[1][0];
        expect(secondCall.newEntities).toContainEqual(
            expect.objectContaining({ label: 'Bob' })
        );
        expect(secondCall.newEntities).not.toContainEqual(
            expect.objectContaining({ label: 'Alice' })
        );
    });

    // =========================================================================
    // NOTE ISOLATION
    // =========================================================================

    it('should track each note independently', async () => {
        const content = 'Same content.';

        await scanner.scan('note-1', content, []);
        await scanner.scan('note-2', content, []);

        expect(mockWasmScan).toHaveBeenCalledTimes(2);
    });

    it('should return cached state on note revisit without change', async () => {
        const content = 'Alice here.';

        await scanner.scan('note-1', content, []);
        await scanner.scan('note-2', 'Bob there.', []);
        await scanner.scan('note-1', content, []); // Revisit

        expect(mockWasmScan).toHaveBeenCalledTimes(2); // Not 3
    });

    // =========================================================================
    // FORCE SCAN
    // =========================================================================

    it('should force full scan when requested', async () => {
        const content = 'Same content.';

        await scanner.scan('note-1', content, []);
        await scanner.scan('note-1', content, [], { force: true });

        expect(mockWasmScan).toHaveBeenCalledTimes(2);
        expect(mockWasmScan.mock.calls[1][0].isFullScan).toBe(true);
    });

    // =========================================================================
    // RESULT HANDLING
    // =========================================================================

    it('should return new relations from WASM', async () => {
        mockWasmScan.mockResolvedValueOnce({
            relations: [
                { source_id: 'e1', target_id: 'e2', kind: 'KNOWS', confidence: 0.9 },
            ],
        });

        const result = await scanner.scan('note-1', 'Alice met Bob.', [
            { id: 'e1', label: 'Alice', start: 0, end: 5 },
            { id: 'e2', label: 'Bob', start: 10, end: 13 },
        ]);

        expect(result.newRelations).toHaveLength(1);
        expect(result.newRelations[0].kind).toBe('KNOWS');
    });

    // =========================================================================
    // METRICS
    // =========================================================================

    it('should track scan metrics', async () => {
        await scanner.scan('note-1', 'Alice.', []);
        await scanner.scan('note-1', 'Alice walked.', []);
        await scanner.scan('note-1', 'Alice walked home.', []);

        const stats = scanner.getStats('note-1');
        expect(stats.totalScans).toBe(3);
        expect(stats.deltaScans).toBe(2);
        expect(stats.fullScans).toBe(1);
    });
});
