/// <reference lib="webworker" />

/**
 * KittCore WASM Worker
 * 
 * Document Scanner + ResoRank Search Engine + Embeddings
 * 
 * Wired up to real WASM module!
 */

// Imports from pkg
import init, {
    ScanConductor,
    RustImplicitScanner,
    RealityCortex,
    InitOutput,
    cozo_save_to_opfs,
    cozo_load_from_opfs,
    // Registry API
    registry_upsert_entity,
    registry_get_entity_by_id,
    registry_find_entity_by_label,
    registry_get_all_entities,
    registry_delete_entity,
    registry_upsert_relationship,
    registry_get_relationships_for_entity,
    registry_get_all_relationships,
    registry_delete_relationship,
    registry_get_stats,
    // Calendar API
    calendar_get_definition,
    calendar_save_definition,
    calendar_get_all_events,
    calendar_create_event,
    calendar_delete_event,
    calendar_get_all_periods,
    calendar_create_period,
    calendar_delete_period
} from "../rust/kittcore/pkg/kittcore.js";


// @ts-ignore - Vite handles this
import wasmUrl from "../rust/kittcore/pkg/kittcore_bg.wasm?url";
import { SharedMemoryManager, WasmExports } from "../lib/wasm-shared";

// =============================================================================
// Type Definitions (duplicated from kittcore/index.ts for worker isolation)
// =============================================================================

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

interface ExtractedEntity {
    id: string;
    label: string;
    kind: string;
    contextBefore?: string;
    contextAfter?: string;
}

interface LinkingConfig {
    stringThreshold: number;
    semanticThreshold: number;
    caseInsensitive: boolean;
    stringWeight: number;
    semanticWeight: number;
}

interface ResponseMessage {
    type: string;
    payload?: any;
    error?: string;
}

// =============================================================================
// Message Types
// =============================================================================

type KittCoreMessage =
    | { type: 'INIT' }
    | { type: 'GREET'; payload: { name: string } }
    | { type: 'VERSION' }
    | { type: 'SCAN'; payload: { content: string; entities: EntityInput[]; narrativeId?: string } }
    | { type: 'HYDRATE_ENTITIES'; payload: { entities: EntityDefinition[]; narrativeId?: string } }
    | { type: 'SCAN_IMPLICIT'; payload: { content: string; narrativeId?: string } }
    | { type: 'SCAN_IMPLICIT_RUST'; payload: { content: string; narrativeId?: string } }
    | { type: 'EXTRACT_RELATIONS'; payload: { content: string; entities: EntitySpan[]; narrativeId?: string } }
    | { type: 'EXTRACT_TRIPLES'; payload: { content: string } }
    | { type: 'SCAN_TEMPORAL'; payload: { content: string } }
    | { type: 'SCAN_DISCOVERY'; payload: { content: string } }
    | { type: 'EMBED_TEXT'; payload: { text: string } }
    | { type: 'SEARCH'; payload: { query: string; k: number } }
    | { type: 'GET_STATUS' }
    | { type: 'COMPUTE_SMART_CONTEXT'; payload: { focusEntities: string[] } }
    // CozoDB messages
    | { type: 'INIT_DB'; payload?: { name?: string } }
    | { type: 'COZO_QUERY'; payload: { query: string } }
    | { type: 'COZO_UPSERT_NODE'; payload: { id: string; label: string; kind: string } }
    | { type: 'COZO_UPSERT_EDGE'; payload: { source: string; target: string; relation: string } }
    | { type: 'COZO_UPSERT_RELATIONSHIP'; payload: { id: string; source: string; target: string; type: string; confidence: number; bidirectional: boolean } }
    | { type: 'COZO_EXPORT' }
    | { type: 'COZO_IMPORT'; payload: { data: string } }
    | { type: 'COZO_STATS' }
    // OPFS Persistence
    | { type: 'COZO_SAVE_TO_OPFS' }
    | { type: 'COZO_LOAD_FROM_OPFS' }
    // Sync to Nebula
    | { type: 'SYNC_TO_NEBULA' }
    // Registry API (SmartGraphRegistry Parity)
    | { type: 'REGISTRY_UPSERT_ENTITY'; payload: { id: string; label: string; kind: string; props: string } }
    | { type: 'REGISTRY_GET_ENTITY_BY_ID'; payload: { id: string } }
    | { type: 'REGISTRY_FIND_ENTITY_BY_LABEL'; payload: { label: string } }
    | { type: 'REGISTRY_GET_ALL_ENTITIES' }
    | { type: 'REGISTRY_DELETE_ENTITY'; payload: { id: string } }
    | { type: 'REGISTRY_UPSERT_RELATIONSHIP'; payload: { id: string; sourceId: string; targetId: string; relType: string; confidence: number; bidirectional: boolean } }
    | { type: 'REGISTRY_GET_RELATIONSHIPS_FOR_ENTITY'; payload: { entityId: string } }
    | { type: 'REGISTRY_GET_ALL_RELATIONSHIPS' }
    | { type: 'REGISTRY_DELETE_RELATIONSHIP'; payload: { id: string } }
    | { type: 'REGISTRY_GET_STATS' }

    // Legacy SQLite (disabled)
    | { type: 'INIT_SCHEMA' }


    | { type: 'DB_EXEC'; payload: { sql: string } }
    | { type: 'SAVE_NOTE'; payload: { note: any } }
    // Cross-doc entity linking
    | { type: 'ENTITIES_EXTRACTED'; payload: { noteId: string; noteTitle: string; entities: ExtractedEntity[] } }
    | { type: 'RUN_LINKING'; payload?: { config?: Partial<LinkingConfig> } }
    | { type: 'GET_CLUSTERS'; payload?: { entityId?: string } }
    // Calendar API
    | { type: 'CALENDAR_GET_DEFINITION'; payload: { worldId: string } }
    | { type: 'CALENDAR_SAVE_DEFINITION'; payload: { definition: string } }
    | { type: 'CALENDAR_GET_ALL_EVENTS'; payload: { calendarId: string } }
    | { type: 'CALENDAR_CREATE_EVENT'; payload: { event: string } }
    | { type: 'CALENDAR_DELETE_EVENT'; payload: { id: string } }
    | { type: 'CALENDAR_GET_ALL_PERIODS'; payload: { calendarId: string } }
    | { type: 'CALENDAR_CREATE_PERIOD'; payload: { period: string } }
    | { type: 'CALENDAR_DELETE_PERIOD'; payload: { id: string } };


