/**
 * AudioQueuePlayer
 * 
 * Seamless audio playback using Web Audio API.
 * Schedules audio buffers for gapless playback.
 */

export class AudioQueuePlayer {
    private ctx: AudioContext | null = null;
    private nextStartTime = 0;
    private sources: AudioBufferSourceNode[] = [];
    private isPaused = false;
    private pausedAt = 0;

    /**
     * Get or create AudioContext (lazy init to avoid autoplay issues)
     */
    private getContext(): AudioContext {
        if (!this.ctx || this.ctx.state === 'closed') {
            this.ctx = new AudioContext();
            this.nextStartTime = 0;
        }
        return this.ctx;
    }

    /**
     * Enqueue WAV bytes for playback.
     * Decodes and schedules for seamless playback.
     */
    async enqueueWavBytes(wavBytes: ArrayBuffer): Promise<void> {
        const ctx = this.getContext();

        // Resume if suspended (browser autoplay policy)
        if (ctx.state === 'suspended') {
            await ctx.resume();
        }

        if (this.isPaused) {
            return; // Don't schedule while paused
        }

        // Decode the WAV data
        const audioBuffer = await ctx.decodeAudioData(wavBytes.slice(0));

        // Create source node
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);

        // Schedule playback
        const now = ctx.currentTime;
        const startAt = Math.max(now + 0.05, this.nextStartTime);
        source.start(startAt);

        // Track for cleanup
        this.sources.push(source);
        source.onended = () => {
            const idx = this.sources.indexOf(source);
            if (idx !== -1) this.sources.splice(idx, 1);
        };

        // Update next start time for seamless playback
        this.nextStartTime = startAt + audioBuffer.duration;
    }

    /**
     * Pause playback (suspends audio context)
     */
    async pause(): Promise<void> {
        if (this.ctx && this.ctx.state === 'running') {
            this.pausedAt = this.ctx.currentTime;
            await this.ctx.suspend();
            this.isPaused = true;
        }
    }

    /**
     * Resume playback
     */
    async resume(): Promise<void> {
        if (this.ctx && this.ctx.state === 'suspended') {
            await this.ctx.resume();
            this.isPaused = false;
        }
    }

    /**
     * Get whether currently paused
     */
    get paused(): boolean {
        return this.isPaused;
    }

    /**
     * Stop all playback and clear queue
     */
    async stop(): Promise<void> {
        // Stop all active sources
        for (const source of this.sources) {
            try {
                source.stop();
                source.disconnect();
            } catch {
                // Ignore if already stopped
            }
        }
        this.sources = [];

        // Close and recreate context for clean state
        if (this.ctx) {
            try {
                await this.ctx.close();
            } catch {
                // Ignore close errors
            }
            this.ctx = null;
        }

        this.nextStartTime = 0;
        this.isPaused = false;
        this.pausedAt = 0;
    }

    /**
     * Get approximate current playback position in seconds
     */
    get currentTime(): number {
        if (!this.ctx) return 0;
        return this.ctx.currentTime;
    }

    /**
     * Check if audio is currently playing
     */
    get isPlaying(): boolean {
        return this.ctx !== null &&
            this.ctx.state === 'running' &&
            this.sources.length > 0;
    }
}

// Export singleton instance
export const audioPlayer = new AudioQueuePlayer();
