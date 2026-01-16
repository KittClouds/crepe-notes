import React from 'react';
import { useNarrativeDashboard } from '@/hooks/useNarrativeDashboard';
import { NarrativeOrderList } from './scenes/NarrativeOrderList';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Pin, PinOff, Filter, BookOpen } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

export function SceneDashboard() {
    const {
        activeScope,
        isPinned,
        togglePin,
        scenes,
        reorderScenes
    } = useNarrativeDashboard();

    return (
        <div className="flex flex-col h-full bg-background/50">
            {/* Header / Scope Bar */}
            <div className="p-3 pb-2 space-y-2">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold tracking-tight flex items-center gap-2">
                        <BookOpen className="h-4 w-4" />
                        Scenes
                    </h2>
                    <div className="flex items-center gap-1">
                        <Button
                            variant={isPinned ? "default" : "ghost"}
                            size="icon"
                            className="h-6 w-6"
                            onClick={togglePin}
                            title={isPinned ? "Unpin scope" : "Pin current scope"}
                        >
                            {isPinned ? <Pin className="h-3 w-3" /> : <PinOff className="h-3 w-3" />}
                        </Button>
                    </div>
                </div>

                {/* Scope Indicator */}
                <div className="flex items-center gap-2 text-xs bg-muted/40 p-2 rounded-md border">
                    <Filter className="h-3 w-3 text-muted-foreground" />
                    {activeScope ? (
                        <div className="flex-1 truncate">
                            Scope: <span className="font-medium text-foreground">{activeScope.label}</span>
                            <span className="ml-1 text-muted-foreground opacity-70">
                                ({activeScope.kind})
                            </span>
                        </div>
                    ) : (
                        <div className="flex-1 text-muted-foreground italic">
                            Select a container or entity...
                        </div>
                    )}
                </div>
            </div>

            <Separator />

            {/* List */}
            <ScrollArea className="flex-1">
                <NarrativeOrderList
                    scenes={scenes}
                    onReorder={reorderScenes}
                />
            </ScrollArea>
        </div>
    );
}
