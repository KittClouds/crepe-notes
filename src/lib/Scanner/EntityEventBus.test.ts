/**
 * EntityEventBus - TDD Contract
 * 
 * Collects entity events from the highlighter, waits for punctuation
 * or idle, then emits a scan request with the relevant span.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EntityEventBus, type EntityEvent, type ScanRequest } from './EntityEventBus';
import type { DecorationSpan } from './types';

describe('EntityEventBus', () => {
    let bus: EntityEventBus;
    let emittedRequests: ScanRequest[];

    beforeEach(() => {
        vi.useFakeTimers();
        emittedRequests = [];
        bus = new EntityEventBus({
            onScanRequest: (req) => emittedRequests.push(req),
            idleTimeoutMs: 500,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        bus.dispose();
    });

    // =========================================================================
    // ENTITY DETECTION
    // =========================================================================

    it('should queue entity when detected', () => {
        const span: DecorationSpan = {
            type: 'entity',
            from: 0,
            to: 5,
            label: 'Alice',
            kind: 'CHARACTER',
            resolved: true,
        };

        bus.onEntityDetected(span, 'note-1');

        expect(bus.pendingCount).toBe(1);
    });

    it('should not emit immediately on entity detection', () => {
        const span: DecorationSpan = {
            type: 'entity',
            from: 0,
            to: 5,
            label: 'Alice',
            kind: 'CHARACTER',
            resolved: true,
        };

        bus.onEntityDetected(span, 'note-1');

        expect(emittedRequests).toHaveLength(0);
    });

    // =========================================================================
    // PUNCTUATION TRIGGER
    // =========================================================================

    it('should emit scan request on punctuation after entity', () => {
        const span: DecorationSpan = {
            type: 'entity',
            from: 10,
            to: 15,
            label: 'Alice',
            kind: 'CHARACTER',
            resolved: true,
        };

        bus.onEntityDetected(span, 'note-1');
        bus.onKeystroke('.', 20, 'Alice walked home.');

        expect(emittedRequests).toHaveLength(1);
        expect(emittedRequests[0].noteId).toBe('note-1');
        expect(emittedRequests[0].entities).toContainEqual(expect.objectContaining({ label: 'Alice' }));
    });

    it('should trigger on various sentence-ending punctuation', () => {
        const span: DecorationSpan = {
            type: 'entity',
            from: 0,
            to: 5,
            label: 'Bob',
            kind: 'CHARACTER',
            resolved: true,
        };

        // Period
        bus.onEntityDetected(span, 'note-1');
        bus.onKeystroke('.', 10, 'Bob runs.');
        expect(emittedRequests).toHaveLength(1);

        // Question mark
        bus.onEntityDetected(span, 'note-1');
        bus.onKeystroke('?', 10, 'Is Bob here?');
        expect(emittedRequests).toHaveLength(2);

        // Exclamation
        bus.onEntityDetected(span, 'note-1');
        bus.onKeystroke('!', 10, 'Run Bob!');
        expect(emittedRequests).toHaveLength(3);
    });

    it('should NOT trigger on comma or semicolon', () => {
        const span: DecorationSpan = {
            type: 'entity',
            from: 0,
            to: 5,
            label: 'Carol',
            kind: 'CHARACTER',
            resolved: true,
        };

        bus.onEntityDetected(span, 'note-1');
        bus.onKeystroke(',', 10, 'Carol, wait');

        expect(emittedRequests).toHaveLength(0);
    });

    // =========================================================================
    // IDLE TRIGGER
    // =========================================================================

    it('should emit on idle timeout if entities pending', async () => {
        const span: DecorationSpan = {
            type: 'entity',
            from: 0,
            to: 5,
            label: 'Dave',
            kind: 'CHARACTER',
            resolved: true,
        };

        bus.onEntityDetected(span, 'note-1');

        // Fast-forward past idle timeout
        vi.advanceTimersByTime(600);

        expect(emittedRequests).toHaveLength(1);
        expect(emittedRequests[0].trigger).toBe('idle');
    });

    it('should reset idle timer on keystroke', () => {
        const span: DecorationSpan = {
            type: 'entity',
            from: 0,
            to: 5,
            label: 'Eve',
            kind: 'CHARACTER',
            resolved: true,
        };

        bus.onEntityDetected(span, 'note-1');

        // Type before idle triggers
        vi.advanceTimersByTime(400);
        bus.onKeystroke('a', 6, 'Eve a');

        // Still not triggered
        vi.advanceTimersByTime(400);
        expect(emittedRequests).toHaveLength(0);

        // Now idle expires
        vi.advanceTimersByTime(200);
        expect(emittedRequests).toHaveLength(1);
    });

    // =========================================================================
    // DEDUPLICATION
    // =========================================================================

    it('should not emit same span twice', () => {
        const span: DecorationSpan = {
            type: 'entity',
            from: 0,
            to: 5,
            label: 'Frank',
            kind: 'CHARACTER',
            resolved: true,
        };

        bus.onEntityDetected(span, 'note-1');
        bus.onKeystroke('.', 10, 'Frank runs.');

        // Same entity again
        bus.onEntityDetected(span, 'note-1');
        bus.onKeystroke('.', 10, 'Frank runs.');

        expect(emittedRequests).toHaveLength(1);
    });

    it('should emit again if span position changes', () => {
        const span1: DecorationSpan = {
            type: 'entity',
            from: 0,
            to: 5,
            label: 'Grace',
            kind: 'CHARACTER',
            resolved: true,
        };

        const span2: DecorationSpan = {
            type: 'entity',
            from: 20,
            to: 25,
            label: 'Grace',
            kind: 'CHARACTER',
            resolved: true,
        };

        bus.onEntityDetected(span1, 'note-1');
        bus.onKeystroke('.', 10, 'Grace runs.');

        bus.onEntityDetected(span2, 'note-1');
        bus.onKeystroke('.', 30, 'Another Grace here.');

        expect(emittedRequests).toHaveLength(2);
    });

    // =========================================================================
    // BATCHING
    // =========================================================================

    it('should batch multiple entities into one request', () => {
        const alice: DecorationSpan = {
            type: 'entity',
            from: 0,
            to: 5,
            label: 'Alice',
            kind: 'CHARACTER',
            resolved: true,
        };

        const bob: DecorationSpan = {
            type: 'entity',
            from: 10,
            to: 13,
            label: 'Bob',
            kind: 'CHARACTER',
            resolved: true,
        };

        bus.onEntityDetected(alice, 'note-1');
        bus.onEntityDetected(bob, 'note-1');
        bus.onKeystroke('.', 20, 'Alice met Bob.');

        expect(emittedRequests).toHaveLength(1);
        expect(emittedRequests[0].entities).toHaveLength(2);
    });

    // =========================================================================
    // NOTE SWITCHING
    // =========================================================================

    it('should flush pending on note change', () => {
        const span: DecorationSpan = {
            type: 'entity',
            from: 0,
            to: 5,
            label: 'Henry',
            kind: 'CHARACTER',
            resolved: true,
        };

        bus.onEntityDetected(span, 'note-1');
        bus.onNoteChange('note-2');

        expect(emittedRequests).toHaveLength(1);
        expect(emittedRequests[0].noteId).toBe('note-1');
        expect(emittedRequests[0].trigger).toBe('note-change');
    });
});
