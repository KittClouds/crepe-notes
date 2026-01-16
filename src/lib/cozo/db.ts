/**
 * CozoDB Service - WASM Only (Sanitized)
 * 
 * Features:
 * - WASM initialization
 * - In-memory CozoDB instance
 * - NO SQLite persistence (removed for migration)
 * - Export/import utilities
 */

import init, { CozoDb } from 'cozo-lib-wasm';
// @ts-ignore - Vite specific import
import wasmUrl from 'cozo-lib-wasm/cozo_lib_wasm_bg.wasm?url';

export class CozoDbService {
    private db: CozoDb | null = null;
    private initPromise: Promise<void> | null = null;

    /**
     * Initialize the CozoDB WASM module
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
        // console.log('[CozoDB] Starting initialization...');

        // Step 1: Initialize WASM module
        await init(wasmUrl);
        // console.log('[CozoDB] ✅ WASM module loaded');

        // Step 2: Create in-memory CozoDB instance
        this.db = CozoDb.new();
        // console.log('[CozoDB] ✅ Database instance created (In-Memory)');
    }

    /**
     * Check if the DB is initialized and ready.
     */
    isReady(): boolean {
        return this.db !== null;
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
    }

    /**
     * Close database connection (cleanup)
     */
    async close(): Promise<void> {
        this.db = null;
        this.initPromise = null;
        console.log('[CozoDB] Connection closed');
    }
}

// Singleton instance
export const cozoDb = new CozoDbService();
