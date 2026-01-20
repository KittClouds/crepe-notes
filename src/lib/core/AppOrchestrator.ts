import { entityColorStore } from '../store/entityColorStore';
import { entityAttributeStore } from '../store/entityAttributeStore';
import { smartGraphRegistry } from '../registry'; // Uses Rust or TS based on USE_RUST_BACKEND flag
import { cozoDb } from '../cozo/db';
import { queryClient } from '@/lib/queryClient';
import { loadCozoBootCache, saveCozoBootCache, buildCozoBootCache } from '@/lib/storage/cozoBootCache';
import { loadNebulaBootCache, saveNebulaBootCache, buildNebulaBootCache } from '@/lib/nebuladb/bootCache';
import { loadRustCozoBootCache, saveRustCozoBootCache } from '@/lib/storage/rustCozoBootCache';
import { noteKeys } from '@/hooks/useNotes';
import { folderKeys } from '@/hooks/useFolders';
import { syncOrchestrator } from '@/lib/nebuladb/sync';
import { nebulaDb, notes, decorations } from '@/lib/nebuladb/db';
import { graphHotCache } from '@/lib/cozo/graph/GraphHotCache';
import { kittCore } from '../kittcore';

// Feature flag: When true, skips TS CozoDB initialization (Rust handles it)
const USE_RUST_COZO_BACKEND = true;

export class AppOrchestrator {
    private static instance: AppOrchestrator;
    private state: 'idle' | 'booting' | 'ready' | 'error' = 'idle';

    private listeners = new Set<(state: string) => void>();

    // Early KittCore init promise
    private kittCoreInitPromise: Promise<string> | null = null;
    private rustCozoPreloaded = false;

    // Singleton access
    static getInstance(): AppOrchestrator {
        if (!AppOrchestrator.instance) {
            AppOrchestrator.instance = new AppOrchestrator();
        }
        return AppOrchestrator.instance;
    }

    public subscribe(listener: (state: string) => void) {
        this.listeners.add(listener);
        listener(this.state); // Immediate callback
        return () => this.listeners.delete(listener);
    }

    private setState(newState: 'idle' | 'booting' | 'ready' | 'error') {
        this.state = newState;
        this.listeners.forEach(l => l(newState));
    }

    public getState() {
        return this.state;
    }

    /**
     * Main entry point for application startup.
     * Guaranteed to run only once.
     * 
     * BOOT SEQUENCE:
     * Phase 0:   Runtime (~1ms) - env checks, color store, WASM preload
     * Phase 0.5: FastBoot (~1ms) - localStorage caches → QueryClient (UI CAN PAINT)
     * Phase 1:   NebulaDB (~50-100ms) - OPFS hydration, refresh QueryClient
     * Phase 2:   CozoDB (~1200ms) - WASM init, snapshot restore, graph ready
     * Phase 3:   Background (fire & forget) - sync, scanner hydration, cache updates
     */
    async boot() {
        if (this.state !== 'idle') {
            console.warn(`[AppOrchestrator] Connect called but state is ${this.state}`);
            return;
        }

        this.setState('booting');
        console.group('🚀 [AppOrchestrator] Boot Sequence Initiated');

        try {
            await this.phase0_Runtime();
            this.phase05_FastBoot(); // Synchronous - UI can paint after this
            await this.phase1_NebulaDB(); // Fast OPFS hydration
            await this.phase2_CozoCore(); // Heavy WASM + graph
            this.phase3_Background(); // Fire and forget

            this.setState('ready');
            console.log('✨ [AppOrchestrator] System Ready');
        } catch (e) {
            this.setState('error');
            console.error('💥 [AppOrchestrator] Boot Failed', e);
        } finally {
            console.groupEnd();
        }
    }

    /**
     * Phase 0: Runtime Verification & Preloading
     * - Immediate environment checks
     * - Start WASM preload (fire-and-forget)
     * - Entity colors
     */
    private async phase0_Runtime() {
        console.time('Step 0: Runtime');
        console.log('Step 0: Runtime checks & preloading...');

        // 1. Environment check
        if (typeof window === 'undefined') {
            throw new Error('AppOrchestrator must run in a browser/window environment');
        }

        // 2. Entity Color Store (Sync/Fast - needed for UI paint)
        entityColorStore.initialize();
        console.log('[EntityColorStore] Initialized (Phase 0)');

        // 3. Start CozoDB WASM preload (fire-and-forget, overlaps with next phases)
        cozoDb.preload();
        console.log('[CozoDB] WASM preload started (Phase 0)');

        console.timeEnd('Step 0: Runtime');
    }


