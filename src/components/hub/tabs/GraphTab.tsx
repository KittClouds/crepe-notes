// src/components/hub/tabs/GraphTab.tsx
// Unified Graph Tab - Merges Entities + Relationships into master-detail view
// Left: Narrow virtualized entity browser | Right: Selected entity's graph

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
    User,
    Users,
    Search,
    ChevronRight,
    ChevronDown,
    Trash2,
    Network,
    Loader2,
    Plus,
    X,
    FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useEntitySelectionSafe } from '@/contexts/EntitySelectionContext';
import { useEntityRelationships, type GroupedRelationships, type ApplicableRelationshipType, type CandidateEntity, type ParsedEntity } from '@/hooks/useEntityRelationships';
import { useRelationshipTypes } from '@/hooks/useRelationshipTypes';
import { useBlueprintHubContext } from '@/contexts/BlueprintHubContext';
import { ENTITY_ICONS, ENTITY_KINDS, type EntityKind } from '@/lib/types/entityTypes';
import { getEntityColor, getEntityBgColor } from '@/lib/store/entityColorStore';
import type { EntityStats } from '../types';
import type { Note } from '@/types/noteTypes';

// ============================================================
// MAIN COMPONENT
// ============================================================

interface GraphTabProps {
    entityStats: EntityStats[];
    notes: Note[];
    onNavigate: (label: string) => void;
    onCreate: (label: string, entityKind: string) => void;
    isLoading?: boolean;
}

export function GraphTab({ entityStats, notes, onNavigate, onCreate, isLoading }: GraphTabProps) {
    const entitySelectionContext = useEntitySelectionSafe();
    const selectedEntity = entitySelectionContext?.selectedEntity ?? null;

    // Convert to ParsedEntity format for detail view
    const parsedEntity: ParsedEntity | null = selectedEntity ? {
        kind: selectedEntity.kind as EntityKind,
        label: selectedEntity.label,
        noteId: selectedEntity.id,
        attributes: {},
    } : null;

    return (
        <div className="h-full flex">
            {/* Left Panel: Entity Browser (narrow, own scroll) */}
            <div className="w-48 shrink-0 border-r border-border/50 flex flex-col">
                <EntityBrowser
                    entityStats={entityStats}
                    notes={notes}
                    selectedLabel={selectedEntity?.label}
                    onSelect={(label, kind) => {
                        entitySelectionContext?.setSelectedEntity({
                            id: '', // Will be resolved
                            label,
                            kind,
                        });
                    }}
                    onCreate={onCreate}
                />
            </div>

            {/* Right Panel: Graph Detail */}
            <div className="flex-1 overflow-auto">
                {parsedEntity ? (
                    <GraphDetailView
                        entity={parsedEntity}
                        notes={notes}
                        onNavigate={onNavigate}
                        onCreate={onCreate}
                    />
                ) : (
                    <GraphEmptyState />
                )}
            </div>
        </div>
    );
}

// ============================================================
// ENTITY BROWSER (Left Panel)
// ============================================================

interface EntityBrowserProps {
    entityStats: EntityStats[];
    notes: Note[];
    selectedLabel?: string;
    onSelect: (label: string, kind: EntityKind) => void;
    onCreate: (label: string, kind: string) => void;
}

