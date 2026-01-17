import { entityColorStore } from '../store/entityColorStore';
import { smartGraphRegistry } from '../registry/SmartGraphRegistry';
import { cozoDb } from '../cozo/db';
import { implicitScanner } from '../Scanner/ImplicitScanner';
import { queryClient } from '@/lib/queryClient';
import { loadBootCache } from '@/lib/storage/bootCache';
import { loadCozoBootCache, saveCozoBootCache, buildCozoBootCache } from '@/lib/storage/cozoBootCache';
import { noteKeys } from '@/hooks/useNotes';
import { folderKeys } from '@/hooks/useFolders';

export class AppOrchestrator {
    private static instance: AppOrchestrator;
    private state: 'idle' | 'booting' | 'ready' | 'error' = 'idle';

    private listeners = new Set<(state: string) => void>();

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
            this.phase05_FastBoot(); // Synchronous (mostly) / Fast
            await this.phase1_Core();
            await this.phase2_Reconciliation();
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
     * - Load NebulaDB sidebar state from localStorage
     * - Load Cozo entity cache from localStorage
     * - Hydrate QueryClient so UI renders before DB is ready
     */
    private phase05_FastBoot() {
        console.time('Step 0.5: FastBoot');

        // 1. NebulaDB Boot Cache (Notes, Folders)
        const nebulaCache = loadBootCache();
        if (nebulaCache) {
            console.log(`[AppOrchestrator] Fast Boot: Hydrating ${nebulaCache.notes.length} notes, ${nebulaCache.folders.length} folders`);
            queryClient.setQueryData(noteKeys.all, nebulaCache.notes as any[]);
            queryClient.setQueryData(folderKeys.all, nebulaCache.folders);

            if (nebulaCache.lastOpenNote) {
                queryClient.setQueryData(noteKeys.detail(nebulaCache.lastOpenNote.id), nebulaCache.lastOpenNote);
                console.log(`[AppOrchestrator] Fast Boot: Hydrated active note ${nebulaCache.lastOpenNote.id}`);
            }
        }

        // 2. Cozo Boot Cache (Entities)
        const cozoCache = loadCozoBootCache();
        if (cozoCache && cozoCache.entities.length > 0) {
            console.log(`[AppOrchestrator] Fast Boot: ${cozoCache.entities.length} cached entities available`);
            // Note: We can't directly hydrate SmartGraphRegistry here because it's not initialized yet.
            // The cache is used for UI hints (e.g., entity count in loading screen).
            // After Phase 1, we reconcile.
        }

        console.timeEnd('Step 0.5: FastBoot');
    }

    /**
     * Phase 1: Core Data Layer (Blocking)
     * - Database (CozoDB - WASM should be preloaded)
     * - Registry (Graph)
     */
    private async phase1_Core() {
        console.time('Step 1: Core');
        console.log('Step 1: Initializing Core Data Layer...');

        // Smart Graph Registry (and underlying CozoDB)
        // CozoDB.init() will await the preload if started
        console.log('Initializing Graph Registry...');
        await smartGraphRegistry.init();

        if (!cozoDb.isReady()) {
            throw new Error('CozoDB failed to initialize via Registry');
        }

        console.timeEnd('Step 1: Core');
    }

    /**
     * Phase 2: Reconciliation & Services
     * - Verify Graph readiness
     * - Update Cozo boot cache with fresh data
     */
    private async phase2_Reconciliation() {
        console.time('Step 2: Reconciliation');
        console.log('Step 2: Reconciliation & Services...');

        // Get fresh stats
        const stats = await smartGraphRegistry.getStats();
        console.log(`[AppOrchestrator] Graph Ready with ${stats.totalEntities} entities`);

        // Update Cozo boot cache with fresh data for next boot
        const entities = smartGraphRegistry.getAllEntities();
        const relationships = smartGraphRegistry.getAllEdges();

        const freshCache = buildCozoBootCache(
            entities.map(e => ({
                id: e.id,
                label: e.label,
                kind: e.kind,
                subtype: e.subtype,
                aliases: e.aliases,
            })),
            relationships.length
        );
        saveCozoBootCache(freshCache);
        console.log(`[AppOrchestrator] Updated Cozo boot cache (${entities.length} entities)`);

        console.timeEnd('Step 2: Reconciliation');
    }

    /**
     * Phase 3: Hydration & Background (Lazy)
     * - Scanner hydration
     * - Indexing
     */
    private phase3_Background() {
        console.log('Step 3: Background Tasks (Fire & Forget)...');

        // Hydrate Implicit Scanner
        setTimeout(() => {
            try {
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
                implicitScanner.hydrate(scannerEntities);
            } catch (err) {
                console.error('[AppOrchestrator] Background hydration failed:', err);
            }
        }, 100);
    }
}

export const appOrchestrator = AppOrchestrator.getInstance();

