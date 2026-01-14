// src/components/hub/HubPanel.tsx
// Main Hub Panel - integrates all Blueprint Hub functionality into footer

import { useState } from 'react';
import { ChevronDown, ChevronRight, Palette, Regex, Settings2, Network, Sparkles, Check, Clock, GitGraph } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { GraphTab } from './tabs/GraphTab';
import { ThemeTab } from './tabs/ThemeTab';
import { PatternsTab } from './tabs/PatternsTab';
import { FieldsTab } from './tabs/FieldsTab';
import { NetworksTab } from './tabs/NetworksTab';
import { ExtractionTab } from './tabs/ExtractionTab';
import type { EntityStats } from './types';
import type { Note } from '@/types/noteTypes';

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
    characterCount
}: HubPanelProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('graph');

    const entityCount = entityStats.length;

    return (
        <div className="sticky bottom-0 z-20 border-t border-border bg-background w-full shrink-0 shadow-[0_-1px_3px_rgba(0,0,0,0.2)]">
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                <div className="flex items-center h-9 px-2 gap-2 bg-card/50 backdrop-blur-sm">
                    {/* Hub Panel Trigger */}
                    <CollapsibleTrigger asChild>
                        <Button
                            variant="ghost"
                            className="h-7 px-2 flex-1 justify-start gap-3 hover:bg-accent/50 text-xs text-muted-foreground hover:text-foreground"
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

                    {/* Status Indicators */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground px-2 min-w-fit">
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

                <CollapsibleContent className="border-t border-border bg-background">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
                        <TabsContent value="graph" className="mt-0 h-[50vh]">
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
