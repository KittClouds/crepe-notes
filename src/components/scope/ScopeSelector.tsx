/**
 * ScopeSelector - Dropdown to select entity scope
 * 
 * Allows selecting:
 * - Global (all entities)
 * - Any folder (aggregate)
 * - Any note (note-only)
 * - Narrative vaults (vault-wide)
 */

import { useState, useMemo, useCallback } from 'react';
import { ChevronDown, Globe, Folder, FileText, Book, Check, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useScopeContext } from '@/contexts/ScopeContext';
import { buildArboristTree } from '@/lib/arborist/adapter';
import { useNotesStore } from '@/hooks/useNotesStore';
import type { ArboristNode } from '@/lib/arborist/types';
import { GLOBAL_SCOPE } from '@/lib/scope/scopeTypes';

interface ScopeSelectorProps {
    className?: string;
    /** Compact mode - smaller trigger */
    compact?: boolean;
}

export function ScopeSelector({ className, compact = false }: ScopeSelectorProps) {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const { activeScope, selectedNode, setSelectedNode, scopeLabel } = useScopeContext();
    const { folderTree, globalNotes } = useNotesStore();

    // Build flat list of all selectable items
    const treeData = useMemo(
        () => buildArboristTree(folderTree, globalNotes),
        [folderTree, globalNotes]
    );

    // Flatten tree for easy searching/display
    const flatItems = useMemo(() => {
        const items: Array<{
            node: ArboristNode | null;
            depth: number;
            isGlobal?: boolean;
            isNarrative?: boolean;
        }> = [];

        // Add global option first
        items.push({ node: null, depth: 0, isGlobal: true });

        // Recursively flatten tree
        function flatten(nodes: ArboristNode[], depth: number) {
            for (const node of nodes) {
                items.push({
                    node,
                    depth,
                    isNarrative: node.isNarrativeRoot,
                });
                if (node.children) {
                    flatten(node.children, depth + 1);
                }
            }
        }

        flatten(treeData, 0);
        return items;
    }, [treeData]);

    // Filter by search
    const filteredItems = useMemo(() => {
        if (!searchQuery) return flatItems;
        const q = searchQuery.toLowerCase();
        return flatItems.filter(item => {
            if (item.isGlobal) return 'global'.includes(q) || 'all'.includes(q);
            return item.node?.name.toLowerCase().includes(q);
        });
    }, [flatItems, searchQuery]);

    // Handle selection
    const handleSelect = useCallback((item: typeof flatItems[0]) => {
        if (item.isGlobal) {
            setSelectedNode(null);
        } else if (item.node) {
            setSelectedNode(item.node);
        }
        setOpen(false);
        setSearchQuery('');
    }, [setSelectedNode]);

    // Get icon for current selection
    const getScopeIcon = () => {
        if (activeScope.id === 'vault:global') return Globe;
        if (activeScope.type === 'narrative') return Book;
        if (activeScope.type === 'folder') return Folder;
        return FileText;
    };

    const ScopeIcon = getScopeIcon();

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        "justify-between gap-2",
                        compact ? "h-7 px-2 text-xs" : "h-9 px-3",
                        className
                    )}
                >
                    <ScopeIcon className={cn("shrink-0", compact ? "w-3 h-3" : "w-4 h-4")} />
                    <span className="truncate max-w-[120px]">
                        {activeScope.id === 'vault:global' ? 'Global' : selectedNode?.name || 'Select scope...'}
                    </span>
                    <ChevronDown className={cn("shrink-0 opacity-50", compact ? "w-3 h-3" : "w-4 h-4")} />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
                {/* Search */}
                <div className="p-2 border-b border-border">
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-8 pl-7 text-sm"
                        />
                    </div>
                </div>

                {/* Tree List */}
                <ScrollArea className="h-64">
                    <div className="p-1">
                        {filteredItems.map((item, idx) => {
                            const isSelected = item.isGlobal
                                ? activeScope.id === 'vault:global'
                                : item.node?.id === selectedNode?.id;

                            return (
                                <button
                                    key={item.isGlobal ? 'global' : item.node?.id || idx}
                                    onClick={() => handleSelect(item)}
                                    className={cn(
                                        "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors",
                                        isSelected
                                            ? "bg-primary/10 text-primary"
                                            : "hover:bg-muted/50"
                                    )}
                                    style={{ paddingLeft: `${8 + item.depth * 12}px` }}
                                >
                                    {item.isGlobal ? (
                                        <>
                                            <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                                            <span className="font-medium">Global</span>
                                            <span className="text-xs text-muted-foreground ml-auto">All entities</span>
                                        </>
                                    ) : item.isNarrative ? (
                                        <>
                                            <Book className="w-4 h-4 text-purple-500 shrink-0" />
                                            <span className="truncate">{item.node?.name}</span>
                                            <span className="text-[10px] text-purple-500 ml-auto">Vault</span>
                                        </>
                                    ) : item.node?.type === 'folder' ? (
                                        <>
                                            <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                                            <span className="truncate">{item.node?.name}</span>
                                        </>
                                    ) : (
                                        <>
                                            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                                            <span className="truncate">{item.node?.name}</span>
                                        </>
                                    )}
                                    {isSelected && (
                                        <Check className="w-4 h-4 ml-auto shrink-0 text-primary" />
                                    )}
                                </button>
                            );
                        })}

                        {filteredItems.length === 0 && (
                            <div className="py-6 text-center text-sm text-muted-foreground">
                                No matches found
                            </div>
                        )}
                    </div>
                </ScrollArea>

                {/* Footer with scope info */}
                <div className="p-2 border-t border-border text-[10px] text-muted-foreground">
                    {activeScope.type === 'narrative' && (
                        <span>🔮 Vault-wide: shows all entities in narrative</span>
                    )}
                    {activeScope.type === 'folder' && activeScope.id !== 'vault:global' && (
                        <span>📁 Folder: aggregates child notes</span>
                    )}
                    {activeScope.type === 'note' && (
                        <span>📄 Note: shows only this note's entities</span>
                    )}
                    {activeScope.id === 'vault:global' && (
                        <span>🌐 Global: all entities across vault</span>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

export default ScopeSelector;
