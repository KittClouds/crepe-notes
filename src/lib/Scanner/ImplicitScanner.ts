
import type { DecorationSpan, RegisteredEntity } from './types';

export class ImplicitScanner {
    private worker: Worker | null = null;
    private pendingScans: Map<number, (spans: DecorationSpan[]) => void> = new Map();
    private pendingBatches: Map<number, (results: Map<number, DecorationSpan[]>) => void> = new Map();
    private nextId = 1;

    constructor() {
        if (typeof window !== 'undefined') {
            this.initWorker();
        }
    }

    private initWorker() {
        try {
            this.worker = new Worker(new URL('./implicit.worker.ts', import.meta.url), {
                type: 'module'
            });

            this.worker.onmessage = (e) => {
                const msg = e.data;

                if (msg.type === 'SCAN_RESULT') {
                    const resolve = this.pendingScans.get(msg.id);
                    if (resolve) {
                        resolve(msg.spans);
                        this.pendingScans.delete(msg.id);
                    }
                } else if (msg.type === 'SCAN_BATCH_RESULT') {
                    const resolve = this.pendingBatches.get(msg.id);
                    if (resolve) {
                        const map = new Map<number, DecorationSpan[]>();
                        for (const item of msg.results) {
                            map.set(item.id, item.spans);
                        }
                        resolve(map);
                        this.pendingBatches.delete(msg.id);
                    }
                } else if (msg.type === 'HYDRATE_DONE') {
                    // console.log('[ImplicitScanner] Hydration complete');
                }
            };

            console.log('[ImplicitScanner] Worker initialized');
        } catch (err) {
            console.error('[ImplicitScanner] Failed to init worker:', err);
        }
    }

    hydrate(entities: RegisteredEntity[], entityVersion: number = 0) {
        // console.log(`[ImplicitScanner:DIAG] hydrate() called: ${entities.length} entities, version=${entityVersion}`);
        if (!this.worker) {
            console.error('[ImplicitScanner:DIAG] No worker! Cannot hydrate.');
            return;
        }
        this.worker.postMessage({ type: 'HYDRATE', entities, entityVersion });
    }

    scan(text: string): Promise<DecorationSpan[]> {
        if (!this.worker) return Promise.resolve([]);

        return new Promise<DecorationSpan[]>((resolve) => {
            const id = this.nextId++;
            this.pendingScans.set(id, resolve);
            this.worker!.postMessage({ type: 'SCAN', id, text });

            // Timeout safety
            setTimeout(() => {
                if (this.pendingScans.has(id)) {
                    this.pendingScans.delete(id);
                    resolve([]);
                }
            }, 5000);
        });
    }

    scanBatch(items: { id: number, text: string }[]): Promise<Map<number, DecorationSpan[]>> {
        if (!this.worker) return Promise.resolve(new Map());

        return new Promise<Map<number, DecorationSpan[]>>((resolve) => {
            const id = this.nextId++;
            this.pendingBatches.set(id, resolve);
            this.worker!.postMessage({ type: 'SCAN_BATCH', id, items });

            setTimeout(() => {
                if (this.pendingBatches.has(id)) {
                    this.pendingBatches.delete(id);
                    resolve(new Map());
                }
            }, 5000);
        });
    }

    terminate() {
        this.worker?.terminate();
        this.worker = null;
    }
}

export const implicitScanner = new ImplicitScanner();
