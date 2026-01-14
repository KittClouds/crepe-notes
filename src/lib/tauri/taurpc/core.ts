// src/lib/tauri/taurpc/core.ts
// Core API Stub - Scanner, ResoRank, Conductor
// Will be replaced by auto-generated TauRPC bindings

import { isTauri } from '../index';
import type { HealthStatus, ScanResult, ResoRankResult } from './types';

/**
 * Core API - matches Rust CoreApi trait
 * path = "core"
 */
export const coreApi = {
    async version(): Promise<string> {
        if (isTauri()) {
            // TODO: Use real TauRPC when bindings generated
            // return taurpc.core.version();
        }
        return 'varant v0.1.0 (browser stub)';
    },

    async greet(name: string): Promise<string> {
        if (isTauri()) {
            // TODO: Use real TauRPC
        }
        return `Hello, ${name}! (browser stub)`;
    },

    async health(): Promise<HealthStatus> {
        if (isTauri()) {
            // TODO: Use real TauRPC
        }
        return { ok: true, version: 'varant v0.1.0 (browser stub)' };
    },

    async unifiedScan(text: string, entitiesJson: string): Promise<ScanResult> {
        if (isTauri()) {
            // TODO: const result = await taurpc.core.unified_scan(text, entitiesJson);
            // return JSON.parse(result);
        }
        console.warn('[coreApi.unifiedScan] STUB - Tauri not connected');
        return { entities: [], decorations: [] };
    },

    async hydrateEntities(entitiesJson: string): Promise<string> {
        if (isTauri()) {
            // TODO: return taurpc.core.hydrate_entities(entitiesJson);
        }
        console.warn('[coreApi.hydrateEntities] STUB');
        return JSON.stringify({ hydrated: 0 });
    },

    async extractTriples(text: string): Promise<string> {
        if (isTauri()) {
            // TODO: return taurpc.core.extract_triples(text);
        }
        return JSON.stringify({ triples: [] });
    },

    async scanTemporal(text: string): Promise<string> {
        if (isTauri()) {
            // TODO: return taurpc.core.scan_temporal(text);
        }
        return JSON.stringify({ temporal_spans: [] });
    },

    async scanSyntax(text: string): Promise<string> {
        if (isTauri()) {
            // TODO: return taurpc.core.scan_syntax(text);
        }
        return JSON.stringify({ syntax: [] });
    },

    async extractRelations(text: string, entitiesJson: string): Promise<string> {
        if (isTauri()) {
            // TODO: return taurpc.core.extract_relations(text, entitiesJson);
        }
        return JSON.stringify({ relations: [] });
    },

    // ResoRank
    async resorankSearch(query: string, limit: number): Promise<ResoRankResult[]> {
        if (isTauri()) {
            // TODO: const result = await taurpc.core.resorank_search(query, limit);
            // return JSON.parse(result);
        }
        return [];
    },

    async resorankIndex(docId: string, title: string, content: string): Promise<boolean> {
        if (isTauri()) {
            // TODO: return taurpc.core.resorank_index(docId, title, content);
        }
        return true;
    },

    async resorankClear(): Promise<void> {
        if (isTauri()) {
            // TODO: await taurpc.core.resorank_clear();
        }
    },

    async resorankStats(): Promise<Record<string, unknown>> {
        if (isTauri()) {
            // TODO: const result = await taurpc.core.resorank_stats();
            // return JSON.parse(result);
        }
        return { documents: 0, terms: 0 };
    },

    // Conductor
    async conductorHydrate(entitiesJson: string): Promise<string> {
        if (isTauri()) {
            // TODO: return taurpc.core.conductor_hydrate(entitiesJson);
        }
        return JSON.stringify({ hydrated: 0 });
    },

    async conductorStatus(): Promise<Record<string, unknown>> {
        if (isTauri()) {
            // TODO: const result = await taurpc.core.conductor_status();
            // return JSON.parse(result);
        }
        return { ready: false, entity_count: 0 };
    },

    async conductorReset(): Promise<void> {
        if (isTauri()) {
            // TODO: await taurpc.core.conductor_reset();
        }
    },

    // Scan Worker
    async getDecorationSpans(noteId: string, contentHash: string): Promise<string | null> {
        if (isTauri()) {
            // TODO: return taurpc.core.get_decoration_spans(noteId, contentHash);
        }
        return null;
    },

    async queueNoteScan(noteId: string): Promise<void> {
        if (isTauri()) {
            // TODO: await taurpc.core.queue_note_scan(noteId);
        }
    },

    async scanQueueStatus(): Promise<Record<string, unknown>> {
        if (isTauri()) {
            // TODO: const result = await taurpc.core.scan_queue_status();
            // return JSON.parse(result);
        }
        return { pending: 0, processed: 0 };
    },

    async invalidateAllDecorationSpans(): Promise<number> {
        if (isTauri()) {
            // TODO: return taurpc.core.invalidate_all_decoration_spans();
        }
        return 0;
    },
};
