/**
 * Scanner Router - A/B Testing between AC and DAFSA
 * 
 * Provides unified interface while allowing runtime strategy switching.
 * Metrics can be collected for comparison.
 */

import { ImplicitCore } from './implicit-scan';
import { DAFSACore } from './dafsa-scan';
import type { DecorationSpan, RegisteredEntity } from './types';

// =============================================================================
// Types
// =============================================================================

export type ScannerStrategy = 'ac' | 'dafsa';

export type ScanMetrics = {
    strategy: ScannerStrategy;
    hydrateTimeMs: number;
    scanTimeMs: number;
    spanCount: number;
};

// =============================================================================
// Scanner Router
// =============================================================================

export class ScannerRouter {
    private strategy: ScannerStrategy = 'ac';
    private acScanner: ImplicitCore;
    private dafsaScanner: DAFSACore;

    // Metrics for A/B comparison
    private lastHydrateMetrics: { ac: number; dafsa: number } = { ac: 0, dafsa: 0 };
    private scanMetricsHistory: ScanMetrics[] = [];
    private metricsEnabled: boolean = false;

    constructor() {
        this.acScanner = new ImplicitCore();
        this.dafsaScanner = new DAFSACore();
    }

    /**
     * Set active scanning strategy
     */
    setStrategy(strategy: ScannerStrategy): void {
        console.log(`[ScannerRouter] Strategy changed: ${this.strategy} → ${strategy}`);
        this.strategy = strategy;
    }

    /**
     * Get current strategy
     */
    getStrategy(): ScannerStrategy {
        return this.strategy;
    }

    /**
     * Enable/disable metrics collection
     */
    setMetricsEnabled(enabled: boolean): void {
        this.metricsEnabled = enabled;
        if (!enabled) {
            this.scanMetricsHistory = [];
        }
    }

    /**
     * Hydrate both scanners (for A/B testing)
     */
    hydrate(entities: RegisteredEntity[]): void {
        // Hydrate AC
        const acStart = performance.now();
        this.acScanner.hydrate(entities);
        this.lastHydrateMetrics.ac = performance.now() - acStart;

        // Hydrate DAFSA
        const dafsaStart = performance.now();
        this.dafsaScanner.hydrate(entities);
        this.lastHydrateMetrics.dafsa = performance.now() - dafsaStart;

        console.log(`[ScannerRouter] Hydration times: AC=${this.lastHydrateMetrics.ac.toFixed(1)}ms, DAFSA=${this.lastHydrateMetrics.dafsa.toFixed(1)}ms`);
    }

    /**
     * Hydrate only the active scanner (production mode)
     */
    hydrateActive(entities: RegisteredEntity[]): void {
        const start = performance.now();

        if (this.strategy === 'ac') {
            this.acScanner.hydrate(entities);
            this.lastHydrateMetrics.ac = performance.now() - start;
        } else {
            this.dafsaScanner.hydrate(entities);
            this.lastHydrateMetrics.dafsa = performance.now() - start;
        }
    }

    /**
     * Scan text using active strategy
     */
    scan(text: string): DecorationSpan[] {
        const start = performance.now();

        const spans = this.strategy === 'ac'
            ? this.acScanner.scan(text)
            : this.dafsaScanner.scan(text);

        if (this.metricsEnabled) {
            this.scanMetricsHistory.push({
                strategy: this.strategy,
                hydrateTimeMs: this.lastHydrateMetrics[this.strategy],
                scanTimeMs: performance.now() - start,
                spanCount: spans.length,
            });
        }

        return spans;
    }

    /**
     * Scan with BOTH strategies (for comparison)
     */
    scanBoth(text: string): { ac: DecorationSpan[]; dafsa: DecorationSpan[]; metrics: { ac: number; dafsa: number } } {
        const acStart = performance.now();
        const acSpans = this.acScanner.scan(text);
        const acTime = performance.now() - acStart;

        const dafsaStart = performance.now();
        const dafsaSpans = this.dafsaScanner.scan(text);
        const dafsaTime = performance.now() - dafsaStart;

        return {
            ac: acSpans,
            dafsa: dafsaSpans,
            metrics: { ac: acTime, dafsa: dafsaTime },
        };
    }

    /**
     * Batch scan using active strategy
     */
    scanBatch(items: { id: number; text: string }[]): Map<number, DecorationSpan[]> {
        return this.strategy === 'ac'
            ? this.acScanner.scanBatch(items)
            : this.dafsaScanner.scanBatch(items);
    }

    /**
     * Get hydration metrics
     */
    getHydrateMetrics(): { ac: number; dafsa: number } {
        return { ...this.lastHydrateMetrics };
    }

    /**
     * Get scan metrics history
     */
    getScanMetrics(): ScanMetrics[] {
        return [...this.scanMetricsHistory];
    }

    /**
     * Get DAFSA serialized state for caching
     */
    getDAFSASerialized(): ReturnType<DAFSACore['getSerialized']> {
        return this.dafsaScanner.getSerialized();
    }

    /**
     * Restore DAFSA from cache
     */
    restoreDAFSA(serialized: string, phraseMap: Map<string, { id: string; label: string; kind: string }[]>): boolean {
        return this.dafsaScanner.restore(serialized, phraseMap as any);
    }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const scannerRouter = new ScannerRouter();
