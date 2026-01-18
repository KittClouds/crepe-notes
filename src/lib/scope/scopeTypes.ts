/**
 * Scope Types
 * 
 * Core type definitions for the scope isolation system.
 * Scopes determine which entities are visible based on arborist tree selection.
 */

/**
 * The type of scope determines query behavior:
 * - 'note': Show only entities from this specific note
 * - 'folder': Show aggregated entities from all notes in folder (and subfolders)
 * - 'narrative': Show all entities from entire narrative vault
 */
export type ScopeType = 'note' | 'folder' | 'narrative';

/**
 * The currently active scope, derived from arborist tree selection.
 * Used to filter registry queries.
 */
export interface ActiveScope {
    /** The type of scope */
    type: ScopeType;
    /** The ID of the scoped node (note ID, folder ID, or narrative vault ID) */
    id: string;
    /** 
     * For narrative scopes, the vault root ID.
     * For notes/folders inside a narrative, this is the containing narrative.
     * For global nodes, undefined.
     */
    narrativeId?: string;
}

/**
 * Computed scope information for a tree node.
 * Materialized on each node for fast queries.
 */
export interface NodeScope {
    /** The node's own ID */
    nodeId: string;
    /** Whether this is a note or folder */
    nodeType: 'note' | 'folder';
    /** The effective scope type for this node */
    scopeType: ScopeType;
    /** 
     * The scope ID to use for queries.
     * - For narrative content: the narrative vault ID
     * - For folder content: the folder ID  
     * - For global notes: the note's own ID
     */
    scopeId: string;
    /** Parent narrative vault if inside one */
    narrativeId?: string;
}

/**
 * Default global scope - shows all entities (legacy behavior)
 */
export const GLOBAL_SCOPE: ActiveScope = {
    type: 'folder',
    id: 'vault:global',
    narrativeId: undefined,
};

/**
 * Build a scope ID string from type and ID
 */
export function buildScopeId(type: ScopeType, id: string): string {
    return `${type}:${id}`;
}

/**
 * Parse a scope ID string into type and ID
 */
export function parseScopeId(scopeId: string): { type: ScopeType; id: string } {
    const [type, ...rest] = scopeId.split(':');
    return {
        type: type as ScopeType,
        id: rest.join(':'), // Handle IDs that might contain colons
    };
}

/**
 * Check if two scopes are equal
 */
export function scopesEqual(a: ActiveScope, b: ActiveScope): boolean {
    return a.type === b.type && a.id === b.id && a.narrativeId === b.narrativeId;
}
