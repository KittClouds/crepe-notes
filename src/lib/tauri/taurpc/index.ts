// src/lib/tauri/taurpc/index.ts
// TauRPC Unified API - Proxy-like interface matching auto-generated bindings
//
// When real bindings are generated:
//   import { createTauRPCProxy } from '../bindings.ts'
//   const taurpc = createTauRPCProxy()
//
// For now (browser dev):
//   import { taurpc } from '@/lib/tauri/taurpc'

import { coreApi } from './core';
import { contentApi } from './content';

// Export types
export * from './types';

/**
 * TauRPC Proxy - mirrors the structure of auto-generated bindings
 * 
 * Usage:
 *   await taurpc.core.version()
 *   await taurpc.content.listNotes()
 */
export const taurpc = {
    core: coreApi,
    content: contentApi,
    // TODO: Add when implemented
    // graph: graphApi,
    // ner: nerApi,
    // fst_ner: fstNerApi,
    // rag: ragApi,
    // blueprint: blueprintApi,
    // time_registry: timeRegistryApi,
};

/**
 * Creates a TauRPC proxy - matches the auto-generated function
 * This allows drop-in replacement when real bindings are generated
 */
export function createTauRPCProxy() {
    return taurpc;
}

// Default export for convenience
export default taurpc;