// Shared state
let conductor: ScanConductor | null = null;
let dafsaScanner: RustImplicitScanner | null = null;
let realityCortex: RealityCortex | null = null;
// let db: WasmDatabase | null = null; // NEW: SQLite DB (Disabled)
let sharedScanner: SharedMemoryManager | null = null;
let initialized = false;
let entitiesHydrated = 0;
const VERSION = '0.1.0';

// Debounced OPFS save
let opfsSaveTimeout: ReturnType<typeof setTimeout> | null = null;
const OPFS_SAVE_DELAY_MS = 2000;

function scheduleDebouncedSave() {
    if (opfsSaveTimeout) {
        clearTimeout(opfsSaveTimeout);
    }
    opfsSaveTimeout = setTimeout(async () => {
        try {
            await cozo_save_to_opfs();
            console.log('[KittCoreWorker] Auto-saved to OPFS');
        } catch (e) {
            console.warn('[KittCoreWorker] Auto-save failed:', e);
        }
        opfsSaveTimeout = null;
    }, OPFS_SAVE_DELAY_MS);
}

// ... (ResponseMessage stays same)


self.onmessage = async (e: MessageEvent) => {
    const msg = e.data as KittCoreMessage;

    try {
        switch (msg.type) {
            case 'INIT':
                // ... (existing init code)
                if (initialized) {
                    self.postMessage({ type: 'INIT_RESULT', payload: { version: VERSION } } as ResponseMessage);
                    return;
                }
                console.log('[KittCoreWorker] Initialize requested');
                const output = await init({ module_or_path: wasmUrl });
                conductor = new ScanConductor();
                dafsaScanner = new RustImplicitScanner();
                realityCortex = new RealityCortex();
                sharedScanner = new SharedMemoryManager(output);

                // Initialize CozoDB
                if (sharedScanner.cozoInit()) {
                    console.log('[KittCoreWorker] CozoDB Initialized');

                    // Hydrate from OPFS if snapshot exists
                    try {
                        const loaded = await cozo_load_from_opfs();
                        if (loaded) {
                            console.log('[KittCoreWorker] CozoDB hydrated from OPFS');
                        } else {
                            console.log('[KittCoreWorker] No OPFS snapshot - starting fresh');
                        }
                    } catch (e) {
                        console.warn('[KittCoreWorker] OPFS load failed:', e);
                    }
                } else {
                    console.warn('[KittCoreWorker] CozoDB init failed');
                }

                initialized = true;
                console.log('[KittCoreWorker] WASM Initialized');
                self.postMessage({ type: 'INIT_RESULT', payload: { version: VERSION } } as ResponseMessage);
                break;


            // =========================================================
            // CozoDB Handlers (via Shared Memory)
            // =========================================================

            case 'INIT_DB':
                // CozoDB is already initialized in INIT
                if (!sharedScanner) throw new Error('WASM not initialized');
                const isReady = sharedScanner.cozoIsReady();
                self.postMessage({
                    type: 'INIT_DB_RESULT',
                    payload: { success: isReady, nodeCount: sharedScanner.cozoNodeCount(), edgeCount: sharedScanner.cozoEdgeCount() }
                } as ResponseMessage);
                break;

            case 'COZO_QUERY':
                if (!sharedScanner) throw new Error('WASM not initialized');
                const queryResult = sharedScanner.cozoQuery((msg as any).payload.query);
                self.postMessage({
                    type: 'COZO_QUERY_RESULT',
                    payload: queryResult
                } as ResponseMessage);
                break;

            case 'COZO_UPSERT_NODE':
                if (!sharedScanner) throw new Error('WASM not initialized');
                const nodePayload = (msg as any).payload;
                const nodeSuccess = sharedScanner.cozoUpsertNode(nodePayload.id, nodePayload.label, nodePayload.kind);
                self.postMessage({
                    type: 'COZO_UPSERT_NODE_RESULT',
                    payload: { success: nodeSuccess }
                } as ResponseMessage);
                if (nodeSuccess) scheduleDebouncedSave(); // Auto-save
                break;

            case 'COZO_UPSERT_EDGE':
                if (!sharedScanner) throw new Error('WASM not initialized');
                const edgePayload = (msg as any).payload;
                const edgeSuccess = sharedScanner.cozoUpsertEdge(edgePayload.source, edgePayload.target, edgePayload.relation);
                self.postMessage({
                    type: 'COZO_UPSERT_EDGE_RESULT',
                    payload: { success: edgeSuccess }
                } as ResponseMessage);
                if (edgeSuccess) scheduleDebouncedSave(); // Auto-save
                break;

            case 'COZO_EXPORT':
                if (!sharedScanner) throw new Error('WASM not initialized');
                const exportData = sharedScanner.cozoExport();
                self.postMessage({
                    type: 'COZO_EXPORT_RESULT',
                    payload: { success: exportData !== null, data: exportData }
                } as ResponseMessage);
                break;

            case 'COZO_IMPORT':
                if (!sharedScanner) throw new Error('WASM not initialized');
                const importSuccess = sharedScanner.cozoImport((msg as any).payload.data);
                self.postMessage({
                    type: 'COZO_IMPORT_RESULT',
                    payload: { success: importSuccess }
                } as ResponseMessage);
                break;

            case 'COZO_STATS':
                if (!sharedScanner) throw new Error('WASM not initialized');
                self.postMessage({
                    type: 'COZO_STATS_RESULT',
                    payload: {
                        nodeCount: sharedScanner.cozoNodeCount(),
                        edgeCount: sharedScanner.cozoEdgeCount()
                    }
                } as ResponseMessage);
                break;

            case 'SYNC_TO_NEBULA':
                if (!sharedScanner) throw new Error('WASM not initialized');
                const syncData = sharedScanner.cozoExport();
                self.postMessage({
                    type: 'SYNC_TO_NEBULA_RESULT',
                    payload: { data: syncData }
                } as ResponseMessage);
                break;

            case 'COZO_SAVE_TO_OPFS':
                try {
                    const saved = await cozo_save_to_opfs();
                    self.postMessage({
                        type: 'COZO_SAVE_TO_OPFS_RESULT',
                        payload: { success: saved }
                    } as ResponseMessage);
                } catch (e: any) {
                    self.postMessage({
                        type: 'COZO_SAVE_TO_OPFS_RESULT',
                        payload: { success: false, error: e.message || String(e) }
                    } as ResponseMessage);
                }
                break;

            case 'COZO_LOAD_FROM_OPFS':
                try {
                    const loaded = await cozo_load_from_opfs();
                    self.postMessage({
                        type: 'COZO_LOAD_FROM_OPFS_RESULT',
                        payload: { success: loaded }
                    } as ResponseMessage);
                } catch (e: any) {
                    self.postMessage({
                        type: 'COZO_LOAD_FROM_OPFS_RESULT',
                        payload: { success: false, error: e.message || String(e) }
                    } as ResponseMessage);
                }
                break;

            // =========================================================================
            // Registry API (SmartGraphRegistry Parity)
            // =========================================================================

            case 'REGISTRY_UPSERT_ENTITY': {
                const p = (msg as any).payload;
                try {
                    const success = registry_upsert_entity(p.id, p.label, p.kind, p.props);
                    self.postMessage({ type: 'REGISTRY_UPSERT_ENTITY_RESULT', payload: { success } } as ResponseMessage);
                    if (success) scheduleDebouncedSave();
                } catch (e: any) {
                    self.postMessage({ type: 'REGISTRY_UPSERT_ENTITY_RESULT', payload: { success: false, error: e.message } } as ResponseMessage);
                }
                break;
            }

            case 'REGISTRY_GET_ENTITY_BY_ID': {
                try {
                    const data = registry_get_entity_by_id((msg as any).payload.id);
                    self.postMessage({ type: 'REGISTRY_GET_ENTITY_BY_ID_RESULT', payload: { success: true, data } } as ResponseMessage);
                } catch (e: any) {
                    self.postMessage({ type: 'REGISTRY_GET_ENTITY_BY_ID_RESULT', payload: { success: false, error: e.message } } as ResponseMessage);
                }
                break;
            }

            case 'REGISTRY_FIND_ENTITY_BY_LABEL': {
                try {
                    const data = registry_find_entity_by_label((msg as any).payload.label);
                    self.postMessage({ type: 'REGISTRY_FIND_ENTITY_BY_LABEL_RESULT', payload: { success: true, data } } as ResponseMessage);
                } catch (e: any) {
                    self.postMessage({ type: 'REGISTRY_FIND_ENTITY_BY_LABEL_RESULT', payload: { success: false, error: e.message } } as ResponseMessage);
                }
                break;
            }

            case 'REGISTRY_GET_ALL_ENTITIES': {
                try {
                    const data = registry_get_all_entities();
                    self.postMessage({ type: 'REGISTRY_GET_ALL_ENTITIES_RESULT', payload: { success: true, data } } as ResponseMessage);
                } catch (e: any) {
                    self.postMessage({ type: 'REGISTRY_GET_ALL_ENTITIES_RESULT', payload: { success: false, error: e.message } } as ResponseMessage);
                }
                break;
            }

            case 'REGISTRY_DELETE_ENTITY': {
                try {
                    const success = registry_delete_entity((msg as any).payload.id);
                    self.postMessage({ type: 'REGISTRY_DELETE_ENTITY_RESULT', payload: { success } } as ResponseMessage);
                    if (success) scheduleDebouncedSave();
                } catch (e: any) {
                    self.postMessage({ type: 'REGISTRY_DELETE_ENTITY_RESULT', payload: { success: false, error: e.message } } as ResponseMessage);
                }
                break;
            }

            case 'REGISTRY_UPSERT_RELATIONSHIP': {
                const p = (msg as any).payload;
                try {
                    const success = registry_upsert_relationship(p.id, p.sourceId, p.targetId, p.relType, p.confidence, p.bidirectional);
                    self.postMessage({ type: 'REGISTRY_UPSERT_RELATIONSHIP_RESULT', payload: { success } } as ResponseMessage);
                    if (success) scheduleDebouncedSave();
                } catch (e: any) {
                    self.postMessage({ type: 'REGISTRY_UPSERT_RELATIONSHIP_RESULT', payload: { success: false, error: e.message } } as ResponseMessage);
                }
                break;
            }

            case 'REGISTRY_GET_RELATIONSHIPS_FOR_ENTITY': {
                try {
                    const data = registry_get_relationships_for_entity((msg as any).payload.entityId);
                    self.postMessage({ type: 'REGISTRY_GET_RELATIONSHIPS_FOR_ENTITY_RESULT', payload: { success: true, data } } as ResponseMessage);
                } catch (e: any) {
                    self.postMessage({ type: 'REGISTRY_GET_RELATIONSHIPS_FOR_ENTITY_RESULT', payload: { success: false, error: e.message } } as ResponseMessage);
                }
                break;
            }

            case 'REGISTRY_GET_ALL_RELATIONSHIPS': {
                try {
                    const data = registry_get_all_relationships();
                    self.postMessage({ type: 'REGISTRY_GET_ALL_RELATIONSHIPS_RESULT', payload: { success: true, data } } as ResponseMessage);
                } catch (e: any) {
                    self.postMessage({ type: 'REGISTRY_GET_ALL_RELATIONSHIPS_RESULT', payload: { success: false, error: e.message } } as ResponseMessage);
                }
                break;
            }

            case 'REGISTRY_DELETE_RELATIONSHIP': {
                try {
                    const success = registry_delete_relationship((msg as any).payload.id);
                    self.postMessage({ type: 'REGISTRY_DELETE_RELATIONSHIP_RESULT', payload: { success } } as ResponseMessage);
                    if (success) scheduleDebouncedSave();
                } catch (e: any) {
                    self.postMessage({ type: 'REGISTRY_DELETE_RELATIONSHIP_RESULT', payload: { success: false, error: e.message } } as ResponseMessage);
                }
                break;
            }

            case 'REGISTRY_GET_STATS': {
                try {
                    const data = registry_get_stats();
                    self.postMessage({ type: 'REGISTRY_GET_STATS_RESULT', payload: { success: true, data } } as ResponseMessage);
                } catch (e: any) {
                    self.postMessage({ type: 'REGISTRY_GET_STATS_RESULT', payload: { success: false, error: e.message } } as ResponseMessage);
                }
                break;
            }

            // Legacy SQLite handlers - disabled


            case 'DB_EXEC':
            case 'INIT_SCHEMA':
            case 'SAVE_NOTE':
                console.warn('[KittCoreWorker] SQLite is disabled. Use COZO_* commands instead.');
                self.postMessage({
                    type: 'ERROR',
                    payload: { message: 'SQLite disabled. Use COZO_QUERY, COZO_UPSERT_NODE, etc.' }
                } as ResponseMessage);
                break;

            // ... (rest of cases)

            case 'VERSION':
                self.postMessage({ type: 'VERSION_RESULT', payload: { version: VERSION } } as ResponseMessage);
                break;

            case 'GREET':
                // Legacy: greet() method was removed from ScanConductor
                self.postMessage({ type: 'GREET_RESULT', payload: { message: `Hello from WASM!` } } as ResponseMessage);
                break;

            case 'SCAN':
                if (!conductor) throw new Error('Not initialized');
                const scanRes = conductor.scan(msg.payload.content, msg.payload.narrativeId);
                self.postMessage({ type: 'SCAN_RESULT', payload: scanRes } as ResponseMessage);
                break;

            case 'SCAN_IMPLICIT':
                if (!dafsaScanner) throw new Error('Not initialized');
                const impSpans = dafsaScanner.scan(msg.payload.content, msg.payload.narrativeId);
                self.postMessage({ type: 'IMPLICIT_RESULT', payload: { mentions: impSpans } } as ResponseMessage);
                break;

            case 'HYDRATE_ENTITIES':
                if (!conductor) throw new Error('Not initialized');
                // SCOPE AWARENESS: We now hydrate ALL entities (Global + Narratives)
                // The filtering happens at runtime in the scanner via narrativeId.
                const entitiesToHydrate = msg.payload.entities;

                console.log(`[KittCoreWorker:TRACE] HYDRATE_ENTITIES received ${entitiesToHydrate?.length ?? 0} entities`);

                // Log sample entities for debugging
                if (entitiesToHydrate && entitiesToHydrate.length > 0) {
                    console.log('[KittCoreWorker:TRACE] Sample entities to hydrate:', entitiesToHydrate.slice(0, 5).map((e: any) => ({
                        id: e.id,
                        label: e.label,
                        kind: e.kind,
                        aliasCount: e.aliases?.length ?? 0
                    })));
                } else {
                    console.log('[KittCoreWorker:TRACE] No entities to hydrate (empty list)');
                }

                conductor.hydrateEntities(entitiesToHydrate);
                console.log('[KittCoreWorker:TRACE] ScanConductor hydrated');

                if (dafsaScanner) {
                    try {
                        console.log('[KittCoreWorker:TRACE] Calling dafsaScanner.hydrate()...');
                        dafsaScanner.hydrate(entitiesToHydrate);
                        console.log('[KittCoreWorker:TRACE] DAFSA hydration complete');
                    } catch (err) {
                        console.error('[KittCoreWorker] DAFSA hydration failed:', err);
                    }
                } else {
                    console.warn('[KittCoreWorker:TRACE] dafsaScanner is NULL, cannot hydrate!');
                }


                // Also push entities to Rust CozoDB for persistence
                if (sharedScanner) {
                    let cozoCount = 0;
                    for (const entity of entitiesToHydrate) {
                        if (sharedScanner.cozoUpsertNode(entity.id, entity.label, entity.kind)) {
                            cozoCount++;
                        }
                    }
                    if (cozoCount > 0) {
                        console.log(`[KittCoreWorker] Pushed ${cozoCount} entities to Rust CozoDB`);
                        scheduleDebouncedSave();
                    }
                }

                entitiesHydrated = entitiesToHydrate.length;
                self.postMessage({
                    type: 'ENTITIES_HYDRATED',
                    payload: { count: entitiesHydrated }
                } as ResponseMessage);
                break;


            // ...

            case 'SCAN_IMPLICIT_RUST':
                if (!dafsaScanner) throw new Error('Rust implicit scanner not initialized');
                // Pass narrativeId for scope-aware filtering
                const scanContent = msg.payload.content;
                const scanNarrativeId = msg.payload.narrativeId;

                console.log(`[KittCoreWorker:TRACE] SCAN_IMPLICIT_RUST called, contentLen=${scanContent?.length ?? 0}, narrativeId=${scanNarrativeId ?? 'none'}`);
                console.log(`[KittCoreWorker:TRACE] Content preview: "${scanContent?.substring(0, 100)}..."`);

                const rustSpans = dafsaScanner.scan(scanContent, scanNarrativeId);

                console.log(`[KittCoreWorker:TRACE] DAFSA returned ${rustSpans?.length ?? 0} spans`);
                if (rustSpans && rustSpans.length > 0) {
                    console.log('[KittCoreWorker:TRACE] Sample spans:', rustSpans.slice(0, 5));
                } else {
                    console.warn('[KittCoreWorker:TRACE] DAFSA returned NO spans for this content!');
                }

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

            case 'SCAN_DISCOVERY':
                if (!sharedScanner) throw new Error('Shared memory scanner not initialized');
                try {
                    const candidates = sharedScanner.scan(msg.payload.content);
                    // ... log ...
                    self.postMessage({
                        type: 'DISCOVERY_RESULT',
                        payload: { candidates }
                    } as ResponseMessage);
                } catch (err) {
                    // ... error ...
                }
                break;

            case 'COMPUTE_SMART_CONTEXT':
                if (!realityCortex) throw new Error('RealityCortex not initialized');

                // Note: In current architecture, RealityCortex graph might be empty if we haven't
                // fed it documents via `process`. 
                // Ideally we should hydrate it or use it for processing instead of Conductor.

                const context = realityCortex.computeSmartContext(msg.payload.focusEntities);

                self.postMessage({
                    type: 'SMART_CONTEXT_RESULT',
                    payload: { context }
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

            // =========================================================================
            // Calendar API
            // =========================================================================

            case 'CALENDAR_GET_DEFINITION': {
                const { worldId } = msg.payload;
                try {
                    const result = calendar_get_definition(worldId || 'default');
                    self.postMessage({
                        type: 'CALENDAR_GET_DEFINITION_RESULT',
                        payload: { success: true, data: result }
                    } as ResponseMessage);
                } catch (e) {
                    self.postMessage({
                        type: 'CALENDAR_GET_DEFINITION_RESULT',
                        payload: { success: false, error: String(e) }
                    } as ResponseMessage);
                }
                break;
            }

            case 'CALENDAR_SAVE_DEFINITION': {
                const { definition } = msg.payload;
                try {
                    const result = calendar_save_definition(definition);
                    self.postMessage({
                        type: 'CALENDAR_SAVE_DEFINITION_RESULT',
                        payload: { success: result }
                    } as ResponseMessage);
                    if (result) scheduleDebouncedSave();
                } catch (e) {
                    self.postMessage({
                        type: 'CALENDAR_SAVE_DEFINITION_RESULT',
                        payload: { success: false, error: String(e) }
                    } as ResponseMessage);
                }
                break;
            }

            case 'CALENDAR_GET_ALL_EVENTS': {
                const { calendarId } = msg.payload;
                try {
                    const result = calendar_get_all_events(calendarId);
                    self.postMessage({
                        type: 'CALENDAR_GET_ALL_EVENTS_RESULT',
                        payload: { success: true, data: result }
                    } as ResponseMessage);
                } catch (e) {
                    self.postMessage({
                        type: 'CALENDAR_GET_ALL_EVENTS_RESULT',
                        payload: { success: false, data: [], error: String(e) }
                    } as ResponseMessage);
                }
                break;
            }

            case 'CALENDAR_CREATE_EVENT': {
                const { event } = msg.payload;
                try {
                    const result = calendar_create_event(event);
                    self.postMessage({
                        type: 'CALENDAR_CREATE_EVENT_RESULT',
                        payload: { success: true, data: result }
                    } as ResponseMessage);
                    scheduleDebouncedSave();
                } catch (e) {
                    self.postMessage({
                        type: 'CALENDAR_CREATE_EVENT_RESULT',
                        payload: { success: false, error: String(e) }
                    } as ResponseMessage);
                }
                break;
            }

            case 'CALENDAR_DELETE_EVENT': {
                const { id } = msg.payload;
                try {
                    const result = calendar_delete_event(id);
                    self.postMessage({
                        type: 'CALENDAR_DELETE_EVENT_RESULT',
                        payload: { success: result }
                    } as ResponseMessage);
                    if (result) scheduleDebouncedSave();
                } catch (e) {
                    self.postMessage({
                        type: 'CALENDAR_DELETE_EVENT_RESULT',
                        payload: { success: false, error: String(e) }
                    } as ResponseMessage);
                }
                break;
            }

            case 'CALENDAR_GET_ALL_PERIODS': {
                const { calendarId } = msg.payload;
                try {
                    const result = calendar_get_all_periods(calendarId);
                    self.postMessage({
                        type: 'CALENDAR_GET_ALL_PERIODS_RESULT',
                        payload: { success: true, data: result }
                    } as ResponseMessage);
                } catch (e) {
                    self.postMessage({
                        type: 'CALENDAR_GET_ALL_PERIODS_RESULT',
                        payload: { success: false, data: [], error: String(e) }
                    } as ResponseMessage);
                }
                break;
            }

            case 'CALENDAR_CREATE_PERIOD': {
                const { period } = msg.payload;
                try {
                    const result = calendar_create_period(period);
                    self.postMessage({
                        type: 'CALENDAR_CREATE_PERIOD_RESULT',
                        payload: { success: true, data: result }
                    } as ResponseMessage);
                    scheduleDebouncedSave();
                } catch (e) {
                    self.postMessage({
                        type: 'CALENDAR_CREATE_PERIOD_RESULT',
                        payload: { success: false, error: String(e) }
                    } as ResponseMessage);
                }
                break;
            }

            case 'CALENDAR_DELETE_PERIOD': {
                const { id } = msg.payload;
                try {
                    const result = calendar_delete_period(id);
                    self.postMessage({
                        type: 'CALENDAR_DELETE_PERIOD_RESULT',
                        payload: { success: result }
                    } as ResponseMessage);
                    if (result) scheduleDebouncedSave();
                } catch (e) {
                    self.postMessage({
                        type: 'CALENDAR_DELETE_PERIOD_RESULT',
                        payload: { success: false, error: String(e) }
                    } as ResponseMessage);
                }
                break;
            }
        }
    } catch (e) {
        console.error('[KittCoreWorker] Detailed Error:', e);
        // Extract useful info from WASM link errors
        let msg = String(e);
        if (e instanceof WebAssembly.LinkError) {
            msg = `WASM Link Error (Build Mismatch): ${e.message}`;
        } else if (e instanceof Error) {
            msg = e.message;
        }

        self.postMessage({
            type: 'ERROR',
            payload: { message: msg }
        } as ResponseMessage);
    }
};

console.log('[KittCoreWorker] Worker script loaded (WASM MODE)');

