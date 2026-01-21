/**
 * KittCore WASM Service
 * 
 * TypeScript interface to the KittCore WASM worker.
 * Handles worker lifecycle, message passing, and type-safe responses.
 * 
 * NOTE: Worker is wired up to the real Rust WASM module.
 * Entity embedding uses CrossDoc worker (MDBR-Leaf, off main thread).
 */

// Cross-doc imports - crossDocService handles embedding in separate worker
import {
    crossDocService,
    discoverClusters,
    persistClusters,
    type LinkingConfig,
    DEFAULT_LINKING_CONFIG
} from '@/lib/crossdoc';
// LEGACY REMOVED: import { cozoDb } from '@/lib/cozo/db';
// LEGACY REMOVED: import { CROSSDOC_QUERIES } from '@/lib/cozo/schema/layer2-crossdoc';

// Message types (should match the worker)
export interface EntityInput {
    label: string;
    start: number;
    end: number;
}

export interface EntityDefinition {
    id: string;
    label: string;
    kind: string;
    aliases?: string[];
}

export interface EntitySpan {
    id: string;
    label: string;
    start: number;
    end: number;
}

export interface ScanResult {
    syntax_matches: SyntaxMatch[];
    implicit_mentions: ImplicitMention[];
    relations: ExtractedRelation[];
    triples: ExtractedTriple[];
    temporal_mentions: TemporalMention[];
    stats: ScanStats;
}

export interface SyntaxMatch {
    kind: string;
    text: string;
    start: number;
    end: number;
}

export interface ImplicitMention {
    entity_id: string;
    entity_label: string;
    matched_text: string;
    start: number;
    end: number;
    match_type: string;
}

export interface ExtractedRelation {
    source_id: string;
    target_id: string;
    kind: string;
    confidence: number;
}

export interface ExtractedTriple {
    subject: string;
    predicate: string;
    object: string;
    start: number;
    end: number;
}

export interface TemporalMention {
    text: string;
    kind: string;
    start: number;
    end: number;
}

export interface ScanStats {
    syntax_count: number;
    implicit_count: number;
    relation_count: number;
    triple_count: number;
    temporal_count: number;
    duration_ms: number;
}

export interface DiscoveryCandidate {
    token: string;
    kind: number; // 255 = None, else EntityKind
    score: number;
    status: number; // 0=Watching, 1=Promoted, 2=Ignored
}

export interface WorkerStatus {
    initialized: boolean;
    wasmLoaded: boolean;
    entitiesHydrated: number;
    version: string;
}

export class KittCoreService {
    private worker: Worker | null = null;
    private initPromise: Promise<void> | null = null;
    private messageId = 0;
    private pendingMessages = new Map<number, {
        resolve: (value: any) => void;
        reject: (error: Error) => void;
    }>();

    // Hydration tracking - scanImplicitRust waits for this
    private hydrationResolve: (() => void) | null = null;
    private hydrationPromise: Promise<void> | null = null;
    private isHydrated = false;

    // Scanner toggle: true = DaachScanner (full-parity AC), false = DAFSA (legacy)
    public useDaachScanner = true;  // ENABLED: Field name fix applied

    /**
     * Initialize the KittCore worker
     */
    async init(): Promise<string> {
        if (this.initPromise) {
            await this.initPromise;
            return 'already initialized';
        }

        this.initPromise = new Promise((resolve, reject) => {
            try {
                // Create worker - path relative from this file to worker in src/workers/
                this.worker = new Worker(
                    new URL('../../workers/kittcore.worker.ts', import.meta.url),
                    { type: 'module' }
                );

                // Set up message handler
                this.worker.onmessage = (e) => this.handleMessage(e);

                this.worker.onerror = (e) => {
                    console.error('[KittCore] Worker error:', e);
                    reject(new Error(`Worker error: ${e.message}`));
                };

                // Send init message
                this.sendMessage({ type: 'INIT' }).then((result: any) => {
                    console.log('[KittCore] Initialized:', result.version);
                    resolve();
                }).catch(reject);

            } catch (e) {
                reject(e);
            }
        });

        await this.initPromise;
        return 'initialized';
    }

