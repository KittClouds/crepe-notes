// src/components/backlinks/BacklinksDrawer.tsx
// Pop-out drawer showing backlinks to the current note

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Link2, FileText, ChevronRight } from 'lucide-react';
import type { BacklinkItem } from '@/hooks/useBacklinks';

interface BacklinksDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    backlinks: BacklinkItem[];
    grouped: Record<string, BacklinkItem[]>;
    onNavigate: (noteTitle: string) => void;
}

export function BacklinksDrawer({
    open,
    onOpenChange,
    backlinks,
    grouped,
    onNavigate,
}: BacklinksDrawerProps) {
    const groupedEntries = Object.entries(grouped);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-[320px] sm:w-[380px] p-0 bg-card border-l border-border">
                <SheetHeader className="p-4 border-b border-border">
                    <SheetTitle className="flex items-center gap-2 text-base">
                        <Link2 className="h-4 w-4 text-primary" />
                        Linked Mentions
                        <span className="text-xs text-muted-foreground font-normal">
                            ({backlinks.length})
                        </span>
                    </SheetTitle>
                </SheetHeader>

                <ScrollArea className="h-[calc(100vh-80px)]">
                    <div className="p-3">
                        {backlinks.length === 0 ? (
                            <div className="text-center text-muted-foreground text-sm py-8">
                                No backlinks found.
                                <p className="mt-2 text-xs opacity-70">
                                    Other notes that link to this one will appear here.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {groupedEntries.map(([sourceTitle, items]) => (
                                    <div key={sourceTitle} className="rounded-lg bg-muted/30 overflow-hidden">
                                        {/* Source Note Header */}
                                        <button
                                            onClick={() => {
                                                onNavigate(sourceTitle);
                                                onOpenChange(false);
                                            }}
                                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
                                        >
                                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                                            <span className="font-medium text-sm truncate flex-1">
                                                {sourceTitle}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {items.length}
                                            </span>
                                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        </button>

                                        {/* Context Snippets */}
                                        {items.map((item, idx) => (
                                            item.context && (
                                                <div
                                                    key={idx}
                                                    className="px-3 py-2 border-t border-border/50 text-xs text-muted-foreground leading-relaxed"
                                                >
                                                    <span className="opacity-70">{item.context}</span>
                                                </div>
                                            )
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}
