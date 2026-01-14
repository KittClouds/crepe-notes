// src/hooks/useUnifiedEntityAttributes.ts
// Unified Entity Attributes Hook - STUB
// Provides interface for entity attributes until fully wired

import { useState, useCallback, useMemo, useEffect } from 'react';
import { entityAttributeStore } from '@/lib/store/entityAttributeStore';
import type { EntityAttribute, MetaCard, FieldType } from '@/lib/types/entityAttributes';
import type { ParsedEntity } from '@/types/factSheetTypes';

export function useUnifiedEntityAttributes(entity: ParsedEntity | null | undefined) {
    const [, forceUpdate] = useState({});

    const entityId = entity?.noteId || entity?.label || null;

    // Subscribe to store changes
    useEffect(() => {
        const unsub = entityAttributeStore.subscribe(() => {
            forceUpdate({});
        });
        return unsub;
    }, []);

    // Get attributes from store
    const attributes: EntityAttribute[] = useMemo(() => {
        if (!entityId) return [];
        return entityAttributeStore.getAttributes(entityId);
    }, [entityId]);

    // Get meta cards from store
    const metaCards: MetaCard[] = useMemo(() => {
        if (!entityId) return [];
        return entityAttributeStore.getMetaCards(entityId);
    }, [entityId]);

    const getField = useCallback((fieldName: string) => {
        if (!entityId) return null;
        return entityAttributeStore.getAttribute(entityId, fieldName);
    }, [entityId]);

    const setField = useCallback((fieldName: string, value: any, fieldType?: FieldType) => {
        if (!entityId) return;
        entityAttributeStore.setAttribute({
            entityId,
            fieldName,
            value,
            fieldType
        });
    }, [entityId]);

    const setFields = useCallback(async (attrs: Record<string, any>) => {
        if (!entityId) return;
        entityAttributeStore.setMultipleAttributes({
            entityId,
            attributes: attrs
        });
    }, [entityId]);

    const createCard = useCallback(async (name: string, color?: string, icon?: string) => {
        if (!entityId) return null;
        return entityAttributeStore.createMetaCard({
            ownerId: entityId,
            name,
            color,
            icon,
        });
    }, [entityId]);

    const updateCard = useCallback(async (cardId: string, updates: Partial<Pick<MetaCard, 'name' | 'color' | 'icon' | 'displayOrder' | 'isCollapsed'>>) => {
        entityAttributeStore.updateMetaCard(cardId, updates);
    }, []);

    const deleteCard = useCallback(async (cardId: string) => {
        entityAttributeStore.deleteMetaCard(cardId);
    }, []);

    return {
        attributes,
        metaCards,
        getField,
        setField,
        setFields,
        createCard,
        updateCard,
        deleteCard,
        isLoading: false,
        error: null
    };
}

