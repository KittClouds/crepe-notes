// src/components/sidebar/EntityCreator.tsx
// Enhanced entity creation/editing interface with aliases and custom kinds

import { useState, useEffect, useMemo } from 'react';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ENTITY_KINDS, ENTITY_ICONS, type EntityKind } from '@/lib/types/entityTypes';
import { getEntityColor, getEntityBgColor } from '@/lib/store/entityColorStore';
import { X, Plus, Users, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

// =============================================================================
// Types
// =============================================================================

interface EntityData {
    id?: string;           // Present when editing
    label: string;
    kind: EntityKind | string; // string for custom kinds
    aliases: string[];
}

interface EntityCreatorProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (entity: EntityData) => void;
    editEntity?: EntityData;  // If provided, we're editing
    customKinds?: string[];   // User-defined custom kinds
}

interface AutoAliasConfig {
    lastName: boolean;
    firstLast: boolean;
    initials: boolean;
}

// =============================================================================
// Auto-Alias Generation
// =============================================================================

function generateAutoAliases(label: string, kind: string, config: AutoAliasConfig): string[] {
    const tokens = label.toLowerCase().split(/\s+/).filter(t => t && t.length > 1);
    if (tokens.length <= 1) return [];

    const aliases: string[] = [];
    const first = tokens[0];
    const last = tokens[tokens.length - 1];

    if (config.lastName && last.length >= 3) {
        aliases.push(last.charAt(0).toUpperCase() + last.slice(1));
    }

    if (config.firstLast && tokens.length >= 3) {
        const combined = `${first} ${last}`;
        aliases.push(combined.split(' ').map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' '));
    }

    if (config.initials && tokens.length >= 2) {
        const initials = tokens.map(t => t[0].toUpperCase()).join('');
        if (initials.length >= 2 && initials.length <= 4) {
            aliases.push(initials);
        }
    }

    return aliases;
}

// =============================================================================
// Component
// =============================================================================

