/**
 * ScanCoordinator - TDD Contract
 * 
 * Orchestrates the hybrid scanning approach:
 * - Entity events → EntityEventBus → punctuation/idle trigger
 * - Delta computation → DeltaScanner → WASM
 * - Results → GraphRegistry
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScanCoordinator, type ScanCoordinatorConfig } from './ScanCoordinator';
import type { DecorationSpan } from './types';
import type { ExtractedRelation } from '../kittcore';

describe('ScanCoordinator', () => {
    let coordinator: ScanCoordinator;
    let mockKittCore: {
        scan: ReturnType<typeof vi.fn>;
        extractRelations: ReturnType<typeof vi.fn>;
    };
    let mockGraphRegistry: {
        upsertRelationship: ReturnType<typeof vi.fn>;
    };
    let relationsEmitted: ExtractedRelation[][];

    beforeEach(() => {
        vi.useFakeTimers();

        mockKittCore = {
            scan: vi.fn().mockResolvedValue({
                syntax_matches: [],
                implicit_mentions: [],
                relations: [],
                triples: [],
                temporal_mentions: [],
                stats: { duration_ms: 1 },
            }),
            extractRelations: vi.fn().mockResolvedValue([]),
        };

        mockGraphRegistry = {
            upsertRelationship: vi.fn().mockResolvedValue(undefined),
        };

        relationsEmitted = [];

        coordinator = new ScanCoordinator({
            kittCore: mockKittCore as any,
            graphRegistry: mockGraphRegistry as any,
            onNewRelations: (rels) => relationsEmitted.push(rels),
            idleTimeoutMs: 500,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        coordinator.dispose();
    });

    // =========================================================================
    // LIFECYCLE
    // =========================================================================

    it('should initialize without scanning', () => {
        expect(mockKittCore.scan).not.toHaveBeenCalled();
    });

    it('should NOT scan in highlighting loop', () => {
        // Simulating what the editor plugin does
        const span: DecorationSpan = {
            type: 'entity',
            from: 0,
            to: 5,
            label: 'Alice',
            kind: 'CHARACTER',
            resolved: true,
        };

        // This is called during decoration, should be instant
        coordinator.onEntityDecoration(span, 'note-1');

        // No WASM call yet
        expect(mockKittCore.scan).not.toHaveBeenCalled();
        expect(mockKittCore.extractRelations).not.toHaveBeenCalled();
    });

    // =========================================================================
    // ENTITY EVENT FLOW
    // =========================================================================

    it('should queue entity and scan on punctuation', async () => {
        const span: DecorationSpan = {
            type: 'entity',
            from: 0,
            to: 5,
            label: 'Alice',
            kind: 'CHARACTER',
            resolved: true,
        };

        coordinator.onEntityDecoration(span, 'note-1');
        coordinator.onKeystroke('.', 10, 'Alice runs.', 'note-1');

        // Flush pending promises
        await vi.runAllTimersAsync();

        expect(mockKittCore.extractRelations).toHaveBeenCalled();
    });

    it('should batch entities before sending', async () => {
        coordinator.onEntityDecoration(
            { type: 'entity', from: 0, to: 5, label: 'Alice', kind: 'CHARACTER', resolved: true },
            'note-1'
        );
        coordinator.onEntityDecoration(
            { type: 'entity', from: 10, to: 13, label: 'Bob', kind: 'CHARACTER', resolved: true },
            'note-1'
        );
        coordinator.onKeystroke('.', 20, 'Alice met Bob.', 'note-1');

        await vi.runAllTimersAsync();

        const call = mockKittCore.extractRelations.mock.calls[0];
        expect(call[1]).toHaveLength(2); // Both entities
    });

    // =========================================================================
    // IDLE SCAN
    // =========================================================================

    it('should scan on idle if entities pending', async () => {
        coordinator.onEntityDecoration(
            { type: 'entity', from: 0, to: 5, label: 'Carol', kind: 'CHARACTER', resolved: true },
            'note-1'
        );

        vi.advanceTimersByTime(600);
        await vi.runAllTimersAsync();

        expect(mockKittCore.extractRelations).toHaveBeenCalled();
    });

    it('should NOT scan on idle if no entities', async () => {
        coordinator.onDocumentChange('note-1', 'Just plain text.');

        vi.advanceTimersByTime(600);
        await vi.runAllTimersAsync();

        expect(mockKittCore.extractRelations).not.toHaveBeenCalled();
    });

    // =========================================================================
    // NOTE OPEN FULL SCAN
    // =========================================================================

    it('should full scan on note open', async () => {
        await coordinator.onNoteOpen('note-1', 'Alice and Bob in the castle.', [
            { type: 'entity', from: 0, to: 5, label: 'Alice', kind: 'CHARACTER', resolved: true },
            { type: 'entity', from: 10, to: 13, label: 'Bob', kind: 'CHARACTER', resolved: true },
        ]);

        expect(mockKittCore.scan).toHaveBeenCalledWith(
            expect.stringContaining('Alice'),
            expect.any(Array)
        );
    });

    it('should skip full scan if note recently scanned', async () => {
        await coordinator.onNoteOpen('note-1', 'Content.', []);
        await coordinator.onNoteOpen('note-1', 'Content.', []); // Immediate reopen

        expect(mockKittCore.scan).toHaveBeenCalledTimes(1);
    });

    // =========================================================================
    // RESULT PROPAGATION
    // =========================================================================

    it('should upsert relations to graph registry', async () => {
        mockKittCore.extractRelations.mockResolvedValueOnce([
            { source_id: 'e1', target_id: 'e2', kind: 'KNOWS', confidence: 0.9 },
        ]);

        coordinator.onEntityDecoration(
            { type: 'entity', from: 0, to: 5, label: 'Alice', kind: 'CHARACTER', resolved: true, entityId: 'e1' },
            'note-1'
        );
        coordinator.onEntityDecoration(
            { type: 'entity', from: 10, to: 13, label: 'Bob', kind: 'CHARACTER', resolved: true, entityId: 'e2' },
            'note-1'
        );
        coordinator.onKeystroke('.', 20, 'Alice met Bob.', 'note-1');

        await vi.runAllTimersAsync();

        expect(mockGraphRegistry.upsertRelationship).toHaveBeenCalledWith(
            expect.objectContaining({ kind: 'KNOWS' })
        );
    });

    it('should emit new relations via callback', async () => {
        mockKittCore.extractRelations.mockResolvedValueOnce([
            { source_id: 'e1', target_id: 'e2', kind: 'LOVES', confidence: 0.85 },
        ]);

        coordinator.onEntityDecoration(
            { type: 'entity', from: 0, to: 5, label: 'Romeo', kind: 'CHARACTER', resolved: true, entityId: 'e1' },
            'note-1'
        );
        coordinator.onEntityDecoration(
            { type: 'entity', from: 10, to: 16, label: 'Juliet', kind: 'CHARACTER', resolved: true, entityId: 'e2' },
            'note-1'
        );
        coordinator.onKeystroke('.', 25, 'Romeo loves Juliet.', 'note-1');

        await vi.runAllTimersAsync();

        expect(relationsEmitted).toHaveLength(1);
        expect(relationsEmitted[0][0].kind).toBe('LOVES');
    });

    // =========================================================================
    // DEDUPLICATION
    // =========================================================================

    it('should not re-extract same entities same position', async () => {
        const span: DecorationSpan = {
            type: 'entity',
            from: 0,
            to: 5,
            label: 'Dave',
            kind: 'CHARACTER',
            resolved: true,
        };

        coordinator.onEntityDecoration(span, 'note-1');
        coordinator.onKeystroke('.', 10, 'Dave runs.', 'note-1');
        await vi.runAllTimersAsync();

        coordinator.onEntityDecoration(span, 'note-1');
        coordinator.onKeystroke('.', 10, 'Dave runs.', 'note-1');
        await vi.runAllTimersAsync();

        expect(mockKittCore.extractRelations).toHaveBeenCalledTimes(1);
    });

    // =========================================================================
    // ERROR HANDLING
    // =========================================================================

    it('should handle WASM errors gracefully', async () => {
        mockKittCore.extractRelations.mockRejectedValueOnce(new Error('WASM panic'));

        coordinator.onEntityDecoration(
            { type: 'entity', from: 0, to: 5, label: 'Eve', kind: 'CHARACTER', resolved: true },
            'note-1'
        );
        coordinator.onKeystroke('.', 10, 'Eve here.', 'note-1');

        // Should not throw
        await expect(vi.runAllTimersAsync()).resolves.not.toThrow();
    });

    // =========================================================================
    // METRICS
    // =========================================================================

    it('should track scan metrics', async () => {
        coordinator.onEntityDecoration(
            { type: 'entity', from: 0, to: 5, label: 'Frank', kind: 'CHARACTER', resolved: true },
            'note-1'
        );
        coordinator.onKeystroke('.', 10, 'Frank.', 'note-1');
        await vi.runAllTimersAsync();

        const stats = coordinator.getStats();
        expect(stats.entityEventsReceived).toBeGreaterThan(0);
        expect(stats.scansTriggered).toBe(1);
    });
});
