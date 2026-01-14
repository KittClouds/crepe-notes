// src/components/hub/tabs/NetworksTab.tsx
// Networks tab - manage entity networks (family trees, factions, etc.)
// TODO: Full rework needed - keeping as minimal stub for now

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Network, Users } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { NetworkDef } from '../types';

// Stub data for demonstration
const STUB_NETWORKS: NetworkDef[] = [
    { id: '1', name: 'Straw Hat Crew', schemaId: 'crew', description: 'Main protagonist crew' },
    { id: '2', name: 'World Government', schemaId: 'faction', description: 'Antagonist organization' },
    { id: '3', name: 'Worst Generation', schemaId: 'group', description: 'Pirate alliance' },
];

export function NetworksTab() {
    const [networks] = useState<NetworkDef[]>(STUB_NETWORKS);

    return (
        <div className="space-y-6 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold">Networks</h3>
                    <p className="text-sm text-muted-foreground">
                        Manage entity networks like family trees, factions, and organizations.
                    </p>
                </div>
                <Button size="sm" onClick={() => console.warn('[NetworksTab] Create network - STUB')}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Network
                </Button>
            </div>

            <ScrollArea className="h-[400px]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {networks.map((network) => (
                        <Card key={network.id} className="bg-card hover:bg-muted/50 transition-colors cursor-pointer">
                            <CardHeader className="py-3 px-4">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    <Network className="h-4 w-4 text-muted-foreground" />
                                    {network.name}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="py-2 px-4">
                                <p className="text-xs text-muted-foreground mb-2">{network.description}</p>
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs">
                                        {network.schemaId}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                        <Users className="h-3 w-3" />
                                        0 members
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </ScrollArea>

            <div className="bg-muted p-4 rounded-lg text-sm text-muted-foreground">
                <p>
                    <strong>Rework Needed:</strong> Networks will be integrated with CozoDB graph queries
                    for relationship traversal and visualization.
                </p>
            </div>
        </div>
    );
}

export default NetworksTab;
