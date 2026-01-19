/// <reference lib="webworker" />

/**
 * KittCore WASM Worker
 * 
 * Document Scanner + ResoRank Search Engine + Embeddings
 * 
 * Wired up to real WASM module!
 */

import init, { ScanConductor, RustImplicitScanner, InitOutput } from "../../rust/kittcore/pkg/kittcore.js";
import wasmUrl from "../../rust/kittcore/pkg/kittcore_bg.wasm?url";

// NOTE: Cross-doc processing (embeddings, CozoDB) happens on MAIN THREAD
// Workers cannot share in-memory state with main thread.
// The worker just receives ENTITIES_EXTRACTED and forwards to main thread for processing.

// Types for linking config (inline to avoid imports)
interface LinkingConfig {
    stringThreshold: number;
    semanticThreshold: number;
    caseInsensitive: boolean;
    stringWeight: number;
    semanticWeight: number;
}

// Types for messages
type KittCoreMessage =
    | { type: 'INIT' }
    | { type: 'GREET'; payload: { name: string } }
    | { type: 'VERSION' }
    | { type: 'SCAN'; payload: { content: string; entities: EntityInput[]; narrativeId?: string } }
    | { type: 'HYDRATE_ENTITIES'; payload: { entities: EntityDefinition[]; narrativeId?: string } }
    | { type: 'SCAN_IMPLICIT'; payload: { content: string; narrativeId?: string } }
    | { type: 'SCAN_IMPLICIT_RUST'; payload: { content: string } }
    | { type: 'EXTRACT_RELATIONS'; payload: { content: string; entities: EntitySpan[]; narrativeId?: string } }
    | { type: 'EXTRACT_TRIPLES'; payload: { content: string } }
    | { type: 'SCAN_TEMPORAL'; payload: { content: string } }
    | { type: 'EMBED_TEXT'; payload: { text: string } }
    | { type: 'SEARCH'; payload: { query: string; k: number } }
    | { type: 'GET_STATUS' }
    // Cross-doc entity linking
    | { type: 'ENTITIES_EXTRACTED'; payload: { noteId: string; noteTitle: string; entities: ExtractedEntity[] } }
    | { type: 'RUN_LINKING'; payload?: { config?: Partial<LinkingConfig> } }
    | { type: 'GET_CLUSTERS'; payload?: { entityId?: string } };

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
    /** Narrative vault this entity belongs to (for isolation) */
    narrativeId?: string;
}

interface EntitySpan {
    id: string;
    label: string;
    start: number;
    end: number;
}

/** Entity extracted from a note scan - for cross-doc embedding */
interface ExtractedEntity {
    id: string;
    label: string;
    kind: string;
    start: number;
    end: number;
    contextBefore?: string;  // Text before the mention
    contextAfter?: string;   // Text after the mention
}

type ResponseMessage =
    | { type: 'INIT_COMPLETE'; payload: { version: string } }
    | { type: 'GREET_RESULT'; payload: { message: string } }
    | { type: 'VERSION_RESULT'; payload: { version: string; timestamp: string } }
    | { type: 'SCAN_RESULT'; payload: any }
    | { type: 'ENTITIES_HYDRATED'; payload: { count: number } }
    | { type: 'IMPLICIT_RESULT'; payload: { mentions: any[] } }
    | { type: 'IMPLICIT_RUST_RESULT'; payload: { spans: any[] } }
    | { type: 'RELATIONS_RESULT'; payload: { relations: any[] } }
    | { type: 'TRIPLES_RESULT'; payload: { triples: any[] } }
    | { type: 'TEMPORAL_RESULT'; payload: { mentions: any[] } }
    | { type: 'EMBED_RESULT'; payload: { embedding: Float32Array } }
    | { type: 'SEARCH_RESULT'; payload: { results: any[] } }
    | { type: 'STATUS'; payload: WorkerStatus }
    | { type: 'ERROR'; payload: { message: string } }
    // Cross-doc responses
    | { type: 'ENTITIES_PROCESSED'; payload: { noteId: string; embedded: number; cooccurrences: number } }
    | { type: 'LINKING_COMPLETE'; payload: { clusters: any[]; stats: { entities: number; clusters: number; timeMs: number } } }
    | { type: 'CLUSTERS_RESULT'; payload: { clusters: any[] } };

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
let dafsaScanner: RustImplicitScanner | null = null;
const VERSION = '0.1.0-wasm';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build context text for entity embedding.
 * Combines entity metadata with surrounding context from the note.
 */
function buildEntityContext(entity: ExtractedEntity, noteTitle: string): string {
    const parts: string[] = [];

    // Entity identity
    parts.push(`Entity: ${entity.label}`);
    parts.push(`Type: ${entity.kind}`);
    parts.push(`Source: ${noteTitle}`);

    // Surrounding context if available
    if (entity.contextBefore) {
        parts.push(`Before: ${entity.contextBefore}`);
    }
    if (entity.contextAfter) {
        parts.push(`After: ${entity.contextAfter}`);
    }

    return parts.join('\n');
}

