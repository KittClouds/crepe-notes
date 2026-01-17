# Architecture Plan: Centralized App Orchestration

## 1. Problem Statement
The current application initialization is fragmented ("haphazard"). Console logs reveal:
- **Redundant Initializations:** `AllProfanity` dictionaries load multiple times.
- **Race Conditions:** Components start before their dependencies (e.g., Scanners interacting with Graph before it's ready).
- **Log Noise:** Hundreds of incremental updates from `ImplicitScanner` hydration.
- **Scattered Logic:** Initialization Code exists in `main.tsx`, module scope, and disparate `init()` calls.

## 2. Objective
Implement an `AppOrchestrator` to enforce a deterministic, phased startup sequence. This ensures:
1.  **Core Systems** (DBs, Stores) maximize readiness.
2.  **Services** (Graph, NLP) initialize only when dependencies are ready.
3.  **Background Tasks** (Indexing, Hydration) run only after the UI is interactive.

## 3. Proposed Architecture: The "Boot Sequence"

We will define 4 distinct phases of application startup:

### Phase 0: Runtime Environment (Immediate)
*   **Goal:** Setup identifying information and critical globals.
*   **Actions:**
    *   Verify Environment (Browser vs Tauri).
    *   Initialize Error Logging / Telemetry (if any).

### Phase 1: Core Data Layer (Blocking)
*   **Goal:** Ensure data persistence is active before any logic runs.
*   **Actions:**
    *   Initialize `EntityColorStore` (CSS variables needed for first paint).
    *   Initialize `CozoDbService` (WASM load).
    *   Initialize `GraphRegistry` (Schema verification).

### Phase 2: Services & Logic (Non-Blocking / Async)
*   **Goal:** Start the "Brain" of the application.
*   **Actions:**
    *   Initialize `SmartGraphRegistry` (Facade verify).
    *   Initialize `ImplicitScanner` (Load dictionaries).

### Phase 3: Hydration & Background (Lazy)
*   **Goal:** Populate caches without freezing the UI.
*   **Actions:**
    *   Hydrate `ImplicitScanner` with entities from `GraphRegistry` (Batch mode).
    *   Run initial indexing/stats collection.

## 4. Implementation Details

### A. The Orchestrator Class (`src/lib/core/AppOrchestrator.ts`)
A singleton class managing the state machine of startup.

```typescript
export class AppOrchestrator {
    private state: 'idle' | 'booting' | 'ready' | 'error' = 'idle';

    async boot() {
        if (this.state !== 'idle') return;
        this.state = 'booting';

        try {
            await this.phase1_Core();
            await this.phase2_Services();
            this.phase3_Background(); // Fire and forget
            
            this.state = 'ready';
            console.log('🚀 App Orchestrator: System Ready');
        } catch (e) {
            this.state = 'error';
            console.error('💥 App Orchestrator: Boot Failed', e);
        }
    }
    // ... phases methods
}
```

### B. Optimizing `ImplicitScanner`
The logs show hundreds of "Loaded X words" messages. This suggests `hydrate()` is being called inside a loop or reacting to individual events during startup.
*   **Fix:** Ensure `SmartGraphRegistry` passes *all* entities to `hydrate()` in a single batch call during **Phase 3**.

### C. Refactoring `main.tsx`
`main.tsx` currently calls `smartGraphRegistry.init()`. This will be replaced by `appOrchestrator.boot()`.

## 5. Migration Steps

1.  **Create Directory**: `src/lib/core/` for the Orchestrator.
2.  **Create Orchestrator**: Implement the class with the phased logic.
3.  **Refactor SmartGraph**: Ensure `SmartGraphRegistry.init()` doesn't auto-trigger scanner hydration if handled by Orchestrator.
4.  **Update Main**: Switch entry point to use Orchestrator.
5.  **Verify**: Check console logs for a clean, ordered sequence.

## 6. Success Criteria
*   Console logs show distinct phases: `[Phase 1] Core...`, `[Phase 2] Services...`.
*   "Loaded words" messages appear *once* or are batched.
*   No "CozoDB not ready" errors.