function EntityBrowser({ entityStats, notes, selectedLabel, onSelect, onCreate }: EntityBrowserProps) {
    const [expandedKinds, setExpandedKinds] = useState<Set<string>>(new Set(ENTITY_KINDS));
    const [searchQuery, setSearchQuery] = useState('');

    // Group entities by kind
    const byKind = useMemo(() => {
        const groups: Record<string, EntityStats[]> = {};
        for (const stat of entityStats) {
            if (!groups[stat.entityKind]) {
                groups[stat.entityKind] = [];
            }
            groups[stat.entityKind].push(stat);
        }
        return groups;
    }, [entityStats]);

    // Filter by search
    const filteredByKind = useMemo(() => {
        if (!searchQuery) return byKind;
        const q = searchQuery.toLowerCase();
        const filtered: Record<string, EntityStats[]> = {};
        for (const [kind, stats] of Object.entries(byKind)) {
            const matches = stats.filter(s => s.entityLabel?.toLowerCase().includes(q));
            if (matches.length > 0) {
                filtered[kind] = matches;
            }
        }
        return filtered;
    }, [byKind, searchQuery]);

    // Check if entity has a note
    const checkEntityNoteExists = useCallback((label: string, kind: string): boolean => {
        if (!label || !kind) return false;

        const normalizedLabel = label.toLowerCase().trim();
        const normalizedKind = kind.toLowerCase().trim();

        return notes.some(n => {
            if (!n.title) return false;
            const noteTitle = n.title.toLowerCase().trim();

            return noteTitle === normalizedLabel ||
                (n.isEntity && n.entityLabel?.toLowerCase().trim() === normalizedLabel) ||
                noteTitle.includes(`[${normalizedKind}|${normalizedLabel}]`);
        });
    }, [notes]);

    const toggleKind = (kind: string) => {
        setExpandedKinds(prev => {
            const next = new Set(prev);
            if (next.has(kind)) next.delete(kind);
            else next.add(kind);
            return next;
        });
    };

    const sortedKinds = Object.keys(filteredByKind).sort();

    return (
        <div className="flex flex-col h-full">
            {/* Search */}
            <div className="p-2 border-b border-border/50">
                <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input
                        placeholder="Filter..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-7 pl-7 text-xs bg-muted/30"
                    />
                </div>
            </div>

            {/* Entity List - VIRTUALIZED via ScrollArea */}
            <ScrollArea className="flex-1">
                <div className="p-1 space-y-0.5">
                    {sortedKinds.length === 0 ? (
                        <div className="text-center text-xs text-muted-foreground py-6">
                            No entities
                        </div>
                    ) : (
                        sortedKinds.map(kind => {
                            const stats = filteredByKind[kind];
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
                                            {stats.length}
                                        </Badge>
                                    </button>

                                    {/* Entity Items */}
                                    {isExpanded && (
                                        <div className="ml-3 space-y-px">
                                            {stats.map((stat, idx) => {
                                                const noteExists = checkEntityNoteExists(stat.entityLabel, stat.entityKind);
                                                const isSelected = selectedLabel === stat.entityLabel;

                                                return (
                                                    <button
                                                        key={`${kind}-${idx}`}
                                                        onClick={() => onSelect(stat.entityLabel, kind as EntityKind)}
                                                        className={cn(
                                                            "w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-left text-xs transition-colors",
                                                            isSelected
                                                                ? "bg-primary/10 text-primary"
                                                                : "hover:bg-muted/50"
                                                        )}
                                                    >
                                                        {noteExists ? (
                                                            <FileText className="w-3 h-3 shrink-0 text-muted-foreground" />
                                                        ) : (
                                                            <Plus className="w-3 h-3 shrink-0 text-primary" />
                                                        )}
                                                        <span className="truncate flex-1" style={{ color }}>
                                                            {stat.entityLabel}
                                                        </span>
                                                        <span className="text-[9px] text-muted-foreground shrink-0">
                                                            {stat.mentionsInThisNote}×
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </ScrollArea>

            {/* Total count footer */}
            <div className="p-2 border-t border-border/50 text-[10px] text-muted-foreground text-center">
                {entityStats.length} entities
            </div>
        </div>
    );
}

// ============================================================
// GRAPH DETAIL VIEW (Right Panel)
// ============================================================

interface GraphDetailViewProps {
    entity: ParsedEntity;
    notes: Note[];
    onNavigate: (label: string) => void;
    onCreate: (label: string, kind: string) => void;
}

function GraphDetailView({ entity, notes, onNavigate, onCreate }: GraphDetailViewProps) {
    const {
        groupedRelationships,
        applicableTypes,
        isLoading,
        createRelationship,
        deleteRelationship,
        getCandidates,
    } = useEntityRelationships(entity);

    const entitySelectionContext = useEntitySelectionSafe();
    const [isCreating, setIsCreating] = useState(false);

    const EntityIcon = ENTITY_ICONS[entity.kind as EntityKind] || User;
    const entityColor = getEntityColor(entity.kind);
    const entityBgColor = getEntityBgColor(entity.kind, 0.15);
    const totalConnections = groupedRelationships.reduce((sum, g) => sum + g.totalCount, 0);

    // Check if entity has note
    const noteExists = notes.some(n => {
        if (!n.title || !entity.label) return false;
        const noteTitle = n.title.toLowerCase().trim();
        const entityLabel = entity.label.toLowerCase().trim();

        return noteTitle === entityLabel ||
            (n.isEntity && n.entityLabel?.toLowerCase().trim() === entityLabel);
    });

    const handleNavigate = useCallback((targetEntity: {
        id: string;
        name: string;
        kind: EntityKind;
        noteId?: string;
    }) => {
        if (!entitySelectionContext) return;
        entitySelectionContext.setSelectedEntity({
            id: targetEntity.noteId || targetEntity.id,
            label: targetEntity.name,
            kind: targetEntity.kind,
        });
    }, [entitySelectionContext]);

    const handleDelete = useCallback(async (relationshipId: string) => {
        await deleteRelationship(relationshipId);
    }, [deleteRelationship]);

    const handleCreate = useCallback(async (targetEntityId: string, relationshipTypeId: string) => {
        const result = await createRelationship({ targetEntityId, relationshipTypeId });
        if (result) {
            setIsCreating(false);
        }
    }, [createRelationship]);

    return (
        <div className="p-4 space-y-6 animate-in fade-in duration-300">
            {/* Entity Focus Node */}
            <div className="flex flex-col items-center">
                <div
                    className="relative w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg transition-transform hover:scale-105"
                    style={{
                        backgroundColor: entityBgColor,
                        border: `2px solid ${getEntityBgColor(entity.kind, 0.4)}`,
                    }}
                >
                    <EntityIcon className="w-10 h-10" style={{ color: entityColor }} />
                    <div
                        className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-background border-2 flex items-center justify-center text-[10px] font-bold"
                        style={{ borderColor: entityColor, color: entityColor }}
                    >
                        {totalConnections}
                    </div>
                </div>
                <h2 className="mt-3 text-lg font-semibold">{entity.label}</h2>
                <div className="flex items-center gap-2 mt-1">
                    <Badge
                        variant="outline"
                        className="text-xs"
                        style={{ borderColor: entityColor, color: entityColor }}
                    >
                        {entity.kind}
                    </Badge>
                    {!noteExists && (
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-5 px-2 text-[10px]"
                            onClick={() => onCreate(entity.label, entity.kind)}
                        >
                            <Plus className="w-3 h-3 mr-1" />
                            Create Note
                        </Button>
                    )}
                </div>
            </div>

            {/* Connection Lines Visual */}
            {totalConnections > 0 && (
                <div className="flex justify-center">
                    <div className="w-px h-6 bg-gradient-to-b from-border to-transparent" />
                </div>
            )}

            {/* Connections Grid */}
            {isLoading ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
            ) : totalConnections > 0 ? (
                <div className="space-y-4">
                    {groupedRelationships.map((group) => (
                        <ConnectionGroup
                            key={group.type.id}
                            group={group}
                            onNavigate={handleNavigate}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>
            ) : !isCreating ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                    No connections yet
                </div>
            ) : null}

            {/* Inline Connection Creator */}
            {isCreating ? (
                <InlineConnectionCreator
                    entity={entity}
                    applicableTypes={applicableTypes}
                    getCandidates={getCandidates}
                    onCreate={handleCreate}
                    onCancel={() => setIsCreating(false)}
                />
            ) : (
                <Button
                    variant="outline"
                    className="w-full h-12 border-dashed gap-2 hover:bg-primary/5 hover:border-primary/50 transition-all"
                    onClick={() => setIsCreating(true)}
                >
                    <Plus className="w-4 h-4" />
                    Add Connection
                </Button>
            )}
        </div>
    );
}

// ============================================================
// CONNECTION GROUP
// ============================================================

function ConnectionGroup({
    group,
    onNavigate,
    onDelete,
}: {
    group: GroupedRelationships;
    onNavigate: (entity: { id: string; name: string; kind: EntityKind; noteId?: string }) => void;
    onDelete: (relationshipId: string) => void;
}) {
    const { type, outgoing, incoming } = group;
    const allConnections = [...outgoing, ...incoming];

    return (
        <div className="space-y-2">
            {/* Relationship Type Header */}
            <div className="flex items-center gap-2 px-1">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {type.displayLabel}
                </span>
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                    {group.totalCount}
                </Badge>
                <div className="h-px flex-1 bg-border" />
            </div>

            {/* Connected Entity Nodes */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {allConnections.map((rel) => {
                    const isIncoming = incoming.includes(rel);
                    const displayEntity = isIncoming ? rel.sourceEntity : rel.targetEntity;
                    const TargetIcon = ENTITY_ICONS[displayEntity.kind] || Users;
                    const targetColor = getEntityColor(displayEntity.kind);
                    const targetBgColor = getEntityBgColor(displayEntity.kind, 0.15);

                    return (
                        <div
                            key={rel.id}
                            className="group relative rounded-xl p-3 bg-muted/30 border border-border/50 hover:bg-muted/50 hover:border-border transition-all cursor-pointer"
                            onClick={() => onNavigate(displayEntity)}
                        >
                            {/* Entity Node */}
                            <div className="flex items-center gap-2">
                                <div
                                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                                    style={{ backgroundColor: targetBgColor }}
                                >
                                    <TargetIcon className="w-4 h-4" style={{ color: targetColor }} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="font-medium text-sm truncate">{displayEntity.name}</p>
                                    <p className="text-[10px] text-muted-foreground">{displayEntity.kind}</p>
                                </div>
                            </div>

                            {/* Direction indicator */}
                            {isIncoming && (
                                <div className="absolute top-1 right-1">
                                    <ChevronRight className="w-3 h-3 text-muted-foreground rotate-180" />
                                </div>
                            )}

                            {/* Delete button */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(rel.id);
                                }}
                                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 transition-all"
                            >
                                <Trash2 className="w-3 h-3 text-destructive" />
                            </button>

                            {/* Confidence indicator */}
                            {rel.confidence < 1.0 && (
                                <div
                                    className="absolute bottom-1 right-1 text-[8px] px-1 rounded"
                                    style={{
                                        backgroundColor: rel.confidence > 0.7 ? '#22c55e20' : '#f59e0b20',
                                        color: rel.confidence > 0.7 ? '#22c55e' : '#f59e0b',
                                    }}
                                >
                                    {Math.round(rel.confidence * 100)}%
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ============================================================
// INLINE CONNECTION CREATOR
// ============================================================

function InlineConnectionCreator({
    entity,
    applicableTypes,
    getCandidates,
    onCreate,
    onCancel,
}: {
    entity: ParsedEntity;
    applicableTypes: ApplicableRelationshipType[];
    getCandidates: (typeId: string) => Promise<CandidateEntity[]>;
    onCreate: (targetEntityId: string, relationshipTypeId: string) => void;
    onCancel: () => void;
}) {
    const [selectedTypeId, setSelectedTypeId] = useState('');
    const [candidates, setCandidates] = useState<CandidateEntity[]>([]);
    const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTargetId, setSelectedTargetId] = useState('');

    const selectedType = applicableTypes.find(t => t.id === selectedTypeId);
    const EntityIcon = ENTITY_ICONS[entity.kind as EntityKind] || User;
    const entityColor = getEntityColor(entity.kind);

    const handleTypeSelect = useCallback(async (typeId: string) => {
        setSelectedTypeId(typeId);
        setSelectedTargetId('');
        setSearchQuery('');

        if (typeId) {
            setIsLoadingCandidates(true);
            try {
                const cands = await getCandidates(typeId);
                setCandidates(cands);
            } catch (err) {
                console.error('Failed to load candidates:', err);
                setCandidates([]);
            } finally {
                setIsLoadingCandidates(false);
            }
        } else {
            setCandidates([]);
        }
    }, [getCandidates]);

    const filteredCandidates = candidates.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !c.hasExistingRelationship
    );

    const handleCreate = () => {
        if (selectedTargetId && selectedTypeId) {
            onCreate(selectedTargetId, selectedTypeId);
        }
    };

    return (
        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-4 animate-in slide-in-from-bottom-2 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    New Connection
                </h3>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCancel}>
                    <X className="w-4 h-4" />
                </Button>
            </div>

            {/* Visual Flow */}
            <div className="flex items-center gap-3 py-2">
                {/* Source Entity */}
                <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: getEntityBgColor(entity.kind, 0.15), border: `1px solid ${getEntityBgColor(entity.kind, 0.3)}` }}
                >
                    <EntityIcon className="w-6 h-6" style={{ color: entityColor }} />
                </div>

                {/* Relationship Type Selector */}
                <div className="flex-1">
                    <Select value={selectedTypeId} onValueChange={handleTypeSelect}>
                        <SelectTrigger className="h-10 bg-background border-dashed">
                            <SelectValue placeholder="Select relationship..." />
                        </SelectTrigger>
                        <SelectContent>
                            {applicableTypes.length === 0 ? (
                                <div className="py-3 px-2 text-center text-sm text-muted-foreground">
                                    No relationship types defined yet
                                </div>
                            ) : (
                                applicableTypes.map((type) => {
                                    const TargetIcon = ENTITY_ICONS[type.otherEntityKind] || Users;
                                    const targetColor = getEntityColor(type.otherEntityKind);
                                    return (
                                        <SelectItem key={type.id} value={type.id}>
                                            <span className="flex items-center gap-2">
                                                <span>{type.displayLabel}</span>
                                                <span className="text-muted-foreground">→</span>
                                                <TargetIcon className="w-3 h-3" style={{ color: targetColor }} />
                                                <span className="text-muted-foreground text-xs">{type.otherEntityKind}</span>
                                            </span>
                                        </SelectItem>
                                    );
                                })
                            )}
                        </SelectContent>
                    </Select>
                </div>

                {/* Arrow */}
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />

                {/* Target Preview */}
                {selectedTargetId ? (
                    (() => {
                        const target = candidates.find(c => c.id === selectedTargetId);
                        if (!target) return null;
                        const TargetIcon = ENTITY_ICONS[target.kind] || Users;
                        const targetColor = getEntityColor(target.kind);
                        return (
                            <div
                                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                                style={{ backgroundColor: getEntityBgColor(target.kind, 0.15), border: `1px solid ${getEntityBgColor(target.kind, 0.3)}` }}
                            >
                                <TargetIcon className="w-6 h-6" style={{ color: targetColor }} />
                            </div>
                        );
                    })()
                ) : (
                    <div className="w-12 h-12 rounded-xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center shrink-0">
                        <span className="text-muted-foreground text-lg">?</span>
                    </div>
                )}
            </div>

            {/* Target Selection */}
            {selectedTypeId && (
                <div className="space-y-2">
                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder={`Search ${selectedType?.otherEntityKind}s...`}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 h-9 bg-background"
                        />
                    </div>

                    {/* Candidates Grid */}
                    {isLoadingCandidates ? (
                        <div className="flex items-center justify-center py-6">
                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        </div>
                    ) : filteredCandidates.length === 0 ? (
                        <div className="text-center py-6 text-sm text-muted-foreground">
                            {searchQuery ? 'No matches found' : `No available ${selectedType?.otherEntityKind}s`}
                        </div>
                    ) : (
                        <ScrollArea className="h-40">
                            <div className="grid grid-cols-2 gap-1.5 pr-2">
                                {filteredCandidates.map((cand) => {
                                    const CandIcon = ENTITY_ICONS[cand.kind] || Users;
                                    const candColor = getEntityColor(cand.kind);
                                    const isSelected = selectedTargetId === cand.id;

                                    return (
                                        <button
                                            key={cand.id}
                                            onClick={() => setSelectedTargetId(cand.id)}
                                            className={cn(
                                                'flex items-center gap-2 p-2 rounded-lg text-left transition-all',
                                                isSelected
                                                    ? 'bg-primary/10 border border-primary/40'
                                                    : 'bg-background hover:bg-muted/50 border border-transparent'
                                            )}
                                        >
                                            <CandIcon className="w-4 h-4 shrink-0" style={{ color: candColor }} />
                                            <span className="text-sm truncate">{cand.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    )}
                </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={onCancel}>
                    Cancel
                </Button>
                <Button
                    size="sm"
                    onClick={handleCreate}
                    disabled={!selectedTypeId || !selectedTargetId}
                >
                    Create Connection
                </Button>
            </div>
        </div>
    );
}

// ============================================================
// EMPTY STATE
// ============================================================

function GraphEmptyState() {
    const { versionId } = useBlueprintHubContext();
    const { relationshipTypes } = useRelationshipTypes(versionId);

    return (
        <div className="flex flex-col items-center justify-center h-full py-12 animate-in fade-in duration-300">
            {/* Visual */}
            <div className="relative mb-6">
                <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center">
                    <Network className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-muted flex items-center justify-center border-2 border-background">
                    <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                </div>
                <div className="absolute -bottom-2 -left-2 w-6 h-6 rounded-full bg-muted flex items-center justify-center border-2 border-background">
                    <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                </div>
            </div>

            {/* Message */}
            <p className="text-muted-foreground text-center mb-1">
                Select an entity from the list
            </p>
            <p className="text-xs text-muted-foreground/70 text-center mb-6">
                to view and manage its connections
            </p>

            {/* Relationship Types Summary */}
            {relationshipTypes.length > 0 && (
                <div className="w-full max-w-xs">
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                        <Network className="w-3 h-3" />
                        Defined Types ({relationshipTypes.length})
                    </p>
                    <div className="space-y-1">
                        {relationshipTypes.slice(0, 5).map((rt) => {
                            const SourceIcon = ENTITY_ICONS[rt.source_entity_kind as EntityKind] || User;
                            const TargetIcon = ENTITY_ICONS[rt.target_entity_kind as EntityKind] || User;
                            const sourceColor = getEntityColor(rt.source_entity_kind);
                            const targetColor = getEntityColor(rt.target_entity_kind);

                            return (
                                <div
                                    key={rt.relationship_type_id}
                                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 text-xs"
                                >
                                    <SourceIcon className="w-3 h-3" style={{ color: sourceColor }} />
                                    <span className="text-muted-foreground">→</span>
                                    <span className="flex-1 truncate">{rt.display_label}</span>
                                    <span className="text-muted-foreground">→</span>
                                    <TargetIcon className="w-3 h-3" style={{ color: targetColor }} />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

export default GraphTab;
