// src/lib/nebuladb/hooks.ts
// React hooks for NebulaDB reactive queries
// Replaces dexie-react-hooks useLiveQuery with NebulaDB subscribe()

import { useState, useEffect, useMemo } from 'react';
import { Collection } from './core';
import type { Query, Document } from './types';
import { notes, decorations, entities, edges, mentions } from './db';

// ============================================================================
// CORE HOOK
// ============================================================================

/**
 * Generic reactive query hook
 * Subscribes to collection changes and re-renders on updates
 */
export function useNebulaQuery<T extends Document = Document>(
    collection: Collection,
    query: Query,
    deps: any[] = []
): T[] {
    const [data, setData] = useState<T[]>([]);

    // Memoize query to avoid re-subscribing on every render
    const queryStr = useMemo(() => JSON.stringify(query), deps);

    useEffect(() => {
        const parsedQuery = JSON.parse(queryStr);
        const unsub = collection.subscribe(parsedQuery, (docs) => {
            setData(docs as T[]);
        });
        return unsub;
    }, [collection, queryStr]);

    return data;
}

/**
 * Single document hook (by ID)
 */
export function useNebulaDoc<T extends Document = Document>(
    collection: Collection,
    id: string | null
): T | undefined {
    const [doc, setDoc] = useState<T | undefined>(undefined);

    useEffect(() => {
        if (!id) {
            setDoc(undefined);
            return;
        }

        // Initial fetch
        collection.findOne({ id }).then((d) => setDoc(d as T | undefined));

        // Subscribe for updates
        const unsub = collection.subscribe({ id }, (docs) => {
            setDoc(docs[0] as T | undefined);
        });

        return unsub;
    }, [collection, id]);

    return doc;
}

// ============================================================================
// NOTE HOOKS
// ============================================================================

export interface NebulaNote {
    id: string;
    folderId: string | null;
    title: string;
    docJson: string;
    markdownContent: string;
    entityKind?: string;
    entityLabel?: string;
    isEntity?: number;
    status: 'active' | 'deleted';
    updatedAt: number;
    rev: number;
}

/**
 * Get a single note by ID (reactive)
 */
export function useNebulaNote(noteId: string | null) {
    return useNebulaDoc<NebulaNote>(notes, noteId);
}

/**
 * Get all active notes (reactive)
 */
export function useNebulaNotes() {
    return useNebulaQuery<NebulaNote>(notes, { status: 'active' });
}

/**
 * Get notes in a folder (reactive)
 */
export function usNebulaNotesByFolder(folderId: string | null) {
    return useNebulaQuery<NebulaNote>(
        notes,
        { folderId: folderId ?? '', status: 'active' },
        [folderId]
    );
}

// ============================================================================
// DECORATION HOOKS
// ============================================================================

export interface NebulaDecoration {
    id: string;
    noteId: string;
    type: string;
    start: number;
    end: number;
    payload: string;
    updatedAt: number;
    rev: number;
}

/**
 * Get decorations for a note (reactive)
 */
export function useNebulaDecorations(noteId: string | null) {
    return useNebulaQuery<NebulaDecoration>(
        decorations,
        noteId ? { noteId } : { noteId: '__never__' },
        [noteId]
    );
}

// ============================================================================
// ENTITY HOOKS
// ============================================================================

export interface NebulaEntity {
    id: string;
    scopeId: string;
    label: string;
    kind: string;
    aliases: string[];
    status: 'active' | 'deleted';
    updatedAt: number;
    rev: number;
}

/**
 * Get all active entities (reactive)
 */
export function useNebulaEntities() {
    return useNebulaQuery<NebulaEntity>(entities, { status: 'active' });
}

/**
 * Get entities by kind (reactive)
 */
export function useNebulaEntitiesByKind(kind: string) {
    return useNebulaQuery<NebulaEntity>(
        entities,
        { kind, status: 'active' },
        [kind]
    );
}

// ============================================================================
// EDGE HOOKS
// ============================================================================

export interface NebulaEdge {
    id: string;
    scopeId: string;
    headId: string;
    tailId: string;
    relType: string;
    evidenceNoteId?: string;
    updatedAt: number;
    rev: number;
}

/**
 * Get edges for an entity (reactive)
 * Note: $or not implemented in simple match, so we do two queries
 */
export function useNebulaEdges(entityId: string | null) {
    const outgoing = useNebulaQuery<NebulaEdge>(
        edges,
        entityId ? { headId: entityId } : { headId: '__never__' },
        [entityId]
    );
    const incoming = useNebulaQuery<NebulaEdge>(
        edges,
        entityId ? { tailId: entityId } : { tailId: '__never__' },
        [entityId]
    );

    // Dedupe by id
    const combined = useMemo(() => {
        const map = new Map<string, NebulaEdge>();
        outgoing.forEach(e => map.set(e.id, e));
        incoming.forEach(e => map.set(e.id, e));
        return Array.from(map.values());
    }, [outgoing, incoming]);

    return combined;
}

// ============================================================================
// MENTION HOOKS
// ============================================================================

export interface NebulaMention {
    id: string;
    noteId: string;
    entityId: string;
    start: number;
    end: number;
    updatedAt: number;
    rev: number;
}

/**
 * Get mentions in a note (reactive)
 */
export function usNebulaMentions(noteId: string | null) {
    return useNebulaQuery<NebulaMention>(
        mentions,
        noteId ? { noteId } : { noteId: '__never__' },
        [noteId]
    );
}
