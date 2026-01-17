/// <reference lib="webworker" />

/**
 * KittCore WASM Worker
 * 
 * Document Scanner + ResoRank Search Engine + Embeddings
 * 
 * Wired up to real WASM module!
 */

import init, { ScanConductor, InitOutput } from "../../rust/kittcore/pkg/kittcore.js";
import wasmUrl from "../../rust/kittcore/pkg/kittcore_bg.wasm?url";

// Types for messages
type KittCoreMessage =
    | { type: 'INIT' }
    | { type: 'GREET'; payload: { name: string } }
    | { type: 'VERSION' }
    | { type: 'SCAN'; payload: { content: string; entities: EntityInput[] } }
    | { type: 'HYDRATE_ENTITIES'; payload: { entities: EntityDefinition[] } }
    | { type: 'SCAN_IMPLICIT'; payload: { content: string } }
    | { type: 'EXTRACT_RELATIONS'; payload: { content: string; entities: EntitySpan[] } }
    | { type: 'EXTRACT_TRIPLES'; payload: { content: string } }
    | { type: 'SCAN_TEMPORAL'; payload: { content: string } }
    | { type: 'EMBED_TEXT'; payload: { text: string } }
    | { type: 'SEARCH'; payload: { query: string; k: number } }
    | { type: 'GET_STATUS' };

interface EntityInput {
    label: string;
    start: number;
    end: number;
}

interface EntityDefinition {
    id: string;
    label: string;
    kind: string;
    aliases?: string[];
}

interface EntitySpan {
    id: string;
    label: string;
    start: number;
    end: number;
}

type ResponseMessage =
    | { type: 'INIT_COMPLETE'; payload: { version: string } }
    | { type: 'GREET_RESULT'; payload: { message: string } }
    | { type: 'VERSION_RESULT'; payload: { version: string; timestamp: string } }
    | { type: 'SCAN_RESULT'; payload: any }
    | { type: 'ENTITIES_HYDRATED'; payload: { count: number } }
    | { type: 'IMPLICIT_RESULT'; payload: { mentions: any[] } }
    | { type: 'RELATIONS_RESULT'; payload: { relations: any[] } }
    | { type: 'TRIPLES_RESULT'; payload: { triples: any[] } }
    | { type: 'TEMPORAL_RESULT'; payload: { mentions: any[] } }
    | { type: 'EMBED_RESULT'; payload: { embedding: Float32Array } }
    | { type: 'SEARCH_RESULT'; payload: { results: any[] } }
    | { type: 'STATUS'; payload: WorkerStatus }
    | { type: 'ERROR'; payload: { message: string } };

interface WorkerStatus {
    initialized: boolean;
    wasmLoaded: boolean;
    entitiesHydrated: number;
    version: string;
}

// Worker state
let initialized = false;
let entitiesHydrated = 0;
// We'll use the ScanConductor from WASM
let conductor: ScanConductor | null = null;
const VERSION = '0.1.0-wasm';

