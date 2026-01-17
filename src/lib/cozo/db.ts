/**
 * CozoDB Service - WASM + OPFS Persistence
 * 
 * Features:
 * - WASM initialization with preloading
 * - In-memory CozoDB instance
 * - OPFS persistence via Snapshot + WAL
 * - Export/import utilities
 */

import init, { CozoDb } from 'cozo-lib-wasm';
// @ts-ignore - Vite specific import
import wasmUrl from 'cozo-lib-wasm/cozo_lib_wasm_bg.wasm?url';
import { cozoPersistence } from './persistence/CozoPersistenceService';

// Relations to persist
const PERSISTED_RELATIONS = ['entities', 'edges', 'mentions', 'entity_aliases'];

export class CozoDbService {
    private db: CozoDb | null = null;
    private initPromise: Promise<void> | null = null;
    private preloadPromise: Promise<void> | null = null;
    private wasmReady = false;
    private walEntryCount = 0;
    private lastCompactTime = Date.now();
    private readonly COMPACT_THRESHOLD = 50;      // Compact after N WAL entries
    private readonly COMPACT_INTERVAL_MS = 300000; // Or after 5 minutes

    /**
     * Preload the WASM module (fire-and-forget, non-blocking)
     * Call this early in boot sequence to overlap with other init work.
     */
    preload(): Promise<void> {
        if (this.wasmReady) return Promise.resolve();
        if (this.preloadPromise) return this.preloadPromise;

        console.log('[CozoDB] Preloading WASM...');
        this.preloadPromise = init(wasmUrl).then(() => {
            this.wasmReady = true;
            console.log('[CozoDB] ✅ WASM preloaded');
        }).catch(err => {
            console.error('[CozoDB] WASM preload failed:', err);
            this.preloadPromise = null;
            throw err;
        });

        return this.preloadPromise;
    }

    /**
     * Initialize the CozoDB WASM module and restore from persistence
     */
    async init(): Promise<void> {
        if (this.db) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = this.doInit().catch(err => {
            console.error('[CozoDB] Initialization failed:', err);
            this.initPromise = null; // Reset so retry is possible
            throw err;
        });

        return this.initPromise;
    }

    /**
     * Internal initialization logic
     */
    private async doInit(): Promise<void> {
        console.log('[CozoDB] Starting initialization...');

        // Step 1: Await WASM (if preloaded) or load now
        if (this.preloadPromise) {
            await this.preloadPromise;
        } else if (!this.wasmReady) {
            await init(wasmUrl);
            this.wasmReady = true;
        }
        console.log('[CozoDB] ✅ WASM module ready');

        // Step 2: Create in-memory CozoDB instance
        this.db = CozoDb.new();
        console.log('[CozoDB] ✅ Database instance created (In-Memory)');

        // Step 3: Restore from OPFS persistence
        await this.restoreFromPersistence();
    }

