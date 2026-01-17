/**
 * Network Storage Adapter - Web Version (Stub)
 * 
 * In the web version, network storage is not available.
 * The native desktop app is required for network features.
 */

import type {
    NetworkInstance,
    NetworkSchema,
    NetworkRelationshipInstance,
} from './types';
import { getSchemaById } from './schemas';

// ============================================================================
// NETWORK INSTANCE OPERATIONS (Stubs)
// ============================================================================

/**
 * Save a network instance
 */
export async function saveNetworkInstance(_network: NetworkInstance): Promise<void> {
    console.warn('[NetworkStorageAdapter] Network features require desktop app');
}

/**
 * Load a network instance by ID
 */
export async function loadNetworkInstance(_id: string): Promise<NetworkInstance | null> {
    return null;
}

/**
 * Load network by folder ID
 */
export async function loadNetworkByFolderId(_folderId: string): Promise<NetworkInstance | null> {
    return null;
}

/**
 * Load all networks
 */
export async function loadAllNetworks(): Promise<NetworkInstance[]> {
    return [];
}

/**
 * Load networks by namespace
 */
export async function loadNetworksByNamespace(_namespace: string): Promise<NetworkInstance[]> {
    return [];
}

/**
 * Load networks by schema ID
 */
export async function loadNetworksBySchemaId(_schemaId: string): Promise<NetworkInstance[]> {
    return [];
}

/**
 * Delete a network instance
 */
export async function deleteNetworkInstance(_id: string): Promise<void> {
    console.warn('[NetworkStorageAdapter] Network features require desktop app');
}

/**
 * Update network instance
 */
export async function updateNetworkInstance(
    _id: string,
    _updates: Partial<NetworkInstance>
): Promise<NetworkInstance | null> {
    return null;
}

// ============================================================================
// SCHEMA OPERATIONS
// ============================================================================

/**
 * Save a custom schema
 */
export async function saveNetworkSchema(_schema: NetworkSchema): Promise<void> {
    console.warn('[NetworkStorageAdapter] Network features require desktop app');
}

/**
 * Load a schema by ID
 */
export async function loadNetworkSchema(id: string): Promise<NetworkSchema | null> {
    return getSchemaById(id) || null;
}

/**
 * Load all custom schemas
 */
export async function loadAllCustomSchemas(): Promise<NetworkSchema[]> {
    return [];
}

/**
 * Delete a custom schema
 */
export async function deleteNetworkSchema(_id: string): Promise<void> {
    console.warn('[NetworkStorageAdapter] Network features require desktop app');
}

// ============================================================================
// RELATIONSHIP OPERATIONS (Stubs)
// ============================================================================

/**
 * Save a network relationship
 */
export async function saveNetworkRelationship(_relationship: NetworkRelationshipInstance): Promise<void> {
    console.warn('[NetworkStorageAdapter] Network features require desktop app');
}

/**
 * Load relationships by network
 */
export async function loadRelationshipsByNetwork(_networkId: string): Promise<NetworkRelationshipInstance[]> {
    return [];
}

/**
 * Delete a relationship
 */
export async function deleteNetworkRelationship(_id: string): Promise<void> {
    console.warn('[NetworkStorageAdapter] Network features require desktop app');
}

/**
 * Delete all relationships for a network
 */
export async function deleteRelationshipsByNetwork(_networkId: string): Promise<void> {
    console.warn('[NetworkStorageAdapter] Network features require desktop app');
}

// ============================================================================
// ENTITY MEMBERSHIP (Stubs)
// ============================================================================

export async function addEntityToNetwork(
    _networkId: string,
    _entityId: string,
    _options: { role?: string; depthLevel?: number; groupId?: string } = {}
): Promise<void> {
    console.warn('[NetworkStorageAdapter] Network features require desktop app');
}

export async function removeEntityFromNetwork(_networkId: string, _entityId: string): Promise<void> {
    console.warn('[NetworkStorageAdapter] Network features require desktop app');
}

export async function getNetworkMembers(_networkId: string): Promise<string[]> {
    return [];
}

// ============================================================================
// DATABASE LIFECYCLE (No-op)
// ============================================================================

export async function getNetworkDB(): Promise<null> {
    return null;
}

export async function closeNetworkDB(): Promise<void> {
    // No-op
}
