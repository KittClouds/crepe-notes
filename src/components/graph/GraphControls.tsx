/**
 * GraphControls - Controls for graph visualization
 * 
 * Simplified version without legacy projections system.
 * Uses GraphScope from graph-types instead.
 */
import React from 'react';
import type { GraphScope } from '@/lib/graph/types/graph-types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Separator } from '@/components/ui/separator';

// Filter state for graph visualization
export interface FilterState {
    minWeight: number;
    showOrphans: boolean;
    highlightedKinds: string[];
}

interface GraphControlsProps {
    scope: GraphScope;
    setScope: (scope: GraphScope) => void;
    filters: FilterState;
    setFilters: (f: FilterState | ((prev: FilterState) => FilterState)) => void;
    className?: string;
}

export default function GraphControls({
    scope,
    setScope,
    filters,
    setFilters,
    className
}: GraphControlsProps) {

    // Handlers for scope change
    const handleTypeChange = (value: string) => {
        switch (value) {
            case 'global':
                setScope({ type: 'global' });
                break;
            case 'note':
                // For note scope, we'd need a noteId - default to global for now
                setScope({ type: 'global' });
                break;
            case 'folder':
                // For folder scope, we'd need a folderId - default to global for now
                setScope({ type: 'global' });
                break;
            default:
                setScope({ type: 'global' });
        }
    };

    return (
        <div className={className}>
            <div className="bg-background/95 backdrop-blur border-t p-4 flex flex-col gap-4">

                {/* Scope Selector Row */}
                <div className="flex flex-wrap gap-4 items-center">
                    <div className="flex flex-col gap-1.5 w-40">
                        <Label className="text-xs text-muted-foreground">Graph Scope</Label>
                        <Select value={scope.type} onValueChange={handleTypeChange}>
                            <SelectTrigger className="h-8">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="global">Global (All)</SelectItem>
                                <SelectItem value="note">Current Note</SelectItem>
                                <SelectItem value="folder">Current Folder</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <Separator orientation="vertical" className="h-8" />

                    {/* Filter Controls */}
                    <div className="flex flex-col gap-1.5 w-60">
                        <div className="flex justify-between">
                            <Label className="text-xs text-muted-foreground">Min Weight</Label>
                            <span className="text-xs font-mono">{filters.minWeight}</span>
                        </div>
                        <Slider
                            value={[filters.minWeight]}
                            max={10}
                            step={1}
                            onValueChange={(v) => setFilters(prev => ({ ...prev, minWeight: v[0] }))}
                        />
                    </div>
                </div>

            </div>
        </div>
    );
}
