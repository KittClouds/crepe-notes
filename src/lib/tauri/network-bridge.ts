// src/lib/tauri/network-bridge.ts
// Network Bridge - STUB until TauRPC TypeScript side is complete

export interface SurrealNetwork {
    id: string | { tb: string; id: { String: string } };
    name: string;
    schema_id: string;
    root_folder_id?: string;
    root_entity_id?: string;
    namespace: string;
    description?: string;
    tags?: string[];
    member_count: number;
    relationship_count: number;
    max_depth: number;
    created_at?: string;
    updated_at?: string;
}

export interface SurrealRelationship {
    id: string | { tb: string; id: { String: string } };
    network_id?: string;
    relationship_code: string;
    out: string;
    in_: string;
    strength?: number;
    notes?: string;
    attributes?: Record<string, unknown>;
    created_at?: string;
}

export interface SurrealMember {
    entity?: {
        id: string | { tb: string; id: { String: string } };
    };
}

/**
 * Network Bridge - Stub implementation
 * TODO: Wire to TauRPC when TypeScript bindings are ready
 */
class NetworkBridgeStub {
    async getNetwork(_id: string): Promise<SurrealNetwork | null> {
        console.warn('[NetworkBridge] STUB - Tauri not connected');
        return null;
    }

    async getNetworkByFolder(_folderId: string): Promise<SurrealNetwork | null> {
        return null;
    }

    async listNetworks(): Promise<SurrealNetwork[]> {
        return [];
    }

    async createNetwork(
        _name: string,
        _schemaId: string,
        _options?: {
            rootFolderId?: string;
            rootEntityId?: string;
            namespace?: string;
            description?: string;
            tags?: string[];
        }
    ): Promise<SurrealNetwork | null> {
        return null;
    }

    async updateNetwork(
        _id: string,
        _updates: { name?: string; description?: string; tags?: string[] }
    ): Promise<void> { }

    async deleteNetwork(_id: string): Promise<void> { }

    async createRelationship(
        _sourceId: string,
        _targetId: string,
        _code: string,
        _options?: {
            networkId?: string;
            strength?: number;
            startDate?: string;
            endDate?: string;
            notes?: string;
            attributes?: Record<string, unknown>;
        }
    ): Promise<void> { }

    async getNetworkRelationships(_networkId: string): Promise<SurrealRelationship[]> {
        return [];
    }

    async deleteRelationship(_id: string): Promise<void> { }

    async addMember(
        _networkId: string,
        _entityId: string,
        _options?: { role?: string; depthLevel?: number; groupId?: string }
    ): Promise<void> { }

    async removeMember(_networkId: string, _entityId: string): Promise<void> { }

    async getMembers(_networkId: string): Promise<SurrealMember[]> {
        return [];
    }
}

export const networkBridge = new NetworkBridgeStub();