// Message handler
self.onmessage = async (e: MessageEvent<KittCoreMessage>) => {
    const msg = e.data;
    // console.log('[KittCoreWorker] Received:', msg.type);

    try {
        switch (msg.type) {
            case 'INIT':
                if (!initialized) {
                    // Initialize WASM
                    await init(wasmUrl);

                    // Create Conductor
                    conductor = new ScanConductor();
                    conductor.init();

                    initialized = true;
                    console.log('[KittCoreWorker] WASM Initialized & Conductor Ready');
                }
                self.postMessage({
                    type: 'INIT_COMPLETE',
                    payload: { version: VERSION }
                } as ResponseMessage);
                break;

            case 'GREET':
                const message = `Hello, ${msg.payload.name}! KittCore WASM is ready.`;
                self.postMessage({
                    type: 'GREET_RESULT',
                    payload: { message }
                } as ResponseMessage);
                break;

            case 'VERSION':
                self.postMessage({
                    type: 'VERSION_RESULT',
                    payload: { version: VERSION, timestamp: new Date().toISOString() }
                } as ResponseMessage);
                break;

            case 'HYDRATE_ENTITIES':
                if (!conductor) throw new Error('Not initialized');
                // The WASM expects { id, label, kind, aliases } which matches EntityDefinition
                conductor.hydrateEntities(msg.payload.entities);
                entitiesHydrated = msg.payload.entities.length;
                self.postMessage({
                    type: 'ENTITIES_HYDRATED',
                    payload: { count: entitiesHydrated }
                } as ResponseMessage);
                break;

            case 'SCAN':
                if (!conductor) throw new Error('Not initialized');
                const result = conductor.scan(msg.payload.content, msg.payload.entities);
                self.postMessage({
                    type: 'SCAN_RESULT',
                    payload: result
                } as ResponseMessage);
                break;

            // For specialized scans, we can extract from the full result or use other classes if exposed
            // But ScanConductor is the unified entry point.
            // If explicit separate scans are needed, we might need to expose them on Conductor or use Cortex directly.
            // For now, we'll try to use Conductor's scan and pick parts, or implement specialized methods in Rust later.
            // Actually, for phase 1b, let's just use the full scan result if permissible, 
            // or return empty for now if Conductor doesn't support granular calls yet.
            // Looking at d.ts, ScanConductor has scanForce.

            case 'SCAN_IMPLICIT':
                if (!conductor) throw new Error('Not initialized');
                // We'll do a full scan and filter client-side or expected return
                // But efficient way is to expose specialized methods. 
                // For now, let's use Conductor scan.
                const implicitResult = conductor.scanForce(msg.payload.content, []); // No explicit spans provided
                self.postMessage({
                    type: 'IMPLICIT_RESULT',
                    payload: { mentions: implicitResult.implicit_mentions || [] }
                } as ResponseMessage);
                break;

            case 'EXTRACT_RELATIONS':
                if (!conductor) throw new Error('Not initialized');
                const relResult = conductor.scanForce(msg.payload.content, msg.payload.entities);
                self.postMessage({
                    type: 'RELATIONS_RESULT',
                    payload: { relations: relResult.relations || [] }
                } as ResponseMessage);
                break;

            case 'EXTRACT_TRIPLES':
                if (!conductor) throw new Error('Not initialized');
                const triResult = conductor.scanForce(msg.payload.content, []);
                self.postMessage({
                    type: 'TRIPLES_RESULT',
                    payload: { triples: triResult.triples || [] }
                } as ResponseMessage);
                break;

            case 'SCAN_TEMPORAL':
                if (!conductor) throw new Error('Not initialized');
                const tempResult = conductor.scanForce(msg.payload.content, []);
                self.postMessage({
                    type: 'TEMPORAL_RESULT',
                    payload: { mentions: tempResult.temporal_mentions || [] }
                } as ResponseMessage);
                break;

            case 'EMBED_TEXT':
                // Embeddings are gated and currently OFF.
                console.warn('[KittCoreWorker] Embeddings not enabled in WASM build');
                self.postMessage({
                    type: 'EMBED_RESULT',
                    payload: { embedding: new Float32Array(0) }
                } as ResponseMessage);
                break;

            case 'SEARCH':
                // RAG is gated and currently OFF.
                console.warn('[KittCoreWorker] Search not enabled in WASM build');
                self.postMessage({
                    type: 'SEARCH_RESULT',
                    payload: { results: [] }
                } as ResponseMessage);
                break;

            case 'GET_STATUS':
                const state = conductor ? conductor.stateName() : "Unitialized";
                self.postMessage({
                    type: 'STATUS',
                    payload: {
                        initialized,
                        wasmLoaded: initialized,
                        entitiesHydrated,
                        version: `${VERSION} (${state})`,
                    }
                } as ResponseMessage);
                break;
        }
    } catch (e) {
        console.error('[KittCoreWorker] Error:', e);
        self.postMessage({
            type: 'ERROR',
            payload: { message: e instanceof Error ? e.message : String(e) }
        } as ResponseMessage);
    }
};

console.log('[KittCoreWorker] Worker script loaded (WASM MODE)');
