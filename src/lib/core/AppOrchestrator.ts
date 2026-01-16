import { entityColorStore } from '../store/entityColorStore';
import { smartGraphRegistry } from '../registry/SmartGraphRegistry';
// We import the implementation directly to ensure low-level readiness if needed, 
// though smartGraphRegistry handles most.
import { cozoDb } from '../cozo/db';
import { implicitScanner } from '../Scanner/ImplicitScanner';

export class AppOrchestrator {
    private static instance: AppOrchestrator;
    private state: 'idle' | 'booting' | 'ready' | 'error' = 'idle';

    // Singleton access
    static getInstance(): AppOrchestrator {
        if (!AppOrchestrator.instance) {
            AppOrchestrator.instance = new AppOrchestrator();
        }
        return AppOrchestrator.instance;
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

        this.state = 'booting';
        console.group('🚀 [AppOrchestrator] Boot Sequence Initiated');

        try {
            await this.phase0_Runtime();
            await this.phase1_Core();
            await this.phase2_Services();
            this.phase3_Background(); // Fire and forget

            this.state = 'ready';
            console.log('✨ [AppOrchestrator] System Ready');
        } catch (e) {
            this.state = 'error';
            console.error('💥 [AppOrchestrator] Boot Failed', e);
        } finally {
            console.groupEnd();
        }
    }

    /**
     * Phase 0: Runtime Verification
     * - Immediate environment checks
     * - Config validation
     */
    private async phase0_Runtime() {
        console.log('Step 0: Runtime checks...');
        // Placeholder for future Tauri/Browser checks
        if (typeof window === 'undefined') {
            throw new Error('AppOrchestrator must run in a browser/window environment');
        }
    }

    /**
     * Phase 1: Core Data Layer (Blocking)
     * - Stores (Colors)
     * - Database (CozoDB)
     * - Registry (Graph)
     */
    private async phase1_Core() {
        console.time('Step 1: Core');
        console.log('Step 1: Initializing Core Data Layer...');

        // 1. Entity Color Store (Sync/Fast - needed for UI paint)
        entityColorStore.initialize();

        // 2. Smart Graph Registry (and underlying CozoDB)
        console.log('Initializing Graph Registry...');
        await smartGraphRegistry.init();

        if (!cozoDb.isReady()) {
            throw new Error('CozoDB failed to initialize via Registry');
        }

        console.timeEnd('Step 1: Core');
    }

    /**
     * Phase 2: Services & Logic (Non-Blocking / Async)
     * - High-level services that depend on Core
     */
    private async phase2_Services() {
        console.time('Step 2: Services');
        console.log('Step 2: Starting Services...');

        // Verify Graph Readiness
        const stats = await smartGraphRegistry.getStats();
        console.log(`[AppOrchestrator] Graph Ready with ${stats.totalEntities} entities`);

        console.timeEnd('Step 2: Services');
    }

    /**
     * Phase 3: Hydration & Background (Lazy)
     * - Massive data loading
     * - Indexing
     * - Scanner inputs
     */
    private phase3_Background() {
        console.log('Step 3: Background Tasks (Fire & Forget)...');

        // 1. Hydrate Implicit Scanner (Batch)
        // We do this here instead of inside SmartGraphRegistry.init to avoid blocking Phase 1
        setTimeout(() => {
            try {
                const entities = smartGraphRegistry.getAllEntities();
                // We need to map these to ScannerEntity format
                // Since SmartGraphRegistry Facade doesn't expose the converter publicly,
                // we recreate the simple mapping here or rely on hydrate()'s expected type.
                // The implicit scanner expects RegisteredEntity (Scanner type).

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
        }, 100); // Small delay to let UI breathe
    }
}

export const appOrchestrator = AppOrchestrator.getInstance();
