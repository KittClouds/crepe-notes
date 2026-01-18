// src/components/sidebar/EntityRegistryPanel.tsx
// Entity Registry Panel for sidebar - Visual entity management with scope filtering

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
    ChevronRight,
    ChevronDown,
    Plus,
    Trash2,
    Users,
    AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { ENTITY_ICONS, ENTITY_KINDS, type EntityKind } from '@/lib/types/entityTypes';
import { getEntityColor } from '@/lib/store/entityColorStore';
import { smartGraphRegistry, type RegisteredEntity } from '@/lib/registry';
import { AddEntityDialog } from './AddEntityDialog';
import { useScopeContextSafe } from '@/contexts/ScopeContext';
import { getNotesInScope } from '@/lib/scope/computeNodeScope';
import { buildArboristTree } from '@/lib/arborist/adapter';
import { useNotesStore } from '@/hooks/useNotesStore';
import { ScopeSelector } from '@/components/scope/ScopeSelector';

interface EntityRegistryPanelProps {
    onNavigate?: (label: string) => void;
}

export function EntityRegistryPanel({ onNavigate }: EntityRegistryPanelProps) {
    const [entities, setEntities] = useState<RegisteredEntity[]>([]);
    const [expandedKinds, setExpandedKinds] = useState<Set<string>>(new Set(ENTITY_KINDS));
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isFlushOpen, setIsFlushOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // Scope context for filtering
    const scopeContext = useScopeContextSafe();
    const { folderTree, globalNotes } = useNotesStore();

    // Build tree for scope calculation
    const treeData = useMemo(
        () => buildArboristTree(folderTree, globalNotes),
        [folderTree, globalNotes]
    );

    // Calculate notes in current scope
    const notesInScope = useMemo(() => {
        if (!scopeContext || scopeContext.activeScope.id === 'vault:global') {
            // Global scope - all notes
            return []; // Empty means "all" for registry
        }
        return getNotesInScope(scopeContext.activeScope, treeData);
    }, [scopeContext?.activeScope, treeData]);

    // Load entities on mount and when scope changes
    useEffect(() => {
        const loadEntities = async () => {
            // Wait for registry to be ready
            if (!smartGraphRegistry.isInitialized()) {
                await smartGraphRegistry.init();
            }

            // Apply scope filter if we have notes in scope
            if (notesInScope.length > 0) {
                setEntities(smartGraphRegistry.getEntitiesByScope(notesInScope));
            } else {
                // Global scope or no notes - show all
                setEntities(smartGraphRegistry.getAllEntities());
            }
            setIsLoading(false);
        };
        loadEntities();
    }, [notesInScope]);

    // Group entities by kind
    const byKind = useMemo(() => {
        const groups: Record<string, RegisteredEntity[]> = {};
        for (const entity of entities) {
            if (!groups[entity.kind]) {
                groups[entity.kind] = [];
            }
            groups[entity.kind].push(entity);
        }
        return groups;
    }, [entities]);

    const toggleKind = (kind: string) => {
        setExpandedKinds(prev => {
            const next = new Set(prev);
            if (next.has(kind)) next.delete(kind);
            else next.add(kind);
            return next;
        });
    };

    const handleAddEntity = useCallback(async (label: string, kind: EntityKind) => {
        await smartGraphRegistry.registerEntity(label, kind, 'manual', { source: 'user' });
        setEntities(smartGraphRegistry.getAllEntities());
        setIsAddOpen(false);
    }, []);

    const handleDeleteEntity = useCallback(async (id: string) => {
        await smartGraphRegistry.deleteEntity(id);
        setEntities(smartGraphRegistry.getAllEntities());
    }, []);

    const handleFlushRegistry = useCallback(async () => {
        await smartGraphRegistry.clearAll();
        setEntities([]);
        setIsFlushOpen(false);
    }, []);

    const sortedKinds = Object.keys(byKind).sort();

    return (
        <div className="flex flex-col h-full">
            {/* Scope Selector */}
            <div className="p-2 border-b border-border/50">
                <ScopeSelector compact className="w-full" />
            </div>

            {/* Header with Actions */}
            <div className="p-2 border-b border-border/50 flex items-center gap-1">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs flex-1 justify-start"
                    onClick={() => setIsAddOpen(true)}
                >
                    <Plus className="w-3.5 h-3.5" />
                    Add Entity
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => setIsFlushOpen(true)}
                    title="Flush Registry"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </Button>
            </div>

            {/* Entity List */}
            <ScrollArea className="flex-1">
                <div className="p-1 space-y-0.5">
                    {isLoading ? (
                        <div className="text-center text-xs text-muted-foreground py-6">
                            Loading...
                        </div>
                    ) : sortedKinds.length === 0 ? (
                        <div className="text-center text-xs text-muted-foreground py-6">
                            No entities registered.
                            <p className="mt-1 opacity-70">Click "Add Entity" to start.</p>
                        </div>
                    ) : (
                        sortedKinds.map(kind => {
                            const kindEntities = byKind[kind];
                            const isExpanded = expandedKinds.has(kind);
                            const Icon = ENTITY_ICONS[kind as EntityKind] || Users;
                            const color = getEntityColor(kind);

                            return (
                                <div key={kind}>
                                    {/* Kind Header */}
                                    <button
                                        onClick={() => toggleKind(kind)}
                                        className="w-full flex items-center gap-1 px-1.5 py-1 rounded hover:bg-muted/50 text-left"
                                    >
                                        {isExpanded ? (
                                            <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                                        ) : (
                                            <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                                        )}
                                        <Icon className="w-3 h-3 shrink-0" style={{ color }} />
                                        <span className="text-[10px] font-medium uppercase tracking-wide truncate" style={{ color }}>
                                            {kind}
                                        </span>
                                        <Badge variant="secondary" className="ml-auto h-4 px-1 text-[9px]">
                                            {kindEntities.length}
                                        </Badge>
                                    </button>

                                    {/* Entity Items */}
                                    {isExpanded && (
                                        <div className="ml-3 space-y-px">
                                            {kindEntities.map((entity) => (
                                                <div
                                                    key={entity.id}
                                                    className="group w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-left text-xs hover:bg-muted/50 transition-colors"
                                                >
                                                    <span
                                                        className="truncate flex-1 cursor-pointer"
                                                        style={{ color }}
                                                        onClick={() => onNavigate?.(entity.label)}
                                                    >
                                                        {entity.label}
                                                    </span>
                                                    <button
                                                        onClick={() => handleDeleteEntity(entity.id)}
                                                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/10 transition-all"
                                                        title="Delete entity"
                                                    >
                                                        <Trash2 className="w-3 h-3 text-destructive" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </ScrollArea>

            {/* Total count footer with scope indicator */}
            <div className="p-2 border-t border-border/50 text-[10px] text-muted-foreground text-center">
                <div>{entities.length} entities</div>
                {scopeContext && scopeContext.activeScope.id !== 'vault:global' && (
                    <div className="mt-0.5 opacity-70 truncate" title={scopeContext.scopeLabel}>
                        📍 {scopeContext.scopeLabel}
                    </div>
                )}
            </div>

            {/* Add Entity Dialog */}
            <AddEntityDialog
                open={isAddOpen}
                onOpenChange={setIsAddOpen}
                onAdd={handleAddEntity}
            />

            {/* Flush Confirmation */}
            <AlertDialog open={isFlushOpen} onOpenChange={setIsFlushOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-destructive" />
                            Flush Entity Registry
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete all {entities.length} registered entities.
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleFlushRegistry}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Flush All
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