    /**
     * Phase 0.5: Fast Boot (Optimistic Cache)
     * - NebulaDB boot cache → QueryClient (notes, folders for sidebar)
     * - Cozo boot cache → GraphHotCache (entities for scanner)
     * - UI CAN RENDER after this phase completes
     */
    private phase05_FastBoot() {
        console.time('Step 0.5: FastBoot');

        // 1. NebulaDB Boot Cache (Notes, Folders) → QueryClient
        const nebulaCache = loadNebulaBootCache();
        if (nebulaCache) {
            console.log(`[AppOrchestrator] Fast Boot: Hydrating ${nebulaCache.notes.length} notes, ${nebulaCache.folders.length} folders from NebulaDB cache`);

            // Set QueryClient data so UI can render immediately
            queryClient.setQueryData(noteKeys.all, nebulaCache.notes as any[]);
            queryClient.setQueryData(folderKeys.all, nebulaCache.folders as any[]);

            if (nebulaCache.lastOpenNote) {
                queryClient.setQueryData(noteKeys.detail(nebulaCache.lastOpenNote.id), nebulaCache.lastOpenNote as any);
                console.log(`[AppOrchestrator] Fast Boot: Hydrated active note ${nebulaCache.lastOpenNote.id}`);
            }
        }

        // 2. Cozo Boot Cache (Entities) → GraphHotCache
        const cozoCache = loadCozoBootCache();
        if (cozoCache && cozoCache.entities.length > 0) {
            console.log(`[AppOrchestrator] Fast Boot: Pre-warming GraphHotCache with ${cozoCache.entities.length} entities`);
            graphHotCache.warmFromBootCache(cozoCache.entities);
        }

        // 3. Rust Cozo Boot Cache (for optimistic display)
        const rustCache = loadRustCozoBootCache();
        if (rustCache && rustCache.nodeCount > 0) {
            console.log(`[AppOrchestrator] Fast Boot: Rust Cozo cache has ${rustCache.nodeCount} nodes`);
            this.rustCozoPreloaded = true;
        }

        // 4. Start KittCore early (non-blocking)!
        this.kittCoreInitPromise = kittCore.init();
        console.log('[AppOrchestrator] Fast Boot: KittCore init started (non-blocking)');

        console.timeEnd('Step 0.5: FastBoot');
    }

    /**

     * Phase 1: NebulaDB (Fast Connection)
     * - Connect to NebulaDB (Memory Adapter setup)
     * - NO Hydration here (wait for Cozo)
     * - This should be <5ms
     */
    private async phase1_NebulaDB() {
        console.time('Step 1: NebulaDB');
        console.log('Step 1: NebulaDB Connection...');

        // Connect nebulaDb (Memory only now)
        await nebulaDb.connect();

        console.timeEnd('Step 1: NebulaDB');
    }

    /**
     * Phase 2: CozoDB Core + Hydration (Blocking Persistence)
     * - Database (CozoDB - WASM should be preloaded)
     * - Registry (Graph)
     * - EntityAttributeStore
     * - NebulaDB Hydration (Now that Cozo is ready)
     */
    private async phase2_CozoCore() {
        console.time('Step 2: CozoDB Core');
        console.log('Step 2: Initializing CozoDB Core Data Layer...');

        // [KittCore Integration] - MUST complete BEFORE registry init
        // This ensures OPFS entities are loaded so warmCache() sees them
        if (this.kittCoreInitPromise) {
            await this.kittCoreInitPromise;
            console.log('[AppOrchestrator] KittCore ready (started in Phase 0.5)');
        }

        // Smart Graph Registry (and underlying CozoDB)
        // Now kittCore has loaded OPFS snapshot, so warmCache() will see entities
        console.log('Initializing Graph Registry...');
        await smartGraphRegistry.init();


        // When using Rust backend, skip TS CozoDB check (Rust handles DB)
        if (USE_RUST_COZO_BACKEND) {
            console.log('[AppOrchestrator] Rust CozoDB backend active - skipping TS CozoDB check');
        } else {
            // Legacy: Check TS CozoDB is ready
            if (!cozoDb.isReady()) {
                throw new Error('CozoDB failed to initialize via Registry');
            }
        }

        // Get fresh stats
        const stats = await smartGraphRegistry.getStats();
        console.log(`[AppOrchestrator] Graph Ready with ${stats.totalEntities} entities`);

        // Initialize EntityAttributeStore (requires Cozo to be ready)
        await entityAttributeStore.init();
        console.log('[AppOrchestrator] EntityAttributeStore initialized');

        // Phase 2.5: Hydrate NebulaDB from storage
        // NOTE: Rust backend handles ENTITIES, but NebulaDB still stores NOTES
        // So we always hydrate NebulaDB for notes, regardless of backend
        console.log('[AppOrchestrator] Phase 2.5: Hydrating NebulaDB...');
        const adapter = nebulaDb.adapter as any;
        if (typeof adapter.hydrate === 'function') {
            await adapter.hydrate();

            // Refresh QueryClient with live notes now that we are hydrated
            const liveNotes = await notes.find({ status: 'active' });
            if (liveNotes.length > 0) {
                console.log(`[AppOrchestrator] Hydration Complete: Updating QueryClient with ${liveNotes.length} notes`);
                queryClient.setQueryData(noteKeys.all, liveNotes as any[]);
            }
        }

        // Hydrate DAFSA scanner with registry entities for implicit matching
        const entities = smartGraphRegistry.getAllEntities();
        const kittCoreEntities = entities.map(e => ({
            id: e.id,
            label: e.label,
            kind: e.kind,
            aliases: e.aliases ?? [],
        }));

        const hydratedCount = await kittCore.hydrateEntities(kittCoreEntities);
        console.log(`[AppOrchestrator] KittCore hydrated with ${hydratedCount} entities`);


        console.timeEnd('Step 2: CozoDB Core');
    }

