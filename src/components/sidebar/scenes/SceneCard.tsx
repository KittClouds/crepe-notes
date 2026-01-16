import React from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GripVertical, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SceneCardProps {
    id: string;
    title: string;
    label: string;
    synopsis?: string;
    startTime?: string;
    location?: string;
}

export function SceneCard({ id, title, label, synopsis, startTime, location }: SceneCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 'auto',
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <Card
            ref={setNodeRef}
            style={style}
            className={cn(
                "mb-2 select-none group border-l-4 border-l-transparent hover:border-l-primary/50 transition-colors",
                isDragging && "border-primary shadow-lg"
            )}
        >
            <CardHeader className="p-3 pb-1 flex flex-row items-start space-y-0 gap-2">
                <div
                    {...attributes}
                    {...listeners}
                    className="mt-1 text-muted-foreground/50 hover:text-foreground cursor-grab active:cursor-grabbing"
                >
                    <GripVertical className="h-4 w-4" />
                </div>

                <div className="flex-1 min-w-0">
                    <CardTitle className="text-sm font-medium leading-none truncate">
                        {label || title}
                    </CardTitle>
                    <div className="text-[10px] text-muted-foreground mt-1 font-mono uppercase tracking-wider">
                        SCENE {startTime && `• ${startTime}`}
                    </div>
                </div>
            </CardHeader>

            <CardContent className="p-3 pt-2">
                <div className="text-xs text-muted-foreground line-clamp-3 min-h-[1.5em] bg-muted/20 p-2 rounded-sm italic">
                    {synopsis || "No synopsis available..."}
                </div>
            </CardContent>

            <CardFooter className="p-3 pt-0 flex flex-wrap gap-1">
                {location && (
                    <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-1 text-muted-foreground">
                        <MapPin className="h-2.5 w-2.5" />
                        {location}
                    </Badge>
                )}
                <Badge variant="secondary" className="text-[10px] h-5 px-1.5 opacity-50">
                    +2 Chars
                </Badge>
            </CardFooter>
        </Card>
    );
}
