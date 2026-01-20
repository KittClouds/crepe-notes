// src/lib/registry/index.ts
// Entity Registry module exports

// =============================================================================
// BACKEND SELECTION
// =============================================================================
// Set to true to use Rust CozoDB backend, false for TS CozoDB backend
const USE_RUST_BACKEND = true; // Phase 3: Rust backend enabled


// =============================================================================
// EXPORTS
// =============================================================================

// Types (same for both backends)
export type {
    RegisteredEntity,
    EntityDefinition,
    EntityRegistrationResult,
    Edge,
} from './SmartGraphRegistry';

// Re-export both backends for explicit imports
export { SmartGraphRegistryFacade, smartGraphRegistry as tsSmartGraphRegistry, entityRegistry } from './SmartGraphRegistry';
export { RustSmartGraphRegistry, rustSmartGraphRegistry } from './RustSmartGraphRegistry';

// =============================================================================
// SINGLETON (controlled swap)
// =============================================================================
import { smartGraphRegistry as _tsRegistry } from './SmartGraphRegistry';
import { rustSmartGraphRegistry as _rustRegistry } from './RustSmartGraphRegistry';

/**
 * The active entity registry singleton.
 * Controlled by USE_RUST_BACKEND flag above.
 */
export const smartGraphRegistry = USE_RUST_BACKEND ? _rustRegistry : _tsRegistry;
