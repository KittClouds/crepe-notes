/**
 * Graph Schema Creation - Exported for early initialization
 * 
 * Must be called BEFORE snapshot restore to ensure entity relations exist.
 */

import { cozoDb } from '../db';
import { FOLDER_HIERARCHY_SCHEMA } from '../schema/layer2-folder-hierarchy';
import { NETWORK_INSTANCE_SCHEMA } from '../schema/layer2-network-instance';
import { NETWORK_MEMBERSHIP_SCHEMA } from '../schema/layer2-network-membership';
import { NETWORK_RELATIONSHIP_SCHEMA } from '../schema/layer2-network-relationship';
import {
    NODE_VECTORS_SCHEMA,
    ENTITY_CLUSTERS_SCHEMA,
    CLUSTER_MEMBERS_SCHEMA,
    COOCCURRENCE_EDGES_SCHEMA,
    NODE_VECTORS_HNSW_384,
    NODE_VECTORS_HNSW_768,
    NODE_VECTORS_HNSW_256,
    NODE_VECTORS_HNSW_128,
    type VectorDimension,
} from '../schema/layer2-crossdoc';

let graphSchemasCreated = false;

/**
 * Create all graph-related schemas (entities, relationships, etc.)
 * Safe to call multiple times - will skip if already created.
 */
export function createGraphSchemas(): string[] {
    if (graphSchemasCreated) {
        console.log('[GraphSchema] Already created, skipping');
        return [];
    }

    console.log('[GraphSchema] Creating graph schemas...');

    const basicSchemas = [
        { name: 'entities', script: `:create entities { id: String => label: String, normalized: String, kind: String, subtype: String?, first_note: String, created_at: Float, created_by: String }` },
        { name: 'entity_aliases', script: `:create entity_aliases { entity_id: String, normalized: String => alias: String }` },
        { name: 'entity_mentions', script: `:create entity_mentions { entity_id: String, note_id: String => mention_count: Int, last_seen: Float }` },
        { name: 'entity_metadata', script: `:create entity_metadata { entity_id: String, key: String => value: String }` },
        { name: 'relationships', script: `:create relationships { id: String => source_id: String, target_id: String, type: String, inverse_type: String?, bidirectional: Bool, confidence: Float, namespace: String?, created_at: Float, updated_at: Float }` },
        { name: 'relationship_provenance', script: `:create relationship_provenance { relationship_id: String, source: String, origin_id: String => confidence: Float, timestamp: Float, context: String? }` },
        { name: 'relationship_attributes', script: `:create relationship_attributes { relationship_id: String, key: String => value: String }` },
        // Unsupervised NER ("Discovery Engine") candidates
        // token: The word/phrase found
        // status: 0=Watching (seen), 1=Promoted (user confirmed), 2=Ignored (user rejected)
        { name: 'discovery_candidates', script: `:create discovery_candidates { token: String => kind: Int, score: Float, status: Int, last_seen: Float, first_seen: Float, count: Int }` },
    ];

    const allSchemas = [
        ...basicSchemas,
        { name: 'folder_hierarchy', script: FOLDER_HIERARCHY_SCHEMA.trim() },
        { name: 'network_instance', script: NETWORK_INSTANCE_SCHEMA.trim() },
        { name: 'network_membership', script: NETWORK_MEMBERSHIP_SCHEMA.trim() },
        { name: 'network_relationship', script: NETWORK_RELATIONSHIP_SCHEMA.trim() },
        // Cross-document knowledge graph schemas
        { name: 'node_vectors', script: NODE_VECTORS_SCHEMA.trim() },
        { name: 'entity_clusters', script: ENTITY_CLUSTERS_SCHEMA.trim() },
        { name: 'cluster_members', script: CLUSTER_MEMBERS_SCHEMA.trim() },
        { name: 'cooccurrence_edges', script: COOCCURRENCE_EDGES_SCHEMA.trim() },
    ];

    const created: string[] = [];

    for (const { name, script } of allSchemas) {
        try {
            const resultStr = cozoDb.run(script);
            const result = JSON.parse(resultStr);
            if (result.ok === false) {
                const msg = result.message || result.display || 'Unknown error';
                if (!msg.includes('already exists')) {
                    console.error(`[GraphSchema] ${name} failed:`, msg);
                }
            } else {
                console.log(`[GraphSchema] ${name} created`);
                created.push(name);
            }
        } catch (err) {
            const errMsg = String(err);
            if (!errMsg.includes('already exists')) {
                console.error(`[GraphSchema] Creation failed for ${name}:`, err);
            }
        }
    }

    graphSchemasCreated = true;
    console.log(`[GraphSchema] ✅ Complete (${created.length} schemas)`);
    return created;
}

