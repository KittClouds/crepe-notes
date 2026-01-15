// src/components/sidebar/AddEntityDialog.tsx
// Visual dialog for adding entities without parsing syntax

import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { ENTITY_KINDS, ENTITY_ICONS, type EntityKind } from '@/lib/types/entityTypes';
import { getEntityColor, getEntityBgColor } from '@/lib/store/entityColorStore';
import { Users } from 'lucide-react';

interface AddEntityDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAdd: (label: string, kind: EntityKind) => void;
}

export function AddEntityDialog({ open, onOpenChange, onAdd }: AddEntityDialogProps) {
    const [selectedKind, setSelectedKind] = useState<EntityKind>('CHARACTER');
    const [entityName, setEntityName] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (entityName.trim() && selectedKind) {
            onAdd(entityName.trim(), selectedKind);
            setEntityName('');
        }
    };

    const handleOpenChange = (isOpen: boolean) => {
        if (!isOpen) {
            setEntityName('');
        }
        onOpenChange(isOpen);
    };

    const SelectedIcon = ENTITY_ICONS[selectedKind] || Users;
    const selectedColor = getEntityColor(selectedKind);
    const selectedBgColor = getEntityBgColor(selectedKind, 0.15);

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle>Add Entity</DialogTitle>
                    <DialogDescription>
                        Register a new entity without any special syntax.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    {/* Entity Type Selector */}
                    <div className="space-y-2">
                        <Label>Entity Type</Label>
                        <Select
                            value={selectedKind}
                            onValueChange={(v) => setSelectedKind(v as EntityKind)}
                        >
                            <SelectTrigger className="h-12">
                                <SelectValue>
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-8 h-8 rounded-lg flex items-center justify-center"
                                            style={{ backgroundColor: selectedBgColor }}
                                        >
                                            <SelectedIcon className="w-4 h-4" style={{ color: selectedColor }} />
                                        </div>
                                        <span style={{ color: selectedColor }}>{selectedKind}</span>
                                    </div>
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                {ENTITY_KINDS.map((kind) => {
                                    const Icon = ENTITY_ICONS[kind] || Users;
                                    const color = getEntityColor(kind);
                                    const bgColor = getEntityBgColor(kind, 0.15);
                                    return (
                                        <SelectItem key={kind} value={kind}>
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="w-6 h-6 rounded-md flex items-center justify-center"
                                                    style={{ backgroundColor: bgColor }}
                                                >
                                                    <Icon className="w-3.5 h-3.5" style={{ color }} />
                                                </div>
                                                <span style={{ color }}>{kind}</span>
                                            </div>
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Entity Name */}
                    <div className="space-y-2">
                        <Label htmlFor="entity-name">Name</Label>
                        <Input
                            id="entity-name"
                            placeholder="e.g. Sanji, Winterfell, Excalibur..."
                            value={entityName}
                            onChange={(e) => setEntityName(e.target.value)}
                            className="h-11"
                            autoFocus
                        />
                        <p className="text-xs text-muted-foreground">
                            Just type the name. No brackets or syntax needed.
                        </p>
                    </div>

                    {/* Preview */}
                    {entityName.trim() && (
                        <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                            <p className="text-xs text-muted-foreground mb-2">Preview:</p>
                            <div className="flex items-center gap-2">
                                <div
                                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                                    style={{ backgroundColor: selectedBgColor }}
                                >
                                    <SelectedIcon className="w-4 h-4" style={{ color: selectedColor }} />
                                </div>
                                <div>
                                    <p className="font-medium" style={{ color: selectedColor }}>
                                        {entityName.trim()}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">{selectedKind}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </form>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!entityName.trim()}
                    >
                        Add Entity
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
