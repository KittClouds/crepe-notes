import { useMemo } from 'react';
import { useCozoContext } from '../contexts/CozoContext';
import type { EntityKind } from '@/lib/types/entityTypes';

export function useCozoRegistry() {
    return useCozoContext();
}

export function useEntities(kind?: EntityKind) {
    const { entities } = useCozoContext();

    return useMemo(() => {
        if (!kind) return entities;
        return entities.filter(e => e.kind === kind);
    }, [entities, kind]);
}

export function useEntityById(id: string) {
    const { entities } = useCozoContext();
    return useMemo(() => entities.find(e => e.id === id) || null, [entities, id]);
}

export function useEntityByLabel(label: string) {
    const { entities } = useCozoContext();
    return useMemo(() => {
        const norm = label.toLowerCase().trim();
        return entities.find(e =>
            e.label.toLowerCase() === norm ||
            e.aliases.some(a => a.toLowerCase() === norm)
        ) || null;
    }, [entities, label]);
}
