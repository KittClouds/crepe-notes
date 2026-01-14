// src/lib/utils/ids.ts
// ID generation utilities

/**
 * Generate a unique ID using crypto.randomUUID
 */
export function generateId(): string {
    return crypto.randomUUID();
}