    /**
     * Send a message and wait for response
     */
    private sendMessage(message: any): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.worker) {
                reject(new Error('Worker not initialized'));
                return;
            }

            const id = this.messageId++;
            this.pendingMessages.set(id, { resolve, reject });

            // Post message with ID for correlation
            this.worker.postMessage({ ...message, _id: id });

            // Timeout after 30 seconds
            setTimeout(() => {
                if (this.pendingMessages.has(id)) {
                    this.pendingMessages.delete(id);
                    reject(new Error('Message timeout'));
                }
            }, 30000);
        });
    }

    /**
     * Handle incoming messages from worker
     */
    private handleMessage(e: MessageEvent) {
        const { type, payload, _id } = e.data;

        // Route to pending promise if we have an ID
        // Note: Worker doesn't send _id back currently, so we match by response type
        const pending = Array.from(this.pendingMessages.entries())[0];
        if (pending) {
            const [id, { resolve, reject }] = pending;
            this.pendingMessages.delete(id);

            if (type === 'ERROR') {
                reject(new Error(payload.message));
            } else {
                resolve(payload);
            }
        }
    }

    /**
     * Hydrate the scanner with entity definitions for implicit matching
     */
    async hydrateEntities(entities: EntityDefinition[]): Promise<number> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'HYDRATE_ENTITIES',
            payload: { entities }
        });

        // Mark hydration complete - unblock scanImplicitRust calls
        this.isHydrated = true;
        if (this.hydrationResolve) {
            this.hydrationResolve();
            this.hydrationResolve = null;
        }
        console.log('[KittCore] Hydration complete, scans unblocked');

        return result.count;
    }

    /**
     * Full document scan - extracts syntax, implicit mentions, relations, triples, temporal
     */
    async scan(content: string, entities: EntityInput[] = []): Promise<ScanResult> {
        console.log(`[KittCore] scan(): contentLen=${content?.length}, entities=${entities?.length}`);
        await this.ensureInitialized();
        return await this.sendMessage({
            type: 'SCAN',
            payload: { content, entities }
        });
    }

    /**
     * Scan for implicit entity mentions only
     */
    async scanImplicit(content: string): Promise<ImplicitMention[]> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'SCAN_IMPLICIT',
            payload: { content }
        });
        return result.mentions;
    }

    /**
     * Scan for implicit entity mentions using Rust scanner
     * Uses DaachScanner (full-parity AC) or DAFSA (legacy) based on useDaachScanner flag
     * IMPORTANT: Waits for hydration to complete before scanning
     */
    async scanImplicitRust(content: string, narrativeId?: string): Promise<any[]> {
        await this.ensureInitialized();

        // Wait for hydration before scanning - prevents empty results during boot
        if (!this.isHydrated) {
            if (!this.hydrationPromise) {
                this.hydrationPromise = new Promise<void>((resolve) => {
                    this.hydrationResolve = resolve;
                });
            }
            // console.log('[KittCore] Waiting for hydration before scan...');
            await this.hydrationPromise;
        }

        // Toggle between scanners based on flag
        const messageType = this.useDaachScanner ? 'SCAN_DAACH' : 'SCAN_IMPLICIT_RUST';
        console.log(`[KittCore] Using ${this.useDaachScanner ? 'DaachScanner' : 'DAFSA'} for scan`);

        const result = await this.sendMessage({
            type: messageType,
            payload: { content, narrativeId }
        });
        return result.spans;
    }

    /**
     * Extract relationships between entities
     */
    async extractRelations(content: string, entities: EntitySpan[]): Promise<ExtractedRelation[]> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'EXTRACT_RELATIONS',
            payload: { content, entities }
        });
        return result.relations;
    }

    /**
     * Extract triple patterns ([[A->B->C]])
     */
    async extractTriples(content: string): Promise<ExtractedTriple[]> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'EXTRACT_TRIPLES',
            payload: { content }
        });
        return result.triples;
    }

    /**
     * Scan for temporal expressions
     */
    async scanTemporal(content: string): Promise<TemporalMention[]> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'SCAN_TEMPORAL',
            payload: { content }
        });
        return result.mentions;
    }

    /**
     * Scan for discovery candidates (Shared Memory)
     */
    async scanDiscovery(content: string): Promise<DiscoveryCandidate[]> {
        await this.ensureInitialized();
        console.time('scanDiscovery');
        try {
            const result = await this.sendMessage({
                type: 'SCAN_DISCOVERY',
                payload: { content }
            });
            console.timeEnd('scanDiscovery');
            const candidates = result.candidates || [];
            if (candidates.length > 0) {
                console.log(`[Discovery:Service] Received ${candidates.length} candidates from worker`, candidates.map((c: any) => c.token));
            } else {
                console.log(`[Discovery:Service] Received 0 candidates from worker`);
            }
            return candidates;
        } catch (err) {
            console.timeEnd('scanDiscovery');
            console.error('[KittCore] Discovery Scan failed:', err);
            return [];
        }
    }

    /**
     * Get worker status
     */
    async getStatus(): Promise<WorkerStatus> {
        await this.ensureInitialized();
        return await this.sendMessage({ type: 'GET_STATUS' });
    }

    /**
     * Test the worker with a simple greet
     */
    async greet(name: string): Promise<string> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'GREET',
            payload: { name }
        });
        return result.message;
    }

    /**
     * Get version info
     */
    async version(): Promise<{ version: string; timestamp: string }> {
        await this.ensureInitialized();
        return await this.sendMessage({ type: 'VERSION' });
    }

    /**
     * Compute Smart Context (PCST) for a set of focus entities
     */
    async computeSmartContext(focusEntities: string[]): Promise<any> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'COMPUTE_SMART_CONTEXT',
            payload: { focusEntities }
        });
        return result.context;
    }

    /**
     * Initialize SQLite DB in Worker (OPFS)
     */
    async initDb(name: string): Promise<void> {
        await this.ensureInitialized();
        await this.sendMessage({
            type: 'INIT_DB',
            payload: { name }
        });
    }

    /**
     * Execute SQL in Worker DB
     */
    async dbExec(sql: string): Promise<void> {
        await this.ensureInitialized();
        await this.sendMessage({
            type: 'DB_EXEC',
            payload: { sql }
        });
    }

    /**
     * Initialize DB Schema
     */
    async initSchema(): Promise<void> {
        await this.ensureInitialized();
        await this.sendMessage({ type: 'INIT_SCHEMA' });
    }

    /**
     * Save a note to SQLite
     */
    async saveNote(note: any): Promise<void> {
        await this.ensureInitialized();
        await this.sendMessage({
            type: 'SAVE_NOTE',
            payload: { note }
        });
    }

    /**
     * Export Rust CozoDB to JSON string
     */
    async cozoExport(): Promise<string | null> {
        await this.ensureInitialized();
        const result = await this.sendMessage({ type: 'COZO_EXPORT' });
        return result.data;
    }

    /**
     * Import JSON string into Rust CozoDB
     */
    async cozoImport(data: string): Promise<boolean> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'COZO_IMPORT',
            payload: { data }
        });
        return result.success;
    }

    /**
     * Execute arbitrary Datalog query on Rust CozoDB
     */
    async cozoQuery(query: string): Promise<any> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'COZO_QUERY',
            payload: { query }
        });
        return result;
    }

    /**
     * Upsert Node to Rust CozoDB
     */
    async cozoUpsertNode(id: string, label: string, kind: string): Promise<boolean> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'COZO_UPSERT_NODE',
            payload: { id, label, kind }
        });
        return result.success;
    }

    /**
     * Upsert Relationship to Rust CozoDB
     */
    async cozoUpsertRelationship(
        id: string,
        source: string,
        target: string,
        type: string,
        confidence = 1.0,
        bidirectional = false
    ): Promise<boolean> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'COZO_UPSERT_RELATIONSHIP',
            payload: { id, source, target, type, confidence, bidirectional }
        });
        return result.success;
    }

    /**
     * Upsert Edge to Rust CozoDB (Deprecated: uses implicit relationship ID)
     */
    async cozoUpsertEdge(source: string, target: string, relation: string): Promise<boolean> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'COZO_UPSERT_EDGE',
            payload: { source, target, relation }
        });
        return result.success;
    }


    /**
     * Sync Rust CozoDB state to Dexie (One-way projection)
     */
    async syncToNebula(): Promise<string | null> {
        await this.ensureInitialized();
        const result = await this.sendMessage({ type: 'SYNC_TO_NEBULA' });
        return result.data;
    }

    /**
     * Save Rust CozoDB to OPFS for persistence
     */
    async cozoSaveToOpfs(): Promise<boolean> {
        await this.ensureInitialized();
        const result = await this.sendMessage({ type: 'COZO_SAVE_TO_OPFS' });
        return result.success;
    }

    /**
     * Load Rust CozoDB from OPFS snapshot
     */
    async cozoLoadFromOpfs(): Promise<boolean> {
        await this.ensureInitialized();
        const result = await this.sendMessage({ type: 'COZO_LOAD_FROM_OPFS' });
        return result.success;
    }

    // =========================================================================
    // Registry API (SmartGraphRegistry Parity)
    // =========================================================================

    /**
     * Upsert entity to Rust CozoDB
     */
    async registryUpsertEntity(
        id: string,
        label: string,
        kind: string,
        props: Record<string, unknown> = {}
    ): Promise<boolean> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'REGISTRY_UPSERT_ENTITY',
            payload: { id, label, kind, props: JSON.stringify(props) }
        });
        return result.success;
    }

    /**
     * Get entity by ID from Rust CozoDB
     */
    async registryGetEntityById(id: string): Promise<unknown | null> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'REGISTRY_GET_ENTITY_BY_ID',
            payload: { id }
        });
        return result.data;
    }

    /**
     * Find entity by label from Rust CozoDB
     */
    async registryFindEntityByLabel(label: string): Promise<unknown | null> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'REGISTRY_FIND_ENTITY_BY_LABEL',
            payload: { label }
        });
        return result.data;
    }

    /**
     * Get all entities from Rust CozoDB
     */
    async registryGetAllEntities(): Promise<unknown[]> {
        await this.ensureInitialized();
        const result = await this.sendMessage({ type: 'REGISTRY_GET_ALL_ENTITIES' });
        return result.data ?? [];
    }

    /**
     * Delete entity from Rust CozoDB
     */
    async registryDeleteEntity(id: string): Promise<boolean> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'REGISTRY_DELETE_ENTITY',
            payload: { id }
        });
        return result.success;
    }

    /**
     * Upsert relationship to Rust CozoDB
     */
    async registryUpsertRelationship(
        id: string,
        sourceId: string,
        targetId: string,
        relType: string,
        confidence = 1.0,
        bidirectional = false
    ): Promise<boolean> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'REGISTRY_UPSERT_RELATIONSHIP',
            payload: { id, sourceId, targetId, relType, confidence, bidirectional }
        });
        return result.success;
    }

    /**
     * Get relationships for entity from Rust CozoDB
     */
    async registryGetRelationshipsForEntity(entityId: string): Promise<unknown[]> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'REGISTRY_GET_RELATIONSHIPS_FOR_ENTITY',
            payload: { entityId }
        });
        return result.data ?? [];
    }

    /**
     * Get all relationships from Rust CozoDB
     */
    async registryGetAllRelationships(): Promise<unknown[]> {
        await this.ensureInitialized();
        const result = await this.sendMessage({ type: 'REGISTRY_GET_ALL_RELATIONSHIPS' });
        return result.data ?? [];
    }

    /**
     * Delete relationship from Rust CozoDB
     */
    async registryDeleteRelationship(id: string): Promise<boolean> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'REGISTRY_DELETE_RELATIONSHIP',
            payload: { id }
        });
        return result.success;
    }

    /**
     * Get registry stats from Rust CozoDB
     */
    async registryGetStats(): Promise<{ entity_count: number; relationship_count: number }> {
        await this.ensureInitialized();
        const result = await this.sendMessage({ type: 'REGISTRY_GET_STATS' });
        return result.data ?? { entity_count: 0, relationship_count: 0 };
    }

    private async ensureInitialized(): Promise<void> {


        if (!this.initPromise) {
            await this.init();
        } else {
            await this.initPromise;
        }
    }

    /**
     * Terminate the worker
     */
    terminate(): void {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
            this.initPromise = null;
        }
    }

    // ========================================================================
    // Cross-Document Entity Linking (Delegated to CrossDoc Worker)
    // ========================================================================

    /**
     * Process extracted entities - delegates to CrossDoc worker
     * Embeddings run off main thread using MDBR-Leaf (256d, lightweight)
     */
    async processExtractedEntities(
        noteId: string,
        noteTitle: string,
        entities: Array<{ id: string; label: string; kind: string; contextBefore?: string; contextAfter?: string }>
    ): Promise<{ embedded: number; cooccurrences: number }> {
        // Delegate to CrossDoc service (runs in separate worker)
        return await crossDocService.processEntities(noteId, noteTitle, entities);
    }

    /**
     * Run entity linking/clustering on main thread
     */
    async runLinking(config?: Partial<LinkingConfig>): Promise<{
        clusters: any[];
        stats: { entities: number; clusters: number; timeMs: number };
    }> {
        const startTime = performance.now();
        const linkingConfig: LinkingConfig = {
            ...DEFAULT_LINKING_CONFIG,
            ...(config || {}),
        };

        console.log('[KittCore] Running entity linking on main thread...');

        // LEGACY REMOVED: TS CozoDB cross-doc linking
        // TODO: Migrate to Rust backend for entity linking
        console.warn('[KittCore] runEntityLinking disabled - requires Rust migration');
        throw new Error('Entity linking temporarily disabled - pending Rust migration');
    }

    /**
     * Get entity clusters from CozoDB
     */
    async getClusters(entityId?: string): Promise<any[]> {
        // LEGACY REMOVED: TS CozoDB cluster queries
        console.warn('[KittCore] getClusters disabled - requires Rust migration');
        return [];
    }

    /**
     * Save confirmed candidates to CozoDB for persistence
     */
    async saveCandidates(candidates: DiscoveryCandidate[]): Promise<void> {
        // LEGACY REMOVED: TS CozoDB candidate persistence
        // TODO: Migrate to Rust backend
        console.warn('[KittCore] saveCandidates disabled - requires Rust migration');
    }

    // =========================================================================
    // Calendar API (Fantasy Calendar CRUD)
    // =========================================================================

    /**
     * Get calendar definition for a world
     */
    async calendarGetDefinition(worldId: string = 'default'): Promise<any | null> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'CALENDAR_GET_DEFINITION',
            payload: { worldId }
        });
        return result.data;
    }

    /**
     * Save calendar definition
     */
    async calendarSaveDefinition(definition: any): Promise<boolean> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'CALENDAR_SAVE_DEFINITION',
            payload: { definition: JSON.stringify(definition) }
        });
        return result.success;
    }

    /**
     * Get all calendar events for a calendar
     */
    async calendarGetAllEvents(calendarId: string): Promise<any[]> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'CALENDAR_GET_ALL_EVENTS',
            payload: { calendarId }
        });
        return result.data || [];
    }

    /**
     * Create a calendar event
     */
    async calendarCreateEvent(event: any): Promise<any> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'CALENDAR_CREATE_EVENT',
            payload: { event: JSON.stringify(event) }
        });
        return result.data;
    }

    /**
     * Delete a calendar event
     */
    async calendarDeleteEvent(id: string): Promise<boolean> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'CALENDAR_DELETE_EVENT',
            payload: { id }
        });
        return result.success;
    }

    /**
     * Get all calendar periods for a calendar
     */
    async calendarGetAllPeriods(calendarId: string): Promise<any[]> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'CALENDAR_GET_ALL_PERIODS',
            payload: { calendarId }
        });
        return result.data || [];
    }

    /**
     * Create a calendar period
     */
    async calendarCreatePeriod(period: any): Promise<any> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'CALENDAR_CREATE_PERIOD',
            payload: { period: JSON.stringify(period) }
        });
        return result.data;
    }

    /**
     * Delete a calendar period
     */
    async calendarDeletePeriod(id: string): Promise<boolean> {
        await this.ensureInitialized();
        const result = await this.sendMessage({
            type: 'CALENDAR_DELETE_PERIOD',
            payload: { id }
        });
        return result.success;
    }

}

// Singleton export
export const kittCore = new KittCoreService();