    /**
     * Restore database state from OPFS snapshot + WAL
     */
    private async restoreFromPersistence(): Promise<void> {
        try {
            console.log('[CozoDB] Loading persistence...');
            const { snapshot, wal } = await cozoPersistence.load();

            // Restore snapshot if exists
            if (snapshot) {
                try {
                    // Cozo's export format wraps data - we need to handle it
                    const dataStr = typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot);
                    this.db!.import_relations(dataStr);
                    console.log('[CozoDB] ✅ Snapshot restored');
                } catch (e) {
                    console.warn('[CozoDB] Snapshot restore failed, starting fresh:', e);
                }
            }

            // Replay WAL entries
            if (wal && wal.length > 0) {
                console.log(`[CozoDB] Replaying ${wal.length} WAL entries...`);
                let replayedCount = 0;
                for (const entry of wal) {
                    try {
                        this.db!.run(entry.script, '{}', false);
                        replayedCount++;
                    } catch (e) {
                        console.warn('[CozoDB] WAL entry replay failed:', entry.script, e);
                    }
                }
                console.log(`[CozoDB] ✅ Replayed ${replayedCount}/${wal.length} WAL entries`);
                this.walEntryCount = wal.length;
            }
        } catch (e) {
            console.warn('[CozoDB] Persistence load failed, starting fresh:', e);
        }
    }

    /**
     * Check if the DB is initialized and ready.
     */
    isReady(): boolean {
        return this.db !== null;
    }

    /**
     * Check if a script is a mutation (modifies data)
     */
    private isMutationScript(script: string): boolean {
        // Cozo mutation keywords
        const mutationPatterns = [
            ':put ',
            ':rm ',
            ':replace ',
            ':create ',
            ':ensure ',
            ':insert ',
            ':delete ',
        ];
        const lowerScript = script.toLowerCase();
        return mutationPatterns.some(pattern => lowerScript.includes(pattern));
    }

    /**
     * Run a CozoScript query.
     * @param script The CozoScript query string
     * @param params Parameters as a generic object (will be JSON stringified)
     * @returns The raw string result from CozoDB
     */
    run(script: string, params: Record<string, any> = {}): string {
        if (!this.db) {
            throw new Error('[CozoDB] Not initialized. Call init() first.');
        }

        try {
            const paramsStr = JSON.stringify(params);
            const result = this.db.run(script, paramsStr, false);

            // Auto-persist mutations to WAL (fire and forget)
            // Skip schema creation scripts (already idempotent)
            if (this.isMutationScript(script) && !script.toLowerCase().includes(':create ')) {
                cozoPersistence.appendWal(script);
                this.walEntryCount++;
                this.maybeCompact();
            }

            return result;
        } catch (err) {
            console.error('[CozoDB] Query failed:', script, err);
            throw err;
        }
    }

    /**
     * Run a query and parse the result as JSON.
     */
    runQuery(script: string, params: Record<string, any> = {}): any {
        const resultStr = this.run(script, params);

        try {
            return JSON.parse(resultStr);
        } catch (e) {
            console.error('[CozoDB] Failed to parse result:', resultStr);
            throw new Error(`CozoDB result parse error: ${e}`);
        }
    }

    /**
     * Run a mutation and persist it to WAL
     * Use this for any script that modifies data (:put, :rm, :replace)
     */
    runMutation(script: string, params: Record<string, any> = {}): any {
        const result = this.runQuery(script, params);

        // Persist to WAL (fire and forget)
        cozoPersistence.appendWal(script);
        this.walEntryCount++;

        // Check if compaction is needed
        this.maybeCompact();

        return result;
    }

    /**
     * Check if compaction should run and trigger it
     */
    private maybeCompact(): void {
        const timeSinceCompact = Date.now() - this.lastCompactTime;

        if (this.walEntryCount >= this.COMPACT_THRESHOLD || timeSinceCompact >= this.COMPACT_INTERVAL_MS) {
            // Run compaction in background
            this.compact().catch(e => {
                console.warn('[CozoDB] Background compaction failed:', e);
            });
        }
    }

    /**
     * Compact: Export current state and truncate WAL
     */
    async compact(): Promise<void> {
        if (!this.db) return;

        try {
            console.log('[CozoDB] Starting compaction...');

            // Check which relations exist before exporting
            const existingRelations: string[] = [];
            for (const rel of PERSISTED_RELATIONS) {
                try {
                    this.db.run(`?[x] := *${rel}[x, ..] :limit 1`, '{}', false);
                    existingRelations.push(rel);
                } catch {
                    // Relation doesn't exist, skip
                }
            }

            if (existingRelations.length === 0) {
                console.log('[CozoDB] No relations to compact');
                return;
            }

            const exportData = this.exportRelations(existingRelations);
            await cozoPersistence.compact(exportData);

            this.walEntryCount = 0;
            this.lastCompactTime = Date.now();
            console.log('[CozoDB] ✅ Compaction complete');
        } catch (e) {
            console.error('[CozoDB] Compaction failed:', e);
        }
    }

    /**
     * Export relations as JSON string.
     * @param relations Array of relation names to export
     */
    exportRelations(relations: string[]): string {
        if (!this.db) throw new Error('[CozoDB] Not initialized');

        try {
            const payload = JSON.stringify({ relations });
            return this.db.export_relations(payload);
        } catch (err) {
            console.error('[CozoDB] Export failed:', err);
            throw err;
        }
    }

    /**
     * Import relations from JSON string.
     * @param data Serialized relations data (from exportRelations)
     */
    importRelations(data: string): string {
        if (!this.db) throw new Error('[CozoDB] Not initialized');

        try {
            return this.db.import_relations(data);
        } catch (err) {
            console.error('[CozoDB] Import failed:', err);
            throw err;
        }
    }

    /**
     * Export entire database state to downloadable JSON
     */
    async exportToFile(relations: string[]): Promise<Blob> {
        const data = this.exportRelations(relations);

        const exportData = {
            version: '2.0',
            timestamp: new Date().toISOString(),
            relations,
            data,
        };

        const json = JSON.stringify(exportData, null, 2);
        return new Blob([json], { type: 'application/json' });
    }

    /**
     * Import database state from file
     */
    async importFromFile(fileContent: string): Promise<void> {
        const parsed = JSON.parse(fileContent);

        if (!parsed.data) {
            throw new Error('Invalid export file format');
        }

        this.importRelations(parsed.data);

        // Trigger compaction to persist the import
        await this.compact();
    }

    /**
     * Close database connection (cleanup)
     */
    async close(): Promise<void> {
        // Compact before close to ensure data is saved
        await this.compact();

        this.db = null;
        this.initPromise = null;
        console.log('[CozoDB] Connection closed');
    }
}

// Singleton instance
export const cozoDb = new CozoDbService();