    /**
     * Phase 3: Background (Fire & Forget)
     * - Cozo ↔ NebulaDB sync
     * - Scanner hydration (ImplicitScanner + KittCore)
     * - Update boot caches for next startup
     */
    private phase3_Background() {
        console.log('Step 3: Background Tasks (Fire & Forget)...');

        setTimeout(async () => {
            try {
                // 1. Sync orchestrator
                // QUARANTINED: When Rust backend active, skip legacy TS Cozo sync
                if (!USE_RUST_COZO_BACKEND) {
                    await syncOrchestrator.init();
                    console.log('[AppOrchestrator] SyncOrchestrator initialized (NebulaDB ↔ TS Cozo)');
                } else {
                    console.log('[AppOrchestrator] SyncOrchestrator skipped (Rust backend active)');
                }

                // 1.5: Sync Rust CozoDB → NebulaDB (always active when Rust backend is on)
                if (USE_RUST_COZO_BACKEND) {
                    try {
                        const { nebulaSync } = await import('../nebulaSync');
                        const syncResult = await nebulaSync.syncFromRust();
                        console.log(`[AppOrchestrator] Rust Cozo → NebulaDB sync: ${syncResult.nodeCount} nodes, ${syncResult.edgeCount} edges`);
                    } catch (syncErr) {
                        console.warn('[AppOrchestrator] Rust Cozo sync skipped (not yet populated):', syncErr);
                    }
                }


                // 2. Scanner hydration
                const entities = smartGraphRegistry.getAllEntities();
                const scannerEntities = entities.map(e => ({
                    id: e.id,
                    label: e.label,
                    kind: e.kind,
                    aliases: e.aliases,
                    originNoteId: e.firstNote,
                    registeredAt: e.createdAt.getTime(),
                }));

                console.log(`[AppOrchestrator] Hydrating Scanner with ${scannerEntities.length} entities...`);
                // implicitScanner.hydrate(scannerEntities, entityVersion); // DEPRECATED

                // 3. KittCore WASM scanner hydration (MOVED TO PHASE 2) - Removed legacy comment

                // 4. Update Cozo boot cache with fresh data for next boot
                const relationships = smartGraphRegistry.getAllEdges();
                const freshCozoCache = buildCozoBootCache(
                    entities.map(e => ({
                        id: e.id,
                        label: e.label,
                        kind: e.kind,
                        subtype: e.subtype,
                        aliases: e.aliases,
                    })),
                    relationships.length
                );
                saveCozoBootCache(freshCozoCache);
                console.log(`[AppOrchestrator] Updated Cozo boot cache (${entities.length} entities)`);

                // 5. Update Rust Cozo boot cache
                try {
                    const rustExport = await kittCore.cozoExport();
                    if (rustExport) {
                        const rustData = JSON.parse(rustExport);
                        const rustEntities = (rustData.nodes?.rows || []).map((r: any[]) => ({
                            id: r[0], label: r[1], kind: r[2]
                        }));
                        const edgeCount = rustData.edges?.rows?.length || 0;
                        saveRustCozoBootCache(rustEntities, edgeCount);
                    }
                } catch (e) {
                    console.warn('[AppOrchestrator] Failed to save Rust Cozo boot cache:', e);
                }

                // 5. Invalidate QueryClient to ensure UI gets CozoDB-backed data
                // This triggers a refetch from the storage layer (which now uses CozoDB)
                await queryClient.invalidateQueries({ queryKey: noteKeys.all });
                await queryClient.invalidateQueries({ queryKey: folderKeys.all });

            } catch (err) {
                console.error('[AppOrchestrator] Background tasks failed:', err);
            }
        }, 50);
    }
}

export const appOrchestrator = AppOrchestrator.getInstance();
