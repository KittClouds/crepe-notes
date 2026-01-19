
import { DAFSACore } from './dafsa-scan';
import type { RegisteredEntity, DecorationSpan } from './types';

interface Scanner {
    hydrate(entities: RegisteredEntity[]): void;
    scan(text: string): DecorationSpan[];
    scanBatch(items: { id: number; text: string }[]): Map<number, DecorationSpan[]>;
}

// Worker State
const dafsaCore = new DAFSACore();
let lastEntityVersion = -1;

// =============================================================================
// Message Types
// =============================================================================

type WorkerMessage =
    | { type: 'HYDRATE'; entities: RegisteredEntity[]; entityVersion: number }
    | { type: 'SCAN'; id: number; text: string }
    | { type: 'SCAN_BATCH'; id: number; items: { id: number, text: string }[] }
    // Legacy messages (ignored)
    | { type: 'SET_STRATEGY'; strategy: string }
    | { type: 'GET_STRATEGY' };

// =============================================================================
// Event Listener
// =============================================================================

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
    const msg = e.data;

    switch (msg.type) {
        case 'SET_STRATEGY':
        case 'GET_STRATEGY':
            // Deprecated: No-op
            break;

        case 'HYDRATE':
            try {
                // Skip hydration if version unchanged
                if (msg.entityVersion === lastEntityVersion) {
                    // console.log('[ImplicitWorker] Skipping hydration (version unchanged)');
                    postMessage({ type: 'HYDRATE_DONE', skipped: true });
                    break;
                }

                lastEntityVersion = msg.entityVersion;

                const dafsaStart = performance.now();
                dafsaCore.hydrate(msg.entities);
                const dafsaTime = performance.now() - dafsaStart;

                console.log(`[ImplicitWorker] Hydrated DAFSA in ${dafsaTime.toFixed(1)}ms`);
                postMessage({ type: 'HYDRATE_DONE', skipped: false });
            } catch (err) {
                console.error('[ImplicitWorker] Hydration failed:', err);
            }
            break;

        case 'SCAN':
            try {
                const start = performance.now();
                const spans = dafsaCore.scan(msg.text);
                const elapsed = performance.now() - start;

                // Log slow scans only
                if (elapsed > 10) {
                    console.log(`[ImplicitWorker] Scan: ${spans.length} spans in ${elapsed.toFixed(1)}ms`);
                }

                postMessage({
                    type: 'SCAN_RESULT',
                    id: msg.id,
                    spans
                });
            } catch (err) {
                console.error('[ImplicitWorker] Scan failed:', err);
                postMessage({
                    type: 'SCAN_RESULT',
                    id: msg.id,
                    spans: []
                });
            }
            break;

        case 'SCAN_BATCH':
            try {
                // console.log(`[ImplicitWorker:DIAG] SCAN_BATCH: ${msg.items.length} items`);
                const resultMap = dafsaCore.scanBatch(msg.items);

                // Convert Map to array for transport
                const results: { id: number; spans: DecorationSpan[] }[] = [];
                for (const [itemId, spans] of resultMap.entries()) {
                    results.push({ id: itemId, spans });
                }

                postMessage({
                    type: 'SCAN_BATCH_RESULT',
                    id: msg.id,
                    results
                });
            } catch (err) {
                console.error('[ImplicitWorker] Batch scan failed:', err);
                postMessage({
                    type: 'SCAN_BATCH_RESULT',
                    id: msg.id,
                    results: []
                });
            }
            break;
    }
};

// Signal ready
console.log('[ImplicitWorker] Started (DAFSA only)');
