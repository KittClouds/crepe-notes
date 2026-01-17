/**
 * Singleton ScanCoordinator instance
 * 
 * Lazy initialization to avoid circular imports.
 * Wired to kittCore and graphRegistry.
 */

import { ScanCoordinator } from './ScanCoordinator';
import { kittCore } from '../kittcore';
import type { EntitySpan, ExtractedRelation } from '../kittcore';

let _instance: ScanCoordinator | null = null;

/**
 * Get or create the singleton ScanCoordinator.
 * Lazy initialization allows dependencies to be ready first.
 */
export function getScanCoordinator(): ScanCoordinator {
    if (!_instance) {
        _instance = new ScanCoordinator({
            kittCore: {
                scan: async (content: string, entities: EntitySpan[]) => {
                    return kittCore.scan(content, entities);
                },
                extractRelations: async (content: string, entities: EntitySpan[]) => {
                    return kittCore.extractRelations(content, entities);
                },
            },
            graphRegistry: {
                upsertRelationship: async (rel: ExtractedRelation) => {
                    // GraphRegistry integration - can be wired later
                    console.log('[ScanCoordinator] Would upsert relation:', rel.kind);
                    // TODO: Wire to actual graphRegistry when ready
                },
            },
            onNewRelations: (relations: ExtractedRelation[]) => {
                console.log(`[ScanCoordinator] Extracted ${relations.length} new relations`);
            },
            idleTimeoutMs: 500,
        });
    }
    return _instance;
}

/**
 * Reset singleton (for testing)
 */
export function resetScanCoordinator(): void {
    if (_instance) {
        _instance.dispose();
        _instance = null;
    }
}
