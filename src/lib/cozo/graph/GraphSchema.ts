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
    ];

    const allSchemas = [
        ...basicSchemas,
        { name: 'folder_hierarchy', script: FOLDER_HIERARCHY_SCHEMA.trim() },
        { name: 'network_instance', script: NETWORK_INSTANCE_SCHEMA.trim() },
        { name: 'network_membership', script: NETWORK_MEMBERSHIP_SCHEMA.trim() },
        { name: 'network_relationship', script: NETWORK_RELATIONSHIP_SCHEMA.trim() },
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
