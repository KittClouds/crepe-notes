import React, { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { entityRegistry, type RegisteredEntity, type EntityStats } from '../graph/adapters/EntityRegistryAdapter';
import type { EntityKind } from '@/lib/types/entityTypes';

interface CozoContextType {
    isReady: boolean;
    entities: RegisteredEntity[];
    stats: EntityStats | null;
    registerEntity: (label: string, kind: EntityKind, noteId: string, options?: any) => Promise<void>;
    updateEntity: (id: string, updates: any) => Promise<boolean>;
    deleteEntity: (id: string) => Promise<boolean>;
    refresh: () => void;
    clear: () => Promise<void>;
}

const CozoContext = createContext<CozoContextType | null>(null);

export function CozoProvider({ children }: { children: ReactNode }) {
    const [isReady, setIsReady] = useState(false);
    const [entities, setEntities] = useState<RegisteredEntity[]>([]);
    const [stats, setStats] = useState<EntityStats | null>(null);
    const [refreshToken, setRefreshToken] = useState(0);

    const initRegistry = useCallback(async () => {
        try {
            await entityRegistry.init();
            setIsReady(true);
            refresh();
        } catch (err) {
            console.error('Failed to initialize Cozo registry:', err);
        }
    }, []);

    useEffect(() => {
        initRegistry();
    }, [initRegistry]);

    const refresh = useCallback(() => {
        if (!entityRegistry.isInitialized()) return;
        const all = entityRegistry.getAllEntities();
        setEntities(all);
        entityRegistry.getStats().then(setStats).catch(console.error);
    }, []);

    useEffect(() => {
        if (isReady) {
            refresh();
        }
    }, [isReady, refreshToken, refresh]);

    const registerEntity = async (label: string, kind: EntityKind, noteId: string, options?: any) => {
        await entityRegistry.registerEntity(label, kind, noteId, options);
        setRefreshToken(prev => prev + 1);
    };

    const updateEntity = async (id: string, updates: any) => {
        const success = await entityRegistry.updateEntity(id, updates);
        if (success) setRefreshToken(prev => prev + 1);
        return success;
    };

    const deleteEntity = async (id: string) => {
        const success = await entityRegistry.deleteEntity(id);
        if (success) setRefreshToken(prev => prev + 1);
        return success;
    };

    const clear = async () => {
        await entityRegistry.clear();
        setRefreshToken(prev => prev + 1);
    };

    return (
        <CozoContext.Provider value={{
            isReady,
            entities,
            stats,
            registerEntity,
            updateEntity,
            deleteEntity,
            refresh: () => setRefreshToken(prev => prev + 1),
            clear
        }}>
            {children}
        </CozoContext.Provider>
    );
}

export function useCozoContext() {
    const context = useContext(CozoContext);
    if (!context) {
        throw new Error('useCozoContext must be used within a CozoProvider');
    }
    return context;
}
