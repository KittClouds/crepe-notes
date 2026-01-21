/**
 * Network Auto-Creator
 * 
 * Monitors folder changes and triggers network creation when:
 * 1. A subfolder has autoCreateNetwork: true in its schema
 * 2. Child count reaches networkCreationThreshold
 * 3. No network already exists for that root folder
 * 
 * Uses CozoDB as the primary storage for networks.
 */

// import { cozoDb } from '@/lib/cozo-stubs/db';
// import { folderSchemaRegistry } from '../schema-registry';
// import {
//     NETWORK_INSTANCE_QUERIES,
//     NETWORK_MEMBERSHIP_QUERIES,
//     NETWORK_RELATIONSHIP_QUERIES,
//     FOLDER_HIERARCHY_QUERIES
// } from '@/lib/cozo-stubs/schema';
import type { EntityKind } from '@/lib/types/entityTypes';

// Generate UUID v7 for new entities
function generateId(): string {
    // Simple UUID v4 fallback - in production use uuidv7
    return crypto.randomUUID();
}

export interface NetworkCreationResult {
    created: boolean;
    networkId?: string;
    networkName?: string;
    memberCount?: number;
    reason?: string;
}

export interface NetworkAutoCreateConfig {
    schemaId: string;
    threshold: number;
    rootFolderId: string;
    rootEntityId?: string;
    rootEntityName: string;
    subfolderLabel: string;
    entityKind: EntityKind;
}

/**
 * Check if a network should be auto-created and create it if conditions are met.
 * 
 * Called when an entity is added to a typed folder subfolder.
 */
export async function checkAndCreateNetworkForFolder(
    config: NetworkAutoCreateConfig,
    currentChildCount: number
): Promise<NetworkCreationResult> {
    console.warn('checkAndCreateNetworkForFolder disabled pending migration.');
    return { created: false, reason: 'Disabled' };
}

async function getNetworkByFolderId(folderId: string): Promise<{ id: string; name: string } | null> {
    return null;
}

async function getFolderInfo(folderId: string): Promise<{
    id: string;
    parentId?: string;
    name?: string;
    entityKind?: string;
    entitySubtype?: string;
    entityId?: string;
} | null> {
    return null;
}

async function countFolderChildren(folderId: string): Promise<number> {
    return 0;
}

async function addNetworkMember(
    networkId: string,
    entityId: string,
    role: 'ROOT' | 'MEMBER',
    depthLevel: number,
    groupId: string
): Promise<void> {
    // Disabled
}

async function addNetworkRelationship(
    networkId: string,
    sourceId: string,
    targetId: string,
    relationshipCode: string,
    groupId: string
): Promise<void> {
    // Disabled
}

export async function updateNetworkStats(networkId: string): Promise<void> {
    // Disabled
}

/**
 * Called when an entity is added to a typed folder.
 * Triggers network creation if threshold is met.
 */
export async function onEntityAddedToFolder(
    folderId: string,
    entityId: string,
    entityKind: EntityKind
): Promise<NetworkCreationResult> {
    console.warn('onEntityAddedToFolder disabled pending migration.');
    return { created: false, reason: 'Disabled' };
}
