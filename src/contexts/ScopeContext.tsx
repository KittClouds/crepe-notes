/**
 * Scope Context
 * 
 * React context that provides the currently active scope based on arborist selection.
 * All entity-related UI components should consume this to filter their data.
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { ActiveScope } from '@/lib/scope/scopeTypes';
import { GLOBAL_SCOPE, scopesEqual } from '@/lib/scope/scopeTypes';
import type { ArboristNode } from '@/lib/arborist/types';
import { computeActiveScope } from '@/lib/scope/computeNodeScope';

// =============================================================================
// Context Types
// =============================================================================

interface ScopeContextValue {
    /** The currently active scope for filtering */
    activeScope: ActiveScope;

    /** The currently selected arborist node (if any) */
    selectedNode: ArboristNode | null;

    /** Update the scope based on a new node selection */
    setSelectedNode: (node: ArboristNode | null) => void;

    /** Check if a note ID is within the current scope */
    isNoteInScope: (noteId: string, notesInScope: string[]) => boolean;

    /** Human-readable scope label for UI display */
    scopeLabel: string;
}

// =============================================================================
// Context Creation
// =============================================================================

const ScopeContext = createContext<ScopeContextValue | null>(null);

// =============================================================================
// Provider Component
// =============================================================================

interface ScopeProviderProps {
    children: React.ReactNode;
    /** Optional initial node selection */
    initialNode?: ArboristNode | null;
}

export function ScopeProvider({ children, initialNode = null }: ScopeProviderProps) {
    const [selectedNode, setSelectedNodeState] = useState<ArboristNode | null>(initialNode);

    // Compute active scope from selection
    const activeScope = useMemo<ActiveScope>(() => {
        return computeActiveScope(selectedNode);
    }, [selectedNode]);

    // Update handler - only triggers re-render if scope actually changed
    const setSelectedNode = useCallback((node: ArboristNode | null) => {
        setSelectedNodeState(prev => {
            // Only update if the node changed
            if (prev?.id === node?.id) return prev;
            return node;
        });
    }, []);

    // Check if a note is in scope
    const isNoteInScope = useCallback((noteId: string, notesInScope: string[]): boolean => {
        // Global scope includes everything
        if (activeScope.id === 'vault:global') return true;
        return notesInScope.includes(noteId);
    }, [activeScope.id]);

    // Human-readable scope label
    const scopeLabel = useMemo((): string => {
        if (activeScope.id === 'vault:global') return 'All Entities';
        if (activeScope.type === 'narrative') return `Vault: ${selectedNode?.name || 'Narrative'}`;
        if (activeScope.type === 'folder') return `Folder: ${selectedNode?.name || 'Folder'}`;
        return `Note: ${selectedNode?.name || 'Note'}`;
    }, [activeScope, selectedNode]);

    const value = useMemo<ScopeContextValue>(() => ({
        activeScope,
        selectedNode,
        setSelectedNode,
        isNoteInScope,
        scopeLabel,
    }), [activeScope, selectedNode, setSelectedNode, isNoteInScope, scopeLabel]);

    return (
        <ScopeContext.Provider value={value}>
            {children}
        </ScopeContext.Provider>
    );
}

// =============================================================================
// Consumer Hook
// =============================================================================

/**
 * Access the current scope context.
 * Must be used within a ScopeProvider.
 */
export function useScopeContext(): ScopeContextValue {
    const context = useContext(ScopeContext);
    if (!context) {
        throw new Error('useScopeContext must be used within a ScopeProvider');
    }
    return context;
}

/**
 * Safe version that returns null if not in provider (for optional usage)
 */
export function useScopeContextSafe(): ScopeContextValue | null {
    return useContext(ScopeContext);
}

// =============================================================================
// Utility Hook: Scope-Filtered Entities
// =============================================================================

/**
 * Hook to get entities filtered by the current scope.
 * This is the primary hook for UI components that display entities.
 */
export function useScopedEntities<T extends { firstNote?: string; id?: string }>(
    allEntities: T[],
    notesInScope: string[]
): T[] {
    const context = useScopeContextSafe();

    return useMemo(() => {
        // If no context or global scope, return all
        if (!context || context.activeScope.id === 'vault:global') {
            return allEntities;
        }

        // Filter entities to those with evidence in scoped notes
        return allEntities.filter(entity => {
            if (!entity.firstNote) return false;
            return notesInScope.includes(entity.firstNote);
        });
    }, [allEntities, notesInScope, context?.activeScope.id]);
}
