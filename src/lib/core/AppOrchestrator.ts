import { entityColorStore } from '../store/entityColorStore';
import { entityAttributeStore } from '../store/entityAttributeStore';
import { smartGraphRegistry } from '../registry';
import { queryClient } from '@/lib/queryClient';
import { noteKeys } from '@/hooks/useNotes';
import { folderKeys } from '@/hooks/useFolders';
import { db as dexieDb } from '@/lib/dexie/db';
import { hydrateFromCozo } from '@/lib/dexie/operations';
import { kittCore } from '../kittcore';

// LEGACY REMOVED: USE_RUST_COZO_BACKEND flag - Rust is now the only backend

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
     * Phase 1:   Dexie (~50-100ms) - IndexedDB hydration, refresh QueryClient
     * Phase 2:   CozoDB (~1200ms) - WASM init, snapshot restore, graph ready
     * Phase 3:   Background (fire & forget) - sync, scanner hydration, cache updates
     */
    async boot() {
        if (this.state !== 'idle') {
            console.warn(`[AppOrchestrator] Connect called but state is ${this.state} `);
            return;
        }

        this.setState('booting');
        console.group('🚀 [AppOrchestrator] Boot Sequence Initiated');

        try {
            await this.phase0_Runtime();
            this.phase05_FastBoot(); // Synchronous - localStorage caches
            await this.phase1_Dexie(); // Load from IndexedDB - UI IS READY AFTER THIS

            // UI is now interactive - set ready BEFORE Rust loads
            this.setState('ready');
            console.log('✨ [AppOrchestrator] UI Ready (Dexie)');

            // Phase 2 is now non-blocking - Rust loads in background
            this.phase2_CozoCore().catch(e => console.error('[AppOrchestrator] Phase 2 error:', e));
            this.phase3_Background(); // Fire and forget

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

        // LEGACY REMOVED: TS CozoDB preload (Rust backend handles DB now)
        // cozoDb.preload();
        // console.log('[CozoDB] WASM preload started (Phase 0)');

        console.timeEnd('Step 0: Runtime');
    }


    /**
     * Phase 0.5: Fast Boot (Start KittCore)
     * - Start KittCore WASM initialization non-blocking
     * - This runs in parallel while we load Dexie
     */
    private phase05_FastBoot() {
        console.time('Step 0.5: FastBoot');

        // Start KittCore early (non-blocking) - runs in parallel with Dexie load
        this.kittCoreInitPromise = kittCore.init();
        console.log('[AppOrchestrator] Fast Boot: KittCore init started (non-blocking)');

        console.timeEnd('Step 0.5: FastBoot');
    }

    /**
     * Phase 1: Dexie Hydration (Fast UI Ready)
     * - Load notes and folders from IndexedDB
     * - Populate QueryClient for immediate UI render
     * - This should be < 100ms
     */
    private async phase1_Dexie() {
        console.time('Step 1: Dexie Hydration');
        console.log('Step 1: Loading data from Dexie (IndexedDB)...');

        try {
            // Query Dexie for notes and folders
            const notes = await dexieDb.notes.orderBy('updatedAt').reverse().toArray();
            const folders = await dexieDb.folders.toArray();

            // Hydrate QueryClient so UI can render immediately
            if (notes.length > 0) {
                queryClient.setQueryData(noteKeys.all, notes);
            }
            if (folders.length > 0) {
                queryClient.setQueryData(folderKeys.all, folders);
            }

            console.log(`[AppOrchestrator] Dexie loaded: ${notes.length} notes, ${folders.length} folders`);
        } catch (err) {
            console.warn('[AppOrchestrator] Dexie hydration failed:', err);
            // Not fatal - Rust CozoDB will have the data
        }

        console.timeEnd('Step 1: Dexie Hydration');
    }

    /**
     * Phase 2: CozoDB Core + Hydration (Blocking Persistence)
     * - Database (CozoDB - WASM should be preloaded)
     * - Registry (Graph)
     * - EntityAttributeStore
     * - Dexie Hydration (Now that Cozo is ready)
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


        // LEGACY REMOVED: TS CozoDB readiness check (Rust backend handles DB)
        console.log('[AppOrchestrator] Rust CozoDB backend active - TS Cozo skipped');

        // Get fresh stats
        const stats = await smartGraphRegistry.getStats();
        console.log(`[AppOrchestrator] Graph Ready with ${stats.totalEntities} entities`);

        // Initialize EntityAttributeStore (requires Cozo to be ready)
        await entityAttributeStore.init();
        console.log('[AppOrchestrator] EntityAttributeStore initialized');

        // Phase 2.5: Hydrate Dexie from storage
        // Hydrate Dexie from Rust Cozo (entities only - notes are in Dexie already)
        console.log('[AppOrchestrator] Phase 2.5: Hydrating Dexie from Rust...');
        await hydrateFromCozo();

        // Refresh QueryClient with live notes now that we are hydrated
        // Dexie is live, but we can pre-fetch to warm query cache if needed
        // For now, Dexie hooks will handle it
        console.log('[AppOrchestrator] Hydration Phase Complete');

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

        // Refresh registry cache to pick up entities pushed to CozoDB during hydration
        await smartGraphRegistry.refresh();
        console.log(`[AppOrchestrator] Registry refreshed after hydration`);

        console.timeEnd('Step 2: CozoDB Core');
    }

    /**
     * Phase 3: Background (Fire & Forget)
     * - Invalidate QueryClient to trigger refetch from Dexie
     * - Future: entity sync, scanner updates
     */
    private phase3_Background() {
        console.log('Step 3: Background Tasks (Fire & Forget)...');

        setTimeout(async () => {
            try {
                // Invalidate QueryClient to ensure UI gets fresh data from Dexie
                await queryClient.invalidateQueries({ queryKey: noteKeys.all });
                await queryClient.invalidateQueries({ queryKey: folderKeys.all });
                console.log('[AppOrchestrator] Background: QueryClient invalidated');

            } catch (err) {
                console.error('[AppOrchestrator] Background tasks failed:', err);
            }
        }, 50);
    }
}

export const appOrchestrator = AppOrchestrator.getInstance();
