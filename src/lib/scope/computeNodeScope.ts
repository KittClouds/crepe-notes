/**
 * Compute Node Scope
 * 
 * Pure function to compute the effective scope for any node in the tree.
 * Used during tree transformation and scope context updates.
 */

import type { NodeScope, ScopeType } from './scopeTypes';
import type { ArboristNode } from '@/lib/arborist/types';

/**
 * Compute the scope for a node based on its position in the tree.
 * 
 * Rules:
 * 1. If node is inside a narrative vault → scope = 'narrative' with vault's ID
 * 2. If node is a folder (not narrative) → scope = 'folder' with folder's ID
 * 3. If node is a note inside a folder → scope = 'note' with note's ID (note-only view)
 * 4. If node is a global note (no parent) → scope = 'note' with note's ID
 * 
 * For narrative content, vault-wide is the default (per design decision #2).
 */
export function computeNodeScope(node: ArboristNode): NodeScope {
    const nodeId = node.id;
    const nodeType = node.type;

    // Check if inside a narrative vault
    if (node.narrativeId) {
        // Inside narrative → use narrative scope for vault-wide entity visibility
        return {
            nodeId,
            nodeType,
            scopeType: 'narrative',
            scopeId: node.narrativeId,
            narrativeId: node.narrativeId,
        };
    }

    // Not in narrative - determine based on node type
    if (nodeType === 'folder') {
        // Folder scope - aggregates all child notes
        return {
            nodeId,
            nodeType,
            scopeType: 'folder',
            scopeId: nodeId,
            narrativeId: undefined,
        };
    }

    // Note scope - shows only this note's entities
    // Per design decision #1: note-only for notes (even in folders)
    return {
        nodeId,
        nodeType,
        scopeType: 'note',
        scopeId: nodeId,
        narrativeId: undefined,
    };
}

/**
 * Compute scope from selection - handles the case where we need
 * to derive scope from the arborist selection state.
 * 
 * @param selectedNode - The currently selected arborist node
 * @returns ActiveScope for use in registry queries
 */
export function computeActiveScope(selectedNode: ArboristNode | null): {
    type: ScopeType;
    id: string;
    narrativeId?: string;
} {
    if (!selectedNode) {
        // No selection → global scope (show all)
        return {
            type: 'folder',
            id: 'vault:global',
            narrativeId: undefined,
        };
    }

    const nodeScope = computeNodeScope(selectedNode);

    return {
        type: nodeScope.scopeType,
        id: nodeScope.scopeId,
        narrativeId: nodeScope.narrativeId,
    };
}

/**
 * Get the list of note IDs that should be included in a scope query.
 * 
 * For 'note' scope: returns just that note
 * For 'folder' scope: returns all notes in folder subtree
 * For 'narrative' scope: returns all notes in narrative vault subtree
 */
export function getNotesInScope(
    scope: { type: ScopeType; id: string },
    tree: ArboristNode[]
): string[] {
    if (scope.type === 'note') {
        return [scope.id];
    }

    // Find the node in the tree
    const targetNode = findNodeById(scope.id, tree);
    if (!targetNode) {
        return [];
    }

    // Collect all notes in subtree
    return collectNotesRecursive(targetNode);
}

/**
 * Find a node by ID in the tree (recursive search)
 */
function findNodeById(id: string, nodes: ArboristNode[]): ArboristNode | null {
    for (const node of nodes) {
        if (node.id === id) return node;
        if (node.children) {
            const found = findNodeById(id, node.children);
            if (found) return found;
        }
    }
    return null;
}

/**
 * Recursively collect all note IDs from a subtree
 */
function collectNotesRecursive(node: ArboristNode): string[] {
    const notes: string[] = [];

    if (node.type === 'note') {
        notes.push(node.id);
    }

    if (node.children) {
        for (const child of node.children) {
            notes.push(...collectNotesRecursive(child));
        }
    }

    return notes;
}
