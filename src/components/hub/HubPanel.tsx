// src/components/hub/HubPanel.tsx
// Main Hub Panel - integrates all Blueprint Hub functionality into footer

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronRight, Palette, Regex, Settings2, Network, Sparkles, Check, Clock, GitGraph, GripHorizontal, Volume2, Pause, Square, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { GraphTab } from './tabs/GraphTab';
import { ThemeTab } from './tabs/ThemeTab';
import { PatternsTab } from './tabs/PatternsTab';
import { FieldsTab } from './tabs/FieldsTab';
import { NetworksTab } from './tabs/NetworksTab';
import { ExtractionTab } from './tabs/ExtractionTab';
import { useTTS } from '@/lib/tts';
import type { EntityStats } from './types';
import type { Note } from '@/types/noteTypes';
import { ScopeSelector } from '@/components/scope/ScopeSelector';
import { useScopeContextSafe } from '@/contexts/ScopeContext';
import { smartGraphRegistry } from '@/lib/registry';
import { getNotesInScope } from '@/lib/scope/computeNodeScope';
import { buildArboristTree } from '@/lib/arborist/adapter';
import { useNotesStore } from '@/hooks/useNotesStore';

interface HubPanelProps {
    entityStats: EntityStats[];
    notes: Note[];
    onNavigate: (title: string) => void;
    onCreate: (label: string, entityKind: string) => void;
    // Status indicators
    isSaving?: boolean;
    lastSaved?: Date | null;
    notesCount?: number;
    wordCount?: number;
    characterCount?: number;
    // Backlinks
    backlinksCount?: number;
    onBacklinksClick?: () => void;
    // TTS
    currentNoteText?: string;
}

