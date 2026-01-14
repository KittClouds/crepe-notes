// src/components/hub/tabs/EntitiesTab.tsx
// Entities tab - shows entities detected in this note with create functionality

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Plus, FileText } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { EntityStats } from '../types';
import type { Note } from '@/types/noteTypes';
import { ENTITY_COLORS } from '@/lib/Scanner/styles';

interface EntitiesPanelProps {
    entityStats: EntityStats[];
    notes: Note[];
    onNavigate: (label: string) => void;
    onCreate: (label: string, entityKind: string) => void;
}

export function EntitiesTab({ entityStats, notes, onNavigate, onCreate }: EntitiesPanelProps) {
    // Check if entity note exists
    const checkEntityNoteExists = (label: string, kind: string): boolean => {
        const normalizedLabel = label.toLowerCase().trim();
        return notes.some(n =>
            n.title.toLowerCase().trim() === normalizedLabel ||
            (n.isEntity && n.entityLabel?.toLowerCase().trim() === normalizedLabel) ||
            // Also check for formatted title like [CHARACTER|Sanji]
            n.title.toLowerCase().includes(`[${kind.toLowerCase()}|${normalizedLabel}]`)
        );
    };

    // Group entities by kind
    const byKind = entityStats.reduce((acc, stat) => {
        if (!acc[stat.entityKind]) {
            acc[stat.entityKind] = [];
        }
        acc[stat.entityKind].push(stat);
        return acc;
    }, {} as Record<string, EntityStats[]>);

    return (
        <Card className="h-full flex flex-col border-0 bg-transparent shadow-none">
            <CardHeader className="pb-3 px-3 pt-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Entities
                    <Badge variant="secondary" className="ml-auto">
                        {entityStats.length}
                    </Badge>
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 p-0">
                <ScrollArea className="h-full px-3">
                    {entityStats.length === 0 ? (
                        <div className="text-center text-sm text-muted-foreground py-8">
                            <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                            <p>No entities detected</p>
                            <p className="text-xs mt-1 opacity-70">
                                Use [KIND|Name] to tag entities
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4 pb-4">
                            {Object.entries(byKind).map(([kind, stats]) => {
                                const colors = ENTITY_COLORS[kind as keyof typeof ENTITY_COLORS];
                                return (
                                    <div key={kind}>
                                        <h4
                                            className="text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-2"
                                            style={{ color: colors?.bg }}
                                        >
                                            <Badge
                                                variant="outline"
                                                className="text-xs"
                                                style={colors ? {
                                                    backgroundColor: `${colors.bg}20`,
                                                    color: colors.bg,
                                                    borderColor: `${colors.bg}40`
                                                } : undefined}
                                            >
                                                {kind}
                                            </Badge>
                                            <span className="text-muted-foreground">{stats.length}</span>
                                        </h4>
                                        <div className="space-y-1">
                                            {stats.map((stat, idx) => {
                                                const noteExists = checkEntityNoteExists(stat.entityLabel, stat.entityKind);
                                                return (
                                                    <div
                                                        key={`${kind}-${idx}`}
                                                        className="p-2 rounded-md bg-card hover:bg-accent transition-colors cursor-pointer flex items-center gap-2 border"
                                                        onClick={() => noteExists ? onNavigate(stat.entityLabel) : onCreate(stat.entityLabel, stat.entityKind)}
                                                    >
                                                        {noteExists ? (
                                                            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                                        ) : (
                                                            <Plus className="h-3.5 w-3.5 text-primary shrink-0" />
                                                        )}
                                                        <span
                                                            className="text-sm flex-1 truncate"
                                                            style={{ color: colors?.bg }}
                                                        >
                                                            {stat.entityLabel}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {stat.mentionsInThisNote}× here
                                                        </span>
                                                        {!noteExists && (
                                                            <Button
                                                                size="sm"
                                                                variant="default"
                                                                className="h-6 px-2 text-xs bg-primary hover:bg-primary/90"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    onCreate(stat.entityLabel, stat.entityKind);
                                                                }}
                                                            >
                                                                Create
                                                            </Button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </ScrollArea>
            </CardContent>
        </Card>
    );
}

export default EntitiesTab;
