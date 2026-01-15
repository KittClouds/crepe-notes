/**
 * Graph Data Service
 * 
 * Transforms SmartGraphRegistry data into renderer-compatible GraphData structures.
 * 
 * DUAL-MODE ARCHITECTURE:
 * - Browser Mode: Uses SmartGraphRegistry (localStorage-backed)
 * - Tauri Mode: [FUTURE] Will use TauRPC -> Rust backend
 * 
 * Currently wired for Browser Mode only.
 */

import { smartGraphRegistry, type RegisteredEntity, type Edge } from '@/lib/registry';
import type { GraphData, GraphNode, GraphEdge, GraphStats } from '../types/graph-types';
import { getEntityColor } from '../types/graph-types';

export class GraphDataService {
    /**
     * Fetch global graph (all entities/relationships)
     */
    async getGlobalGraph(limit = 500): Promise<GraphData> {
        await this.ensureReady();

        try {
            // Use SmartGraphRegistry (SYNC - from local cache!)
            const entities = smartGraphRegistry.getAllEntities();
            const nodes = this.transformEntities(entities.slice(0, limit));

            if (nodes.length === 0) {
                console.log('[GraphDataService] No entities found in SmartGraphRegistry');
                return { nodes: [], links: [] };
            }

            // Fetch edges from SmartGraphRegistry
            const nodeIds = new Set(nodes.map(n => n.id));
            const edges = smartGraphRegistry.getAllEdges();
            const links = this.transformEdges(edges, nodeIds);

            console.log(`[GraphDataService] Global graph: ${nodes.length} nodes, ${links.length} links`);
            return { nodes, links };
        } catch (err) {
            console.error('[GraphDataService] getGlobalGraph failed:', err);
            return { nodes: [], links: [] };
        }
    }

    /**
     * Fetch graph for a specific scope (note or folder)
     */
    async getGraphForScope(groupId: string): Promise<GraphData> {
        await this.ensureReady();

        try {
            // Filter global entities by checking if they mention this note
            const allEntities = smartGraphRegistry.getAllEntities();

            // Filter entities that have the noteId in their mentions
            const scopedEntities = allEntities.filter(e => {
                if (e.mentionsByNote && e.mentionsByNote.has(groupId)) return true;
                if (e.firstNote === groupId) return true;
                return false;
            });

            const nodes = this.transformEntities(scopedEntities);
            const nodeIds = new Set(nodes.map(n => n.id));

            const edges = smartGraphRegistry.getAllEdges();
            const links = this.transformEdges(edges, nodeIds);

            return { nodes, links };
        } catch (err) {
            console.error('[GraphDataService] getGraphForScope failed:', err);
            return { nodes: [], links: [] };
        }
    }

    /**
     * Alias for backwards compatibility
     */
    async getVisualizationGraph(groupId: string): Promise<GraphData> {
        return this.getGraphForScope(groupId);
    }

    /**
     * Get graph statistics
     */
    calculateStats(data: GraphData): GraphStats {
        const nodeCount = data.nodes.length;
        const edgeCount = data.links.length;

        // Graph density = actual edges / possible edges
        const possibleEdges = nodeCount > 1 ? (nodeCount * (nodeCount - 1)) / 2 : 1;
        const density = edgeCount / possibleEdges;

        // Average degree = 2 * edges / nodes
        const averageDegree = nodeCount > 0 ? (2 * edgeCount) / nodeCount : 0;

        return {
            nodeCount,
            edgeCount,
            density: Math.min(density, 1),
            averageDegree,
        };
    }

    // ==================== Private Helpers ====================

    private async ensureReady(): Promise<void> {
        await smartGraphRegistry.init();
    }

    /**
     * Transform RegisteredEntity[] to GraphNode[]
     */
    private transformEntities(entities: RegisteredEntity[]): GraphNode[] {
        return entities.map(entity => ({
            id: entity.id,
            label: entity.label,
            type: entity.kind,
            color: getEntityColor(entity.kind),
            size: Math.min(10 + (entity.totalMentions || 1), 30),
            metadata: {
                subtype: entity.subtype,
                totalMentions: entity.totalMentions,
                firstNote: entity.firstNote,
                createdBy: entity.createdBy,
            },
        }));
    }

    /**
     * Transform Edge[] to GraphEdge[]
     */
    private transformEdges(edges: Edge[], validNodeIds: Set<string>): GraphEdge[] {
        return edges
            .filter(edge => {
                // Only include edges where both nodes exist
                return validNodeIds.has(edge.sourceId) && validNodeIds.has(edge.targetId);
            })
            .filter(edge => {
                // Skip self-loops
                return edge.sourceId !== edge.targetId;
            })
            .map(edge => ({
                id: edge.id,
                source: edge.sourceId,
                target: edge.targetId,
                type: edge.type,
                weight: Math.round(edge.confidence * 10) || 1,
                label: edge.type,
            }));
    }
}

// Singleton instance
export const graphDataService = new GraphDataService();