export function HubPanel({
    entityStats,
    notes,
    onNavigate,
    onCreate,
    isSaving = false,
    lastSaved,
    notesCount = 0,
    wordCount,
    characterCount,
    backlinksCount = 0,
    onBacklinksClick,
    currentNoteText
}: HubPanelProps) {
    // TTS hook
    const { state: ttsState, play, pause, resume, stop, initModel } = useTTS();
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('graph');

    // Resizable height state
    const [panelHeight, setPanelHeight] = useState(() => {
        const saved = localStorage.getItem('hub-panel-height');
        return saved ? parseInt(saved, 10) : 400;
    });
    const isResizing = useRef(false);
    const startY = useRef(0);
    const startHeight = useRef(0);

    const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isResizing.current = true;
        startY.current = e.clientY;
        startHeight.current = panelHeight;
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
    }, [panelHeight]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing.current) return;
            // Moving up = smaller clientY = larger delta = larger height
            const delta = startY.current - e.clientY;
            const newHeight = Math.min(Math.max(startHeight.current + delta, 150), window.innerHeight * 0.8);
            setPanelHeight(newHeight);
        };

        const handleMouseUp = () => {
            if (isResizing.current) {
                isResizing.current = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                localStorage.setItem('hub-panel-height', panelHeight.toString());
            }
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [panelHeight]);

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
            return []; // Empty = global
        }
        return getNotesInScope(scopeContext.activeScope, treeData);
    }, [scopeContext?.activeScope, treeData]);

    // Scope-aware entity count
    const entityCount = useMemo(() => {
        // Guard: Don't query if registry not initialized yet
        if (!smartGraphRegistry.isInitialized()) {
            return 0;
        }
        if (notesInScope.length > 0) {
            return smartGraphRegistry.getEntityCountByScope(notesInScope);
        }
        return smartGraphRegistry.getAllEntities().length;
    }, [notesInScope, entityStats]); // Re-compute when entityStats (scan) changes

    return (
        <div className="sticky bottom-0 z-20 border-t border-border bg-background w-full shrink-0 shadow-[0_-1px_3px_rgba(0,0,0,0.2)]">
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                <div className="flex items-center h-9 px-2 gap-2 bg-card/50 backdrop-blur-sm">
                    {/* Hub Panel Trigger */}
                    <CollapsibleTrigger asChild>
                        <Button
                            variant="ghost"
                            className="h-7 px-2 w-fit justify-start gap-3 hover:bg-accent/50 text-xs text-muted-foreground hover:text-foreground shrink-0"
                        >
                            {isOpen ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                            )}
                            <GitGraph className="h-3.5 w-3.5" />
                            <span className="font-medium text-foreground">Hub</span>
                            <span className="flex items-center gap-2 opacity-80">
                                <span>{entityCount} entities</span>
                            </span>
                        </Button>
                    </CollapsibleTrigger>

                    {/* Scope Selector */}
                    <ScopeSelector compact />

                    {/* TTS Button */}
                    <div className="flex items-center">
                        {ttsState.status === 'loading-model' ? (
                            <div className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                <span className="hidden sm:inline">{Math.round(ttsState.progress)}%</span>
                            </div>
                        ) : ttsState.status === 'synthesizing' || ttsState.status === 'playing' ? (
                            <div className="flex items-center gap-1">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => pause()}
                                        >
                                            <Pause className="h-3.5 w-3.5" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Pause</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => stop()}
                                        >
                                            <Square className="h-3 w-3" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Stop</TooltipContent>
                                </Tooltip>
                                <span className="text-xs text-muted-foreground tabular-nums px-1">
                                    {ttsState.currentChunkIndex + 1}/{ttsState.totalChunks}
                                </span>
                            </div>
                        ) : ttsState.status === 'paused' ? (
                            <div className="flex items-center gap-1">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-primary"
                                            onClick={() => resume()}
                                        >
                                            <Volume2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Resume</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => stop()}
                                        >
                                            <Square className="h-3 w-3" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Stop</TooltipContent>
                                </Tooltip>
                            </div>
                        ) : (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={async () => {
                                            if (!ttsState.modelReady) {
                                                await initModel();
                                            } else if (currentNoteText) {
                                                await play(currentNoteText);
                                            }
                                        }}
                                        disabled={ttsState.modelReady && !currentNoteText}
                                    >
                                        <Volume2 className="h-3.5 w-3.5" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {!ttsState.modelReady ? 'Load TTS Model' : 'Read Aloud'}
                                </TooltipContent>
                            </Tooltip>
                        )}
                    </div>

                    {/* Status Indicators */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground px-2 min-w-fit ml-auto">
                        {/* Backlinks - clickable */}
                        <button
                            onClick={onBacklinksClick}
                            className="hidden sm:inline opacity-80 hover:opacity-100 hover:text-primary transition-colors cursor-pointer"
                        >
                            {backlinksCount} backlinks
                        </button>
                        {(wordCount !== undefined || characterCount !== undefined) && (
                            <>
                                <span className="hidden sm:inline opacity-80">{wordCount ?? 0} words</span>
                                <span className="hidden sm:inline opacity-80">{characterCount ?? 0} chars</span>
                                <div className="w-px h-3 bg-border hidden sm:block" />
                            </>
                        )}
                        <span>{notesCount} notes</span>
                        {isSaving ? (
                            <span className="flex items-center gap-1.5 animate-pulse text-primary">
                                <Clock className="h-3.5 w-3.5" />
                                Saving...
                            </span>
                        ) : lastSaved ? (
                            <span className="flex items-center gap-1.5 text-green-500">
                                <Check className="h-3.5 w-3.5" />
                                Saved
                            </span>
                        ) : null}
                    </div>
                </div>

                <CollapsibleContent className="border-t border-border bg-background relative">
                    {/* Resize Handle */}
                    <div
                        className="absolute top-0 left-0 right-0 h-1.5 cursor-row-resize hover:bg-teal-500/50 active:bg-teal-500 z-30 transition-colors flex items-center justify-center group"
                        onMouseDown={handleResizeMouseDown}
                    >
                        <GripHorizontal className="h-3 w-6 text-muted-foreground/30 group-hover:text-teal-400 transition-colors" />
                    </div>
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full" style={{ height: panelHeight }}>
                        <div className="sticky top-0 z-10 bg-background border-b border-border">
                            <TabsList className="w-full h-auto flex-wrap justify-start gap-1 p-2 bg-transparent">
                                <TabsTrigger value="graph" className="flex items-center gap-1.5 text-xs h-7 px-3">
                                    <GitGraph className="h-3.5 w-3.5" />
                                    Graph
                                </TabsTrigger>
                                <TabsTrigger value="theme" className="flex items-center gap-1.5 text-xs h-7 px-3">
                                    <Palette className="h-3.5 w-3.5" />
                                    Theme
                                </TabsTrigger>
                                <TabsTrigger value="patterns" className="flex items-center gap-1.5 text-xs h-7 px-3">
                                    <Regex className="h-3.5 w-3.5" />
                                    Patterns
                                </TabsTrigger>
                                <TabsTrigger value="fields" className="flex items-center gap-1.5 text-xs h-7 px-3">
                                    <Settings2 className="h-3.5 w-3.5" />
                                    Fields
                                </TabsTrigger>
                                <TabsTrigger value="networks" className="flex items-center gap-1.5 text-xs h-7 px-3">
                                    <Network className="h-3.5 w-3.5" />
                                    Networks
                                </TabsTrigger>
                                <TabsTrigger value="extraction" className="flex items-center gap-1.5 text-xs h-7 px-3">
                                    <Sparkles className="h-3.5 w-3.5" />
                                    Extraction
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        {/* Graph Tab - full height, no padding for master-detail layout */}
                        <TabsContent value="graph" className="mt-0 h-full overflow-hidden">
                            <GraphTab
                                entityStats={entityStats}
                                notes={notes}
                                onNavigate={onNavigate}
                                onCreate={onCreate}
                            />
                        </TabsContent>

                        <div className="p-4">
                            <TabsContent value="theme" className="mt-0">
                                <ThemeTab />
                            </TabsContent>

                            <TabsContent value="patterns" className="mt-0">
                                <PatternsTab />
                            </TabsContent>

                            <TabsContent value="fields" className="mt-0">
                                <FieldsTab />
                            </TabsContent>

                            <TabsContent value="networks" className="mt-0">
                                <NetworksTab />
                            </TabsContent>

                            <TabsContent value="extraction" className="mt-0">
                                <ExtractionTab />
                            </TabsContent>
                        </div>
                    </Tabs>
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
}

export default HubPanel;
