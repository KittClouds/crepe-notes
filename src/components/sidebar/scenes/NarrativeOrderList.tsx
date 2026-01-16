import React, { useMemo } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SceneCard } from './SceneCard';
import { SceneCardData } from '@/hooks/useNarrativeDashboard';

interface NarrativeOrderListProps {
    scenes: SceneCardData[];
    onReorder: (newOrderIds: string[]) => void;
}

export function NarrativeOrderList({ scenes, onReorder }: NarrativeOrderListProps) {
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const items = useMemo(() => scenes.map(s => s.id), [scenes]);

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = items.indexOf(active.id as string);
            const newIndex = items.indexOf(over.id as string);

            // Generate new order array based on CURRENT visible items
            // Note: This logic assumes 'scenes' prop is the full list or we handle partial updates upstream
            const newOrder = arrayMove(items, oldIndex, newIndex);
            onReorder(newOrder);
        }
    }

    if (scenes.length === 0) {
        return (
            <div className="p-8 text-center text-muted-foreground text-sm italic">
                No scenes found. Try creating a Scene folder or changing the scope.
            </div>
        );
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
        >
            <SortableContext
                items={items}
                strategy={verticalListSortingStrategy}
            >
                <div className="px-2 py-2 space-y-2">
                    {scenes.map((scene) => (
                        <SceneCard
                            key={scene.id}
                            id={scene.id}
                            title={scene.title}
                            label={scene.title}
                            synopsis={scene.synopsis}
                            startTime={scene.timing}
                            // Mock location for now
                            location={undefined}
                        />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
}
