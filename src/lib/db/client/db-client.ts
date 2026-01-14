// src/lib/db/client/db-client.ts
// Database Client Stub - will be replaced by Tauri backend
//
// This is a placeholder that provides a consistent interface while the
// actual database backend is being implemented in Rust.

interface DbClient {
    query<T>(sql: string, params?: any[]): Promise<T[]>;
}

class StubDbClient implements DbClient {
    async query<T>(sql: string, params?: any[]): Promise<T[]> {
        console.warn('[DbClient] Stub called - not implemented:', sql.slice(0, 50));
        // Return empty array - no persistence until Tauri backend is wired
        return [];
    }
}

/**
 * Database client instance
 * 
 * TODO: Replace with Tauri backend:
 * - import { invoke } from '@tauri-apps/api/tauri';
 * - query<T>(sql, params) { return invoke('db_query', { sql, params }); }
 */
export const dbClient: DbClient = new StubDbClient();