export function EntityCreator({
    open,
    onOpenChange,
    onSave,
    editEntity,
    customKinds = []
}: EntityCreatorProps) {
    const isEditing = !!editEntity?.id;

    // Form state
    const [label, setLabel] = useState('');
    const [kind, setKind] = useState<string>('CHARACTER');
    const [aliases, setAliases] = useState<string[]>([]);
    const [newAlias, setNewAlias] = useState('');
    const [showCustomKindInput, setShowCustomKindInput] = useState(false);
    const [customKindInput, setCustomKindInput] = useState('');

    // Auto-alias config
    const [autoConfig, setAutoConfig] = useState<AutoAliasConfig>({
        lastName: true,
        firstLast: true,
        initials: false,
    });

    // All available kinds (built-in + custom)
    const allKinds = useMemo(() => {
        const builtIn = ENTITY_KINDS.filter(k =>
            ['CHARACTER', 'LOCATION', 'FACTION', 'EVENT', 'ITEM', 'CONCEPT', 'NPC'].includes(k)
        );
        return [...builtIn, ...customKinds];
    }, [customKinds]);

    // Auto-generated aliases (for display, not persisted separately)
    const autoAliases = useMemo(() => {
        return generateAutoAliases(label, kind, autoConfig);
    }, [label, kind, autoConfig]);

    // Reset form when dialog opens/closes or edit entity changes
    useEffect(() => {
        if (open) {
            if (editEntity) {
                setLabel(editEntity.label);
                setKind(editEntity.kind);
                setAliases(editEntity.aliases || []);
            } else {
                setLabel('');
                setKind('CHARACTER');
                setAliases([]);
            }
            setNewAlias('');
            setShowCustomKindInput(false);
            setCustomKindInput('');
        }
    }, [open, editEntity]);

    // Handlers
    const handleAddAlias = () => {
        const trimmed = newAlias.trim();
        if (trimmed && !aliases.includes(trimmed)) {
            setAliases([...aliases, trimmed]);
            setNewAlias('');
        }
    };

    const handleRemoveAlias = (alias: string) => {
        setAliases(aliases.filter(a => a !== alias));
    };

    const handleAddCustomKind = () => {
        const trimmed = customKindInput.trim().toUpperCase();
        if (trimmed && !allKinds.includes(trimmed)) {
            setKind(trimmed);
            setShowCustomKindInput(false);
            setCustomKindInput('');
        }
    };

    const handleSubmit = () => {
        if (!label.trim()) return;

        // Combine manual aliases with auto-generated ones
        const finalAliases = [...new Set([...aliases, ...autoAliases])];

        onSave({
            id: editEntity?.id,
            label: label.trim(),
            kind: kind as EntityKind,
            aliases: finalAliases,
        });

        onOpenChange(false);
    };

    const getKindColor = (k: string) => {
        if (ENTITY_KINDS.includes(k as EntityKind)) {
            return getEntityColor(k as EntityKind);
        }
        return '#94a3b8'; // Default gray for custom
    };

    const getKindBgColor = (k: string) => {
        if (ENTITY_KINDS.includes(k as EntityKind)) {
            return getEntityBgColor(k as EntityKind, 0.2);
        }
        return 'rgba(148, 163, 184, 0.2)';
    };

    const getKindIcon = (k: string) => {
        if (ENTITY_KINDS.includes(k as EntityKind)) {
            return ENTITY_ICONS[k as EntityKind];
        }
        return Sparkles; // Custom kinds get sparkle icon
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle className="text-lg">
                        {isEditing ? 'Edit Entity' : 'Create Entity'}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-5 py-2">
                    {/* Name Input */}
                    <div className="space-y-2">
                        <Label htmlFor="entity-name" className="text-sm text-muted-foreground">
                            Name
                        </Label>
                        <Input
                            id="entity-name"
                            placeholder="Monkey D. Luffy"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            className="h-12 text-base"
                            autoFocus
                        />
                    </div>

                    {/* Kind Selector - Icon Buttons */}
                    <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                            {allKinds.map((k) => {
                                const Icon = getKindIcon(k);
                                const isSelected = kind === k;
                                const color = getKindColor(k);
                                const bgColor = getKindBgColor(k);

                                return (
                                    <button
                                        key={k}
                                        type="button"
                                        onClick={() => setKind(k)}
                                        className={cn(
                                            "flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all",
                                            "border-2",
                                            isSelected
                                                ? "border-current"
                                                : "border-transparent hover:border-muted"
                                        )}
                                        style={{
                                            color: isSelected ? color : 'var(--muted-foreground)',
                                            backgroundColor: isSelected ? bgColor : 'transparent',
                                        }}
                                    >
                                        <div
                                            className="w-10 h-10 rounded-full flex items-center justify-center"
                                            style={{
                                                backgroundColor: bgColor,
                                                borderColor: color,
                                                borderWidth: isSelected ? '2px' : '1px',
                                                borderStyle: 'solid',
                                            }}
                                        >
                                            <Icon className="w-5 h-5" style={{ color }} />
                                        </div>
                                        <span className="text-[10px] font-medium uppercase tracking-wide">
                                            {k.slice(0, 9)}
                                        </span>
                                    </button>
                                );
                            })}

                            {/* Add Custom Kind Button */}
                            {!showCustomKindInput && (
                                <button
                                    type="button"
                                    onClick={() => setShowCustomKindInput(true)}
                                    className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl border-2 border-dashed border-muted hover:border-muted-foreground transition-colors"
                                >
                                    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-muted/50">
                                        <Plus className="w-5 h-5 text-muted-foreground" />
                                    </div>
                                    <span className="text-[10px] font-medium text-muted-foreground">
                                        CUSTOM
                                    </span>
                                </button>
                            )}
                        </div>

                        {/* Custom Kind Input */}
                        {showCustomKindInput && (
                            <div className="flex gap-2">
                                <Input
                                    placeholder="CUSTOM_KIND"
                                    value={customKindInput}
                                    onChange={(e) => setCustomKindInput(e.target.value.toUpperCase())}
                                    className="flex-1 uppercase"
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddCustomKind()}
                                />
                                <Button size="sm" onClick={handleAddCustomKind}>Add</Button>
                                <Button size="sm" variant="ghost" onClick={() => setShowCustomKindInput(false)}>
                                    Cancel
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Divider */}
                    <div className="border-t border-border/50" />

                    {/* Aliases Section */}
                    <div className="space-y-3">
                        <Label className="text-sm text-muted-foreground">
                            Aliases <span className="text-xs">(variations that match this entity)</span>
                        </Label>

                        {/* Alias Chips */}
                        <div className="flex flex-wrap gap-2">
                            {aliases.map((alias) => (
                                <span
                                    key={alias}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm border"
                                    style={{
                                        backgroundColor: getKindBgColor(kind),
                                        borderColor: getKindColor(kind),
                                        color: getKindColor(kind),
                                    }}
                                >
                                    {alias}
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveAlias(alias)}
                                        className="ml-1 hover:opacity-70"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            ))}

                            {/* Add Alias Input */}
                            <div className="inline-flex items-center gap-1">
                                <Input
                                    placeholder="+ Add alias"
                                    value={newAlias}
                                    onChange={(e) => setNewAlias(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddAlias()}
                                    className="h-8 w-28 text-sm"
                                />
                                {newAlias && (
                                    <Button size="sm" variant="ghost" onClick={handleAddAlias}>
                                        <Plus className="w-4 h-4" />
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Auto-Generated Aliases */}
                        <div className="flex flex-wrap gap-4 text-sm">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <Checkbox
                                    checked={autoConfig.lastName}
                                    onCheckedChange={(c) => setAutoConfig({ ...autoConfig, lastName: !!c })}
                                />
                                <span className="text-muted-foreground">Last name</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <Checkbox
                                    checked={autoConfig.firstLast}
                                    onCheckedChange={(c) => setAutoConfig({ ...autoConfig, firstLast: !!c })}
                                />
                                <span className="text-muted-foreground">First+Last</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <Checkbox
                                    checked={autoConfig.initials}
                                    onCheckedChange={(c) => setAutoConfig({ ...autoConfig, initials: !!c })}
                                />
                                <span className="text-muted-foreground">Initials</span>
                            </label>
                        </div>

                        {/* Auto-alias Preview */}
                        {autoAliases.length > 0 && (
                            <div className="text-xs text-muted-foreground">
                                Auto: {autoAliases.map((a, i) => (
                                    <span key={a} className="text-foreground/70">
                                        {a}{i < autoAliases.length - 1 ? ', ' : ''}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Preview */}
                    {label.trim() && (
                        <>
                            <div className="border-t border-border/50" />
                            <div className="space-y-2">
                                <Label className="text-sm text-muted-foreground">Preview</Label>
                                <div
                                    className="rounded-lg p-3 text-sm"
                                    style={{ backgroundColor: 'var(--muted)' }}
                                >
                                    <p className="text-muted-foreground">
                                        The winds whispered of{' '}
                                        <span
                                            className="px-1.5 py-0.5 rounded"
                                            style={{
                                                backgroundColor: getKindBgColor(kind),
                                                color: getKindColor(kind),
                                            }}
                                        >
                                            {label}
                                        </span>
                                        {aliases.length > 0 && (
                                            <>
                                                , known as{' '}
                                                <span
                                                    className="px-1.5 py-0.5 rounded"
                                                    style={{
                                                        backgroundColor: getKindBgColor(kind),
                                                        color: getKindColor(kind),
                                                    }}
                                                >
                                                    {aliases[0]}
                                                </span>
                                            </>
                                        )}
                                        .
                                    </p>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!label.trim()}
                        style={{
                            backgroundColor: getKindColor(kind),
                        }}
                    >
                        {isEditing ? 'Save Changes' : 'Create Entity'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
