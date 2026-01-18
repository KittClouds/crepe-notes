// src/lib/dexie/sync.ts
// Sync Orchestrator: Dexie ↔ CozoDB background sync
// Dexie = client-facing DB (instant), Cozo = backend graph store (async)

import { dexieDb, type DexieNote, type DexieEntity, type DexieEdge } from './db';
import { cozoGraphRegistry, type CozoEntity } from '@/lib/cozo/graph/GraphRegistry';

// ============================================================================
// SYNC STATE
// ============================================================================

let syncInProgress = false;
let syncLoopStarted = false;

// ============================================================================
// DEXIE → COZO (Push outbox to backend)
// ============================================================================

/**
 * Push pending writes from Dexie outbox to CozoDB
 */
export async function pushToCozoDB(): Promise<number> {
    if (syncInProgress) return 0;
    syncInProgress = true;

    let pushed = 0;

    try {
        const pending = await dexieDb.syncOutbox.orderBy('clientTs').toArray();
        if (pending.length === 0) return 0;

        console.log(`[SyncOrchestrator] Pushing ${pending.length} entries to CozoDB...`);

        for (const entry of pending) {
            try {
                const data = JSON.parse(entry.data);

                switch (entry.table) {
                    case 'notes':
                        if (entry.op === 'delete') {
                            // Cozo delete (if implemented)
                            console.log(`[SyncOrchestrator] Delete note ${entry.pk} (noop for now)`);
                        } else {
                            // Cozo upsert note (if implemented)
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
                await dexieDb.syncOutbox.delete(entry.opId!);
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
// COZO → DEXIE (Pull graph data to cache)
// ============================================================================

/**
 * Pull entities from CozoDB into Dexie cache
 */
export async function pullEntitiesToDexie(): Promise<number> {
    try {
        const entities = cozoGraphRegistry.getAllEntities();
        if (entities.length === 0) return 0;

        const dexieEntities = entities.map((e: CozoEntity) => ({
            id: e.id,
            scopeId: 'default',
            label: e.label,
            kind: e.kind,
            aliases: e.aliases || [],
            status: 'active' as const,
            updatedAt: Date.now(),
            rev: 0,
        }));

        await dexieDb.entities.bulkPut(dexieEntities);
        console.log(`[SyncOrchestrator] Pulled ${entities.length} entities from CozoDB to Dexie`);
        return entities.length;
    } catch (err) {
        console.warn('[SyncOrchestrator] Failed to pull entities:', err);
        return 0;
    }
}

/**
 * Pull edges from CozoDB into Dexie cache
 */
export async function pullEdgesToDexie(): Promise<number> {
    try {
        const relationships = cozoGraphRegistry.getAllRelationshipsSync();
        if (relationships.length === 0) return 0;

        const dexieEdges = relationships.map(r => ({
            id: r.id,
            scopeId: 'default',
            headId: r.sourceId,
            tailId: r.targetId,
            relType: r.type,
            evidenceNoteId: r.provenance?.[0]?.originId,
            updatedAt: Date.now(),
            rev: 0,
        }));

        await dexieDb.edges.bulkPut(dexieEdges);
        console.log(`[SyncOrchestrator] Pulled ${relationships.length} edges from CozoDB to Dexie`);
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
    await pullEntitiesToDexie();
    await pullEdgesToDexie();
}

// ============================================================================
// INITIAL HYDRATION
// ============================================================================

/**
 * Hydrate Dexie from CozoDB on app start
 * Called after CozoDB is initialized
 */
export async function hydrateFromCozoDB(): Promise<void> {
    console.log('[SyncOrchestrator] Hydrating Dexie from CozoDB...');

    const entityCount = await pullEntitiesToDexie();
    const edgeCount = await pullEdgesToDexie();

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

        // Hydrate Dexie from Cozo
        await hydrateFromCozoDB();

        // Start background sync
        startSyncLoop();
    }

    // Expose methods
    push = pushToCozoDB;
    pullEntities = pullEntitiesToDexie;
    pullEdges = pullEdgesToDexie;
    fullSync = fullSync;
}

export const syncOrchestrator = new SyncOrchestrator();
