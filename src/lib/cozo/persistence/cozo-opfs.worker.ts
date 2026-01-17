/// <reference lib="webworker" />
import { CozoOpfsAdapter, type WalEntry } from './cozo-opfs-core';

// ==========================================
// Worker Handler
// ==========================================

const adapter = new CozoOpfsAdapter();

self.onmessage = async (e: MessageEvent) => {
    const { id, type, payload } = e.data;

    try {
        switch (type) {
            case 'LOAD': {
                try {
                    const snapshot = await adapter.loadSnapshot();
                    const wal = await adapter.loadWal();
                    self.postMessage({ id, type: 'LOAD_RESULT', success: true, data: { snapshot, wal } });
                } catch (err: any) {
                    self.postMessage({ id, type: 'LOAD_RESULT', success: false, error: err.message });
                }
                break;
            }

            case 'APPEND_WAL': {
                try {
                    const entry: WalEntry = payload;
                    await adapter.appendWal(entry);
                    self.postMessage({ id, type: 'APPEND_WAL_RESULT', success: true });
                } catch (err: any) {
                    console.error("[CozoOpfsWorker] Append WAL failed", err);
                    self.postMessage({ id, type: 'APPEND_WAL_RESULT', success: false, error: err.message });
                }
                break;
            }

            case 'SAVE_SNAPSHOT': {
                try {
                    await adapter.saveSnapshot(payload);
                    self.postMessage({ id, type: 'SAVE_SNAPSHOT_RESULT', success: true });
                } catch (err: any) {
                    console.error("[CozoOpfsWorker] Save snapshot failed", err);
                    self.postMessage({ id, type: 'SAVE_SNAPSHOT_RESULT', success: false, error: err.message });
                }
                break;
            }

            case 'TRUNCATE_WAL': {
                try {
                    await adapter.truncateWal();
                    self.postMessage({ id, type: 'TRUNCATE_WAL_RESULT', success: true });
                } catch (err: any) {
                    console.error("[CozoOpfsWorker] Truncate WAL failed", err);
                    self.postMessage({ id, type: 'TRUNCATE_WAL_RESULT', success: false, error: err.message });
                }
                break;
            }

            default:
                console.warn("[CozoOpfsWorker] Unknown message type:", type);
                self.postMessage({ id, type: 'ERROR', success: false, error: `Unknown type: ${type}` });
        }
    } catch (err: any) {
        console.error("[CozoOpfsWorker] Fatal error", err);
        self.postMessage({ id, type: 'ERROR', success: false, error: err.message });
    }
};

console.log('[CozoOpfsWorker] Worker initialized');
