/**
 * NebulaDB Sync Layer
 * 
 * Bridges Rust CozoDB (source of truth) with TypeScript NebulaDB (UI cache).
 * Uses shared memory for efficient data transfer.
 */

import { kittCore } from '@/lib/kittcore';
import { cozoDb } from '@/lib/cozo/db';

export interface RustCozoNode {
    id: string;
    label: string;
    kind: string;
    props: Record<string, any>;
}

export interface RustCozoEdge {
    source: string;
    target: string;
    relation: string;
    weight: number;
    props: Record<string, any>;
}

export interface SyncResult {
    nodeCount: number;
    edgeCount: number;
    syncedAt: number;
}

/**
 * Sync Manager for Rust Cozo <-> NebulaDB
 */
class NebulaSyncManager {
    private lastSyncTime = 0;
    private syncInProgress = false;

    /**
     * Pull data from Rust CozoDB and sync to NebulaDB
     * Called after significant Rust-side changes (e.g., after scan completes)
     */
    async syncFromRust(): Promise<SyncResult> {
        if (this.syncInProgress) {
            console.log('[NebulaSync] Sync already in progress, skipping');
            return { nodeCount: 0, edgeCount: 0, syncedAt: this.lastSyncTime };
        }

        this.syncInProgress = true;
        const startTime = performance.now();

        try {
            console.log('[NebulaSync] Starting sync from Rust CozoDB...');

            // Get exported data from Rust Cozo
            const rawData = await kittCore.syncToNebula();

            if (!rawData) {
                console.warn('[NebulaSync] No data returned from Rust CozoDB');
                return { nodeCount: 0, edgeCount: 0, syncedAt: Date.now() };
            }

            // Parse the exported JSON
            const data = JSON.parse(rawData) as {
                nodes?: { rows: any[][] };
                edges?: { rows: any[][] };
            };

            let nodeCount = 0;
            let edgeCount = 0;

            // Sync nodes to NebulaDB
            if (data.nodes?.rows) {
                for (const row of data.nodes.rows) {
                    // row format: [id, label, kind, props]
                    const [id, label, kind, props] = row;

                    // Upsert to NebulaDB concept graph
                    cozoDb.runQuery(`
                        ?[id, label, kind, props] <- [[$id, $label, $kind, $props]]
                        :put nodes { id => label, kind, props }
                    `, { id, label, kind, props: props || {} });

                    nodeCount++;
                }
            }

            // Sync relationships to NebulaDB
            if (data.relationships?.rows) {
                for (const row of data.relationships.rows) {
                    // Schema: id => source_id, target_id, type, inverse_type, bidirectional, confidence, namespace, created_at, updated_at
                    const [id, source_id, target_id, type, inverse_type, bidirectional, confidence, namespace, created_at, updated_at] = row;

                    cozoDb.runQuery(`
                        ?[id, source_id, target_id, type, inverse_type, bidirectional, confidence, namespace, created_at, updated_at] <- [[$id, $source_id, $target_id, $type, $inverse_type, $bidirectional, $confidence, $namespace, $created_at, $updated_at]]
                        :put relationships { id => source_id, target_id, type, inverse_type, bidirectional, confidence, namespace, created_at, updated_at }
                    `, {
                        id, source_id, target_id, type,
                        inverse_type: inverse_type || null,
                        bidirectional: !!bidirectional,
                        confidence: confidence || 1.0,
                        namespace: namespace || null,
                        created_at: created_at || Date.now(),
                        updated_at: updated_at || Date.now()
                    });

                    edgeCount++;
                }
            } else if (data.edges?.rows) {
                // Fallback for backward compatibility if needed, or mapping old edges
                console.warn('[NebulaSync] Received deprecated "edges" format from Rust');
            }

            // Sync Provenance
            if (data.relationship_provenance?.rows) {
                for (const row of data.relationship_provenance.rows) {
                    const [rel_id, source, origin_id, confidence, timestamp, context] = row;
                    cozoDb.runQuery(`
                        ?[rel_id, source, origin_id, confidence, timestamp, context] <- [[$rel_id, $source, $origin_id, $confidence, $timestamp, $context]]
                        :put relationship_provenance { relationship_id, source, origin_id => confidence, timestamp, context }
                    `, { rel_id, source, origin_id, confidence, timestamp, context: context || null });
                }

            }

            // Sync Attributes
            if (data.relationship_attributes?.rows) {
                for (const row of data.relationship_attributes.rows) {
                    const [rel_id, key, value] = row;
                    cozoDb.runQuery(`
                        ?[rel_id, key, value] <- [[$rel_id, $key, $value]]
                        :put relationship_attributes { relationship_id, key => value }
                    `, { rel_id, key, value });
                }
            }



            this.lastSyncTime = Date.now();
            const elapsed = performance.now() - startTime;
            console.log(`[NebulaSync] Sync complete: ${nodeCount} nodes, ${edgeCount} edges in ${elapsed.toFixed(1)}ms`);

            return { nodeCount, edgeCount, syncedAt: this.lastSyncTime };

        } catch (err) {
            console.error('[NebulaSync] Sync failed:', err);
            throw err;
        } finally {
            this.syncInProgress = false;
        }
    }

    /**
     * Push NebulaDB changes to Rust CozoDB
     * Called when user makes manual edits in UI
     */
    async pushToRust(nodes: RustCozoNode[], edges: RustCozoEdge[] = []): Promise<boolean> {
        console.log(`[NebulaSync] Pushing ${nodes.length} nodes, ${edges.length} edges to Rust...`);

        try {
            // Push nodes
            for (const node of nodes) {
                await kittCore.cozoUpsertNode(node.id, node.label, node.kind);
            }

            // Push edges
            for (const edge of edges) {
                await kittCore.cozoUpsertEdge(edge.source, edge.target, edge.relation);
            }

            console.log('[NebulaSync] Push complete');
            return true;
        } catch (err) {
            console.error('[NebulaSync] Push failed:', err);
            return false;
        }
    }

    /**
     * Get sync status
     */
    getStatus(): { lastSyncTime: number; syncInProgress: boolean } {
        return {
            lastSyncTime: this.lastSyncTime,
            syncInProgress: this.syncInProgress
        };
    }
}

// Singleton export
export const nebulaSync = new NebulaSyncManager();
