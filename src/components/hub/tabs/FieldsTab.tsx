// src/components/hub/tabs/FieldsTab.tsx
// Fields tab - manage field type definitions for entities
// TODO: Full port from legacy FieldsTab.tsx when ready

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Settings2, Trash2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface FieldDef {
    id: string;
    name: string;
    fieldType: string;
    label: string;
    description?: string;
}

// Stub data from FieldSchemaRegistry
const STUB_FIELDS: FieldDef[] = [
    { id: 'sys:text', name: 'Text', fieldType: 'text', label: 'Text Field' },
    { id: 'sys:number', name: 'Number', fieldType: 'number', label: 'Number Field' },
    { id: 'sys:slider-percent', name: 'Percentage Slider', fieldType: 'slider', label: 'Percentage' },
    { id: 'sys:rating-5star', name: '5-Star Rating', fieldType: 'rating', label: 'Rating' },
    { id: 'sys:tags', name: 'Tags', fieldType: 'tags', label: 'Tag Input' },
    { id: 'sys:entity-link', name: 'Entity Link', fieldType: 'entity-link', label: 'Entity Reference' },
];

export function FieldsTab() {
    const [fields] = useState<FieldDef[]>(STUB_FIELDS);

    return (
        <div className="space-y-6 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold">Field Types</h3>
                    <p className="text-sm text-muted-foreground">
                        Define reusable field types for entity fact sheets.
                    </p>
                </div>
                <Button size="sm" onClick={() => console.warn('[FieldsTab] Create field - STUB')}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Field Type
                </Button>
            </div>

            <ScrollArea className="h-[400px]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {fields.map((field) => (
                        <Card key={field.id} className="bg-card">
                            <CardHeader className="py-3 px-4">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                                        <Settings2 className="h-4 w-4 text-muted-foreground" />
                                        {field.name}
                                    </CardTitle>
                                    <Badge variant="outline" className="text-xs">
                                        {field.fieldType}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="py-2 px-4">
                                <p className="text-xs text-muted-foreground">{field.label}</p>
                                {field.id.startsWith('sys:') && (
                                    <Badge variant="secondary" className="text-xs mt-2">System</Badge>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </ScrollArea>

            <div className="bg-muted p-4 rounded-lg text-sm text-muted-foreground">
                <p>
                    <strong>System fields</strong> are built-in and cannot be deleted.
                    Custom fields can be created for specialized entity types.
                </p>
            </div>
        </div>
    );
}

export default FieldsTab;
