// src/lib/nebuladb/sync.ts
// Sync Orchestrator: NebulaDB ↔ CozoDB background sync
// NebulaDB = client-facing DB (instant), Cozo = backend graph store (async)

import { syncOutbox, entities, edges, nebulaDb } from './db';
import { cozoGraphRegistry, type CozoEntity } from '@/lib/cozo/graph/GraphRegistry';

// ============================================================================
// SYNC STATE
// ============================================================================

let syncInProgress = false;
let syncLoopStarted = false;

// ============================================================================
// NEBULADB → COZO (Push outbox to backend)
// ============================================================================

/**
 * Push pending writes from NebulaDB outbox to CozoDB
 */
export async function pushToCozoDB(): Promise<number> {
    if (syncInProgress) return 0;
    syncInProgress = true;

    let pushed = 0;

    try {
        const pending = await syncOutbox.find({});
        // Sort by clientTs
        pending.sort((a, b) => (a.clientTs || 0) - (b.clientTs || 0));

        if (pending.length === 0) return 0;

        console.log(`[SyncOrchestrator] Pushing ${pending.length} entries to CozoDB...`);

        for (const entry of pending) {
            try {
                const data = JSON.parse(entry.data);

                switch (entry.table) {
                    case 'notes':
                        if (entry.op === 'delete') {
                            console.log(`[SyncOrchestrator] Delete note ${entry.pk} (noop for now)`);
                        } else {
                            console.log(`[SyncOrchestrator] Upsert note ${entry.pk} (noop for now)`);
                        }
                        break;

                    case 'entities':
                        if (entry.op === 'upsert' && data.label && data.kind) {
                            cozoGraphRegistry.registerEntity(data.label, data.kind, data.scopeId || 'default', {
                                aliases: data.aliases,
                            });
                        }
                        break;

                    case 'edges':
                        if (entry.op === 'upsert' && data.headId && data.tailId) {
                            cozoGraphRegistry.addRelationship(data.headId, data.tailId, data.relType, {
                                source: 'sync',
                                originId: data.evidenceNoteId || 'unknown',
                                confidence: 1.0,
                                timestamp: new Date(),
                            });
                        }
                        break;
                }

                // Remove from outbox after successful sync
                await syncOutbox.delete({ id: entry.id });
                pushed++;
            } catch (err) {
                console.warn(`[SyncOrchestrator] Failed to sync ${entry.table}:${entry.pk}:`, err);
                // Keep in outbox for retry
            }
        }

        if (pushed > 0) {
            console.log(`[SyncOrchestrator] Pushed ${pushed} entries to CozoDB`);
        }
    } finally {
        syncInProgress = false;
    }

    return pushed;
}

// ============================================================================
// COZO → NEBULADB (Pull graph data to cache)
// ============================================================================

/**
 * Pull entities from CozoDB into NebulaDB cache
 */
export async function pullEntitiesToNebula(): Promise<number> {
    try {
        const cozoEntities = cozoGraphRegistry.getAllEntities();
        if (cozoEntities.length === 0) return 0;

        const nebulaEntities = cozoEntities.map((e: CozoEntity) => ({
            id: e.id,
            scopeId: 'default',
            label: e.label,
            kind: e.kind,
            aliases: e.aliases || [],
            status: 'active' as const,
            updatedAt: Date.now(),
            rev: 0,
        }));

        await entities.insertBatch(nebulaEntities);
        console.log(`[SyncOrchestrator] Pulled ${cozoEntities.length} entities from CozoDB to NebulaDB`);
        return cozoEntities.length;
    } catch (err) {
        console.warn('[SyncOrchestrator] Failed to pull entities:', err);
        return 0;
    }
}

/**
 * Pull edges from CozoDB into NebulaDB cache
 */
export async function pullEdgesToNebula(): Promise<number> {
    try {
        const relationships = cozoGraphRegistry.getAllRelationshipsSync();
        if (relationships.length === 0) return 0;

        const nebulaEdges = relationships.map(r => ({
            id: r.id,
            scopeId: 'default',
            headId: r.sourceId,
            tailId: r.targetId,
            relType: r.type,
            evidenceNoteId: r.provenance?.[0]?.originId,
            updatedAt: Date.now(),
            rev: 0,
        }));

        await edges.insertBatch(nebulaEdges);
        console.log(`[SyncOrchestrator] Pulled ${relationships.length} edges from CozoDB to NebulaDB`);
        return relationships.length;
    } catch (err) {
        console.warn('[SyncOrchestrator] Failed to pull edges:', err);
        return 0;
    }
}

// ============================================================================
// SYNC LOOP
// ============================================================================

/**
 * Start the background sync loop
 */
export function startSyncLoop(intervalMs = 2000): void {
    if (syncLoopStarted) return;
    syncLoopStarted = true;

    console.log('[SyncOrchestrator] Starting background sync loop');

    // Use requestIdleCallback for non-blocking sync
    const runSync = async () => {
        await pushToCozoDB();
    };

    setInterval(() => {
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => runSync());
        } else {
            setTimeout(runSync, 0);
        }
    }, intervalMs);
}

/**
 * Full sync: push then pull
 */
export async function fullSync(): Promise<void> {
    await pushToCozoDB();
    await pullEntitiesToNebula();
    await pullEdgesToNebula();
}

// ============================================================================
// INITIAL HYDRATION
// ============================================================================

/**
 * Hydrate NebulaDB from CozoDB on app start
 * Called after CozoDB is initialized
 */
export async function hydrateFromCozoDB(): Promise<void> {
    console.log('[SyncOrchestrator] Hydrating NebulaDB from CozoDB...');

    const entityCount = await pullEntitiesToNebula();
    const edgeCount = await pullEdgesToNebula();

    console.log(`[SyncOrchestrator] Hydration complete: ${entityCount} entities, ${edgeCount} edges`);
}

// ============================================================================
// SYNC ORCHESTRATOR CLASS (Singleton)
// ============================================================================

class SyncOrchestrator {
    private started = false;

    /**
     * Initialize sync orchestrator
     * Call this after CozoDB is ready
     */
    async init(): Promise<void> {
        if (this.started) return;
        this.started = true;

        // Hydrate NebulaDB from Cozo
        await hydrateFromCozoDB();

        // Start background sync
        startSyncLoop();
    }

    // Expose methods
    push = pushToCozoDB;
    pullEntities = pullEntitiesToNebula;
    pullEdges = pullEdgesToNebula;
    fullSync = fullSync;
}

export const syncOrchestrator = new SyncOrchestrator();
