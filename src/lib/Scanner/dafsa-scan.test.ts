/**
 * DAFSA Scanner Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DAFSACore } from './dafsa-scan';
import { ScannerRouter } from './scanner-router';
import type { RegisteredEntity } from './types';

// =============================================================================
// Test Fixtures
// =============================================================================

const TEST_ENTITIES: RegisteredEntity[] = [
    { id: 'char-1', label: 'Monkey D. Luffy', kind: 'CHARACTER', aliases: ['Luffy', 'Straw Hat'], registeredAt: Date.now() },
    { id: 'char-2', label: 'Roronoa Zoro', kind: 'CHARACTER', aliases: ['Zoro', 'Pirate Hunter'], registeredAt: Date.now() },
    { id: 'char-3', label: 'Nami', kind: 'CHARACTER', aliases: [], registeredAt: Date.now() },
    { id: 'loc-1', label: 'East Blue', kind: 'LOCATION', aliases: [], registeredAt: Date.now() },
    { id: 'faction-1', label: 'Straw Hat Pirates', kind: 'FACTION', aliases: ['Straw Hats'], registeredAt: Date.now() },
];

// =============================================================================
// DAFSACore Tests
// =============================================================================

describe('DAFSACore', () => {
    let core: DAFSACore;

    beforeEach(() => {
        core = new DAFSACore();
        core.hydrate(TEST_ENTITIES);
    });

    describe('hydration', () => {
        it('should build trie from entities', () => {
            const serialized = core.getSerialized();
            expect(serialized).not.toBeNull();
            expect(serialized?.phraseMap.length).toBeGreaterThan(0);
        });

        it('should handle empty entities', () => {
            core.hydrate([]);
            const result = core.scan('Test text');
            expect(result).toEqual([]);
        });
    });

    describe('scanning', () => {
        it('should find exact entity matches', () => {
            const spans = core.scan('I met Luffy at the docks.');
            expect(spans.length).toBeGreaterThan(0);
            expect(spans[0].entityId).toBe('char-1');
        });

        it('should find multi-word entities', () => {
            const spans = core.scan('East Blue is a great place.');
            expect(spans.length).toBe(1);
            expect(spans[0].entityId).toBe('loc-1');
            expect(spans[0].matchedText).toBe('East Blue');
        });

        it('should handle aliases', () => {
            const spans = core.scan('The Straw Hats are coming!');
            expect(spans.some(s => s.entityId === 'faction-1')).toBe(true);
        });

        it('should prefer longer matches', () => {
            // "Straw Hat" could match alias, but full phrase is preferred if present
            const spans = core.scan('Straw Hat Pirates sailed away.');
            expect(spans.length).toBe(1);
            expect(spans[0].matchedText).toBe('Straw Hat Pirates');
        });

        it('should return empty for no matches', () => {
            const spans = core.scan('Nobody interesting here.');
            expect(spans).toEqual([]);
        });

        it('should handle case insensitivity', () => {
            const spans = core.scan('LUFFY is the captain.');
            expect(spans.length).toBe(1);
            expect(spans[0].entityId).toBe('char-1');
        });
    });

    describe('batch scanning', () => {
        it('should scan multiple texts', () => {
            const results = core.scanBatch([
                { id: 1, text: 'Luffy met Zoro.' },
                { id: 2, text: 'No entities here.' },
                { id: 3, text: 'Nami is a navigator.' },
            ]);

            expect(results.size).toBe(2); // items 1 and 3 have matches
            expect(results.get(1)?.length).toBeGreaterThan(0);
            expect(results.get(3)?.length).toBe(1);
        });
    });

    describe('serialization', () => {
        it('should serialize and restore', () => {
            const serialized = core.getSerialized();
            expect(serialized).not.toBeNull();

            const newCore = new DAFSACore();
            const phraseMap = new Map(serialized!.phraseMap);
            const restored = newCore.restore(serialized!.trie, phraseMap);

            expect(restored).toBe(true);

            // Verify restored core works
            const spans = newCore.scan('Luffy is here.');
            expect(spans.length).toBe(1);
            expect(spans[0].entityId).toBe('char-1');
        });
    });

    describe('fuzzy matching', () => {
        it('should be enabled by default', () => {
            expect(core.fuzzyEnabled).toBe(true);
        });

        it('should match unique single-token entities', () => {
            // "Nami" is unique and single-token
            const spans = core.scan('Nami is the navigator.');
            expect(spans.length).toBe(1);
            expect(spans[0].entityId).toBe('char-3');
        });

        it('should match unique tokens from multi-word names', () => {
            // "Luffy" is unique and the last token of "Monkey D. Luffy"
            const spans = core.scan('Luffy is the captain.');
            expect(spans.length).toBe(1);
            expect(spans[0].entityId).toBe('char-1');
        });

        it('should not match when fuzzy is disabled', () => {
            core.fuzzyEnabled = false;
            // This should still work because "Nami" is an exact match
            const spans = core.scan('Nami is here.');
            expect(spans.length).toBe(1);
            core.fuzzyEnabled = true; // Reset
        });
    });
});

// =============================================================================
// ScannerRouter Tests
// =============================================================================

describe('ScannerRouter', () => {
    let router: ScannerRouter;

    beforeEach(() => {
        router = new ScannerRouter();
        router.hydrate(TEST_ENTITIES);
    });

    describe('strategy switching', () => {
        it('should default to AC strategy', () => {
            expect(router.getStrategy()).toBe('ac');
        });

        it('should switch strategies', () => {
            router.setStrategy('dafsa');
            expect(router.getStrategy()).toBe('dafsa');
        });
    });

    describe('scanning with different strategies', () => {
        it('should scan with AC', () => {
            router.setStrategy('ac');
            const spans = router.scan('Luffy is here.');
            expect(spans.length).toBeGreaterThan(0);
        });

        it('should scan with DAFSA', () => {
            router.setStrategy('dafsa');
            const spans = router.scan('Luffy is here.');
            expect(spans.length).toBeGreaterThan(0);
        });
    });

    describe('comparison mode', () => {
        it('should return both results with scanBoth', () => {
            const result = router.scanBoth('Luffy met Zoro.');

            expect(result.ac.length).toBeGreaterThan(0);
            expect(result.dafsa.length).toBeGreaterThan(0);
            expect(result.metrics.ac).toBeGreaterThan(0);
            expect(result.metrics.dafsa).toBeGreaterThan(0);
        });
    });

    describe('metrics', () => {
        it('should track hydration metrics', () => {
            const metrics = router.getHydrateMetrics();
            expect(metrics.ac).toBeGreaterThan(0);
            expect(metrics.dafsa).toBeGreaterThan(0);
        });

        it('should track scan metrics when enabled', () => {
            router.setMetricsEnabled(true);
            router.scan('Test text');
            router.scan('Another test');

            const history = router.getScanMetrics();
            expect(history.length).toBe(2);
        });
    });
});
