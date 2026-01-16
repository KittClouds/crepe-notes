
import { ImplicitCore } from './implicit-core.copy';
import type { RegisteredEntity, DecorationSpan } from './types';

// Worker State
const core = new ImplicitCore();

// Message Types
type WorkerMessage =
    | { type: 'HYDRATE'; entities: RegisteredEntity[] }
    | { type: 'SCAN'; id: number; text: string }
    | { type: 'SCAN_BATCH'; id: number; items: { id: number, text: string }[] };

type WorkerResponse =
    | { type: 'SCAN_RESULT'; id: number; spans: DecorationSpan[] }
    | { type: 'SCAN_BATCH_RESULT'; id: number; results: { id: number; spans: DecorationSpan[] }[] }
    | { type: 'HYDRATE_DONE' }; // Optional ack

// Event Listener
self.onmessage = (e: MessageEvent<WorkerMessage>) => {
    const msg = e.data;

    switch (msg.type) {
        case 'HYDRATE':
            try {
                core.hydrate(msg.entities);
                postMessage({ type: 'HYDRATE_DONE' });
            } catch (err) {
                console.error('[ImplicitWorker] Hydration failed:', err);
            }
            break;

        case 'SCAN':
            try {
                const spans = core.scan(msg.text);
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
                const resultMap = core.scanBatch(msg.items);
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
console.log('[ImplicitWorker] Started');
