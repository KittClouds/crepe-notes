
import type { DecorationSpan, RegisteredEntity } from './types';

// We use a raw worker import compatible with Vite
// Note: In Vite, we often use `import Worker from './implicit.worker?worker'`
// But we'll try `new Worker(new URL(...))` standard pattern if generic import fails.
// For now, let's assume standard Vite worker import syntax.

export class ImplicitScanner {
    private worker: Worker | null = null;
    private pendingScans: Map<number, (spans: DecorationSpan[]) => void> = new Map();
    private pendingBatches: Map<number, (results: Map<number, DecorationSpan[]>) => void> = new Map();
    private nextId = 1;

    // Callbacks for external subscribers (e.g. Highlighter)
    private subscribers: Set<() => void> = new Set();

    // Cache latest decorations by document ID (or text hash? - For now just ephemeral)
    // Actually, Highlighter API manages state. We just provide scan().

    constructor() {
        if (typeof window !== 'undefined') {
            this.initWorker();
        }
    }

    private initWorker() {
        try {
            // Updated import syntax for Vite 5+ / Modern bundlers
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
                        // Reconstruct Map
                        const map = new Map<number, DecorationSpan[]>();
                        for (const item of msg.results) {
                            map.set(item.id, item.spans);
                        }
                        resolve(map);
                        this.pendingBatches.delete(msg.id);
                    }
                } else if (msg.type === 'HYDRATE_DONE') {
                    console.log('[ImplicitScanner] Worker hydration complete');
                }
            };

            console.log('[ImplicitScanner] Worker initialized');
        } catch (err) {
            console.error('[ImplicitScanner] Failed to init worker:', err);
        }
    }

    hydrate(entities: RegisteredEntity[]) {
        if (!this.worker) return;
        this.worker.postMessage({ type: 'HYDRATE', entities });
    }

    scan(text: string): Promise<DecorationSpan[]> {
        if (!this.worker) return Promise.resolve([]);

        return new Promise<DecorationSpan[]>((resolve) => {
            const id = this.nextId++;
            this.pendingScans.set(id, resolve);
            this.worker!.postMessage({ type: 'SCAN', id, text });

            // Timeout safety?
            setTimeout(() => {
                if (this.pendingScans.has(id)) {
                    // console.warn('[ImplicitScanner] Scan timed out');
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
