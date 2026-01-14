// src/lib/tauri/index.ts
// Tauri Utilities & TauRPC Bridge
//
// ┌─────────────────────────────────────────────────────────────────────────────┐
// │  BROWSER DEV MODE: All calls return stubs                                  │
// │  TAURI MODE: TODO - Wire to real TauRPC bindings                          │
// └─────────────────────────────────────────────────────────────────────────────┘

/**
 * Check if we're running in Tauri environment
 */
export function isTauri(): boolean {
    return typeof window !== 'undefined' &&
        '__TAURI__' in window &&
        (window as any).__TAURI__ !== undefined;
}

// Re-export TauRPC proxy and types
export { taurpc, createTauRPCProxy } from './taurpc';
export * from './taurpc/types';

// Re-export registry for backwards compat
export { smartGraphRegistry } from '@/lib/registry';

// Re-export network bridge (used by storage-adapter)
export { networkBridge, type SurrealNetwork, type SurrealRelationship, type SurrealMember } from './network-bridge';