// Message handler
self.onmessage = async (e: MessageEvent<KittCoreMessage>) => {
    const msg = e.data;
    // console.log('[KittCoreWorker] Received:', msg.type);

    try {
        switch (msg.type) {
            case 'INIT':
                if (!initialized) {
                    // Initialize WASM (use object param to avoid deprecation warning)
                    await init({ module_or_path: wasmUrl });

                    // Create Conductor
                    conductor = new ScanConductor();
                    conductor.init();

                    // Create DAFSA Scanner (Phase 2 A/B Test)
                    dafsaScanner = new RustImplicitScanner();

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
                // Filter entities by narrative scope if provided
                const filterNarrativeId = msg.payload.narrativeId;
                let entitiesToHydrate = msg.payload.entities;

                if (filterNarrativeId) {
                    // Only hydrate entities from same narrative
                    entitiesToHydrate = msg.payload.entities.filter(
                        e => e.narrativeId === filterNarrativeId
                    );
                    console.log(`[KittCoreWorker] Filtered to ${entitiesToHydrate.length}/${msg.payload.entities.length} entities for narrative ${filterNarrativeId}`);
                } else {
                    // Global context - hydrate only global entities (no narrativeId)
                    entitiesToHydrate = msg.payload.entities.filter(e => !e.narrativeId);
                    console.log(`[KittCoreWorker] Filtered to ${entitiesToHydrate.length}/${msg.payload.entities.length} global entities`);
                }

                conductor.hydrateEntities(entitiesToHydrate);
                if (dafsaScanner) {
                    try {
                        dafsaScanner.hydrate(entitiesToHydrate);
                    } catch (err) {
                        console.error('[KittCoreWorker] DAFSA hydration failed:', err);
                    }
                }
                entitiesHydrated = entitiesToHydrate.length;
                self.postMessage({
                    type: 'ENTITIES_HYDRATED',
                    payload: { count: entitiesHydrated }
                } as ResponseMessage);
                break;

            case 'SCAN':
                if (!conductor) throw new Error('Not initialized');
                console.log(`[KittCoreWorker] SCAN: contentLen=${msg.payload.content?.length}, entities=${msg.payload.entities?.length}`);
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
                    payload: { mentions: implicitResult.implicit || [] }
                } as ResponseMessage);
                break;

            case 'SCAN_IMPLICIT_RUST':
                if (!dafsaScanner) throw new Error('Rust implicit scanner not initialized');
                const rustSpans = dafsaScanner.scan(msg.payload.content);
                self.postMessage({
                    type: 'IMPLICIT_RUST_RESULT',
                    payload: { spans: rustSpans || [] }
                } as ResponseMessage);
                break;

            case 'EXTRACT_RELATIONS':
                if (!conductor) throw new Error('Not initialized');
                const relResult = conductor.scanForce(msg.payload.content, msg.payload.entities);
                self.postMessage({
                    type: 'RELATIONS_RESULT',
                    payload: { relations: relResult.unified_relations || [] }
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
                    payload: { mentions: tempResult.temporal || [] }
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

            // ================================================================
            // Cross-Document Entity Linking
            // 
            // NOTE: These handlers are STUBS. Cross-doc processing (embeddings,
            // CozoDB queries) MUST happen on the MAIN THREAD because:
            // 1. Workers can't share in-memory state with main thread
            // 2. CozoDB WASM instance lives on main thread
            // 3. Transformers.js embedding models live on main thread
            //
            // Flow: Rust scan → worker parses → posts results → MAIN THREAD
            // handles embedding & CozoDB storage via KittCoreService
            // ================================================================

            case 'ENTITIES_EXTRACTED': {
                // Forward entity data back to main thread for processing
                // Main thread will:
                // 1. Build context text
                // 2. Generate embeddings via EmbeddingEngine
                // 3. Store vectors in CozoDB
                // 4. Create co-occurrence edges
                const { noteId, noteTitle, entities } = msg.payload;
                console.log(`[KittCoreWorker] Forwarding ${entities.length} entities for processing (noteId: ${noteId})`);

                // Just acknowledge receipt - actual processing happens on main thread
                self.postMessage({
                    type: 'ENTITIES_PROCESSED',
                    payload: {
                        noteId,
                        embedded: 0,  // Main thread will update
                        cooccurrences: 0,
                        entities,  // Forward entities for main thread to process
                        forwardToMainThread: true
                    }
                } as ResponseMessage);
                break;
            }

            case 'RUN_LINKING': {
                // Linking must happen on main thread (needs CozoDB + embedding access)
                console.log('[KittCoreWorker] RUN_LINKING requested - forwarding to main thread');

                self.postMessage({
                    type: 'LINKING_COMPLETE',
                    payload: {
                        clusters: [],
                        stats: { entities: 0, clusters: 0, timeMs: 0 },
                        forwardToMainThread: true,
                        config: msg.payload?.config || {}
                    }
                } as ResponseMessage);
                break;
            }

            case 'GET_CLUSTERS': {
                // Cluster retrieval must happen on main thread (needs CozoDB)
                console.log('[KittCoreWorker] GET_CLUSTERS requested - forwarding to main thread');

                self.postMessage({
                    type: 'CLUSTERS_RESULT',
                    payload: {
                        clusters: [],
                        forwardToMainThread: true,
                        entityId: msg.payload?.entityId
                    }
                } as ResponseMessage);
                break;
            }
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

