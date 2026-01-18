/**
 * Note Switch Performance Instrumentation
 * 
 * Measures time from note click to editor ready
 */

interface NoteSwitchMetrics {
    noteId: string;
    startTime: number;
    endTime?: number;
    duration?: number;
}

// Current switch being measured
let currentSwitch: NoteSwitchMetrics | null = null;

// History of recent switches for analysis
const switchHistory: NoteSwitchMetrics[] = [];
const MAX_HISTORY = 20;

/**
 * Mark the start of a note switch
 */
export function markNoteSwitchStart(noteId: string): void {
    // End any previous incomplete switch
    if (currentSwitch && !currentSwitch.endTime) {
        console.warn('[NotePerf] Previous switch incomplete, overwriting');
    }

    currentSwitch = {
        noteId,
        startTime: performance.now(),
    };

    performance.mark(`note_switch_start_${noteId}`);
    console.log(`[NotePerf] 🟡 Switch started → ${noteId}`);
}

/**
 * Mark the end of a note switch (editor fully initialized)
 */
export function markNoteSwitchEnd(noteId: string): void {
    if (!currentSwitch || currentSwitch.noteId !== noteId) {
        // Might be from initial load, not a switch
        console.log(`[NotePerf] Editor ready (initial load or mismatch): ${noteId}`);
        return;
    }

    currentSwitch.endTime = performance.now();
    currentSwitch.duration = currentSwitch.endTime - currentSwitch.startTime;

    performance.mark(`note_switch_end_${noteId}`);

    try {
        performance.measure(
            `note_switch_${noteId}`,
            `note_switch_start_${noteId}`,
            `note_switch_end_${noteId}`
        );
    } catch {
        // Marks might not exist
    }

    const duration = currentSwitch.duration;
    const status = duration > 100 ? '🔴' : duration > 50 ? '🟡' : '🟢';

    console.log(
        `[NotePerf] ${status} Switch complete → ${noteId} in ${duration.toFixed(1)}ms`
    );

    // Store in history
    switchHistory.push({ ...currentSwitch });
    if (switchHistory.length > MAX_HISTORY) {
        switchHistory.shift();
    }

    currentSwitch = null;
}

/**
 * Get switch metrics for analysis
 */
export function getNoteSwitchStats(): {
    count: number;
    avgDuration: number;
    maxDuration: number;
    p95Duration: number;
} {
    const completed = switchHistory.filter(s => s.duration != null);
    if (completed.length === 0) {
        return { count: 0, avgDuration: 0, maxDuration: 0, p95Duration: 0 };
    }

    const durations = completed.map(s => s.duration!).sort((a, b) => a - b);
    const sum = durations.reduce((a, b) => a + b, 0);
    const p95Index = Math.floor(durations.length * 0.95);

    return {
        count: completed.length,
        avgDuration: sum / completed.length,
        maxDuration: durations[durations.length - 1],
        p95Duration: durations[p95Index] || durations[durations.length - 1],
    };
}

/**
 * Log summary to console
 */
export function logNoteSwitchSummary(): void {
    const stats = getNoteSwitchStats();
    console.log('[NotePerf] === Switch Summary ===');
    console.log(`  Switches: ${stats.count}`);
    console.log(`  Avg: ${stats.avgDuration.toFixed(1)}ms`);
    console.log(`  Max: ${stats.maxDuration.toFixed(1)}ms`);
    console.log(`  P95: ${stats.p95Duration.toFixed(1)}ms`);
}

// Expose to window for debugging
if (typeof window !== 'undefined') {
    (window as any).noteSwitchPerf = {
        getStats: getNoteSwitchStats,
        logSummary: logNoteSwitchSummary,
        getHistory: () => [...switchHistory],
    };
}