/**
 * Check if graph schemas have been created
 */
export function areGraphSchemasCreated(): boolean {
    return graphSchemasCreated;
}

/**
 * Reset flag (for testing)
 */
export function resetGraphSchemaFlag(): void {
    graphSchemasCreated = false;
}

// Track which HNSW indices have been created
const hnswIndicesCreated = new Set<VectorDimension>();

/**
 * Create HNSW index for a specific vector dimension.
 * Should be called after node_vectors relation exists.
 * Safe to call multiple times - will skip if already created.
 * 
 * @param dimension - Vector dimension (768, 384, 256, or 128)
 * @returns true if index was created, false if already exists
 */
export function createVectorHnswIndex(dimension: VectorDimension): boolean {
    if (hnswIndicesCreated.has(dimension)) {
        console.log(`[GraphSchema] HNSW index for ${dimension}d already created, skipping`);
        return false;
    }

    const indexScripts: Record<VectorDimension, string> = {
        768: NODE_VECTORS_HNSW_768,
        384: NODE_VECTORS_HNSW_384,
        256: NODE_VECTORS_HNSW_256,
        128: NODE_VECTORS_HNSW_128,
    };

    const script = indexScripts[dimension];
    if (!script) {
        console.error(`[GraphSchema] Unknown dimension: ${dimension}`);
        return false;
    }

    try {
        const resultStr = cozoDb.run(script.trim());
        const result = JSON.parse(resultStr);
        if (result.ok === false) {
            const msg = result.message || result.display || 'Unknown error';
            if (msg.includes('already exists')) {
                hnswIndicesCreated.add(dimension);
                return false;
            }
            console.error(`[GraphSchema] HNSW ${dimension}d failed:`, msg);
            return false;
        }
        console.log(`[GraphSchema] HNSW index semantic_idx_${dimension} created`);
        hnswIndicesCreated.add(dimension);
        return true;
    } catch (err) {
        const errMsg = String(err);
        if (errMsg.includes('already exists')) {
            hnswIndicesCreated.add(dimension);
            return false;
        }
        console.error(`[GraphSchema] HNSW ${dimension}d creation failed:`, err);
        return false;
    }
}

/**
 * Create all HNSW indices (768, 384, 256, 128).
 * @returns Array of dimensions that were created
 */
export function createAllVectorHnswIndices(): VectorDimension[] {
    const dimensions: VectorDimension[] = [384, 768, 256, 128];
    const created: VectorDimension[] = [];

    for (const dim of dimensions) {
        if (createVectorHnswIndex(dim)) {
            created.push(dim);
        }
    }

    console.log(`[GraphSchema] ✅ HNSW indices complete (${created.length} created)`);
    return created;
}

/**
 * Check if HNSW index exists for a dimension
 */
export function hasVectorHnswIndex(dimension: VectorDimension): boolean {
    return hnswIndicesCreated.has(dimension);
}

/**
 * Reset HNSW index flags (for testing)
 */
export function resetHnswIndexFlags(): void {
    hnswIndicesCreated.clear();
}

// Re-export VectorDimension type for external use
export type { VectorDimension };
