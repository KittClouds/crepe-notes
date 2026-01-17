/// <reference lib="webworker" />
import { OpfsHardenedSnapshotAdapter } from './opfs-core';

// ==========================================
// Worker Handler
// ==========================================

const adapter = new OpfsHardenedSnapshotAdapter();

self.onmessage = async (e: MessageEvent) => {
    const { id, type, payload } = e.data;

    try {
        if (type === 'LOAD') {
            try {
                const data = await adapter.load();
                self.postMessage({ id, type: 'LOAD_RESULT', success: true, data });
            } catch (err: any) {
                self.postMessage({ id, type: 'LOAD_RESULT', success: false, error: err.message });
            }
        } else if (type === 'SAVE') {
            try {
                await adapter.save(payload);
                self.postMessage({ id, type: 'SAVE_RESULT', success: true });
            } catch (err: any) {
                console.error("Worker Save Failed", err);
                self.postMessage({ id, type: 'SAVE_RESULT', success: false, error: err.message });
            }
        }
    } catch (err: any) {
        console.error("Worker Fatal", err);
        self.postMessage({ id, type: 'ERROR', success: false, error: err.message });
    }
};

console.log('[OpfsWorker] Worker initialized');
