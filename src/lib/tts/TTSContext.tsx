/**
 * TTS Context
 * 
 * React Context for managing TTS state.
 * Completely isolated from note store (uses React Context only).
 */

import React, {
    createContext,
    useContext,
    useReducer,
    useCallback,
    useRef,
    useEffect,
    type ReactNode,
} from 'react';
import { ChunkerCore, type Chunk } from '@/lib/chunking';
import { audioPlayer } from './playerEngine';
import type { InMsg, OutMsg } from '@/workers/tts.worker';

// ============================================================================
// Types
// ============================================================================

export type TTSStatus =
    | 'idle'
    | 'loading-model'
    | 'synthesizing'
    | 'playing'
    | 'paused'
    | 'error';

interface TTSState {
    status: TTSStatus;
    progress: number; // 0-100 for model loading, chunk progress for playback
    currentChunkIndex: number;
    totalChunks: number;
    errorMessage: string | null;
    modelReady: boolean;
}

type TTSAction =
    | { type: 'SET_STATUS'; status: TTSStatus }
    | { type: 'SET_PROGRESS'; progress: number }
    | { type: 'SET_CHUNK_PROGRESS'; current: number; total: number }
    | { type: 'SET_ERROR'; message: string }
    | { type: 'CLEAR_ERROR' }
    | { type: 'MODEL_READY' }
    | { type: 'RESET' };

interface TTSContextValue {
    state: TTSState;
    play: (text: string, language?: string) => Promise<void>;
    pause: () => Promise<void>;
    resume: () => Promise<void>;
    stop: () => Promise<void>;
    initModel: () => Promise<void>;
}

// ============================================================================
// Reducer
// ============================================================================

const initialState: TTSState = {
    status: 'idle',
    progress: 0,
    currentChunkIndex: 0,
    totalChunks: 0,
    errorMessage: null,
    modelReady: false,
};

function reducer(state: TTSState, action: TTSAction): TTSState {
    switch (action.type) {
        case 'SET_STATUS':
            return { ...state, status: action.status, errorMessage: null };
        case 'SET_PROGRESS':
            return { ...state, progress: action.progress };
        case 'SET_CHUNK_PROGRESS':
            return { ...state, currentChunkIndex: action.current, totalChunks: action.total };
        case 'SET_ERROR':
            return { ...state, status: 'error', errorMessage: action.message };
        case 'CLEAR_ERROR':
            return { ...state, errorMessage: null };
        case 'MODEL_READY':
            return { ...state, modelReady: true, status: 'idle' };
        case 'RESET':
            return { ...initialState, modelReady: state.modelReady };
        default:
            return state;
    }
}

// ============================================================================
// Context
// ============================================================================

const TTSContext = createContext<TTSContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface TTSProviderProps {
    children: ReactNode;
}

export function TTSProvider({ children }: TTSProviderProps) {
    const [state, dispatch] = useReducer(reducer, initialState);
    const workerRef = useRef<Worker | null>(null);
    const jobIdRef = useRef<string>('');
    const chunksRef = useRef<Chunk[]>([]);
    const currentChunkIdxRef = useRef(0);

    // Initialize worker
    useEffect(() => {
        const worker = new Worker(
            new URL('@/workers/tts.worker.ts', import.meta.url),
            { type: 'module' }
        );

        worker.onmessage = (ev: MessageEvent<OutMsg>) => {
            const msg = ev.data;

            switch (msg.type) {
                case 'TTS_READY':
                    dispatch({ type: 'MODEL_READY' });
                    break;

                case 'TTS_PROGRESS':
                    dispatch({ type: 'SET_PROGRESS', progress: msg.progress * 100 });
                    break;

                case 'TTS_AUDIO':
                    // Enqueue audio for playback
                    audioPlayer.enqueueWavBytes(msg.wavBytes).then(() => {
                        dispatch({ type: 'SET_STATUS', status: 'playing' });

                        // Request next chunk
                        const nextIdx = msg.chunkIndex + 1;
                        if (nextIdx < chunksRef.current.length) {
                            currentChunkIdxRef.current = nextIdx;
                            dispatch({
                                type: 'SET_CHUNK_PROGRESS',
                                current: nextIdx,
                                total: chunksRef.current.length,
                            });
                            requestChunk(nextIdx);
                        }
                    });
                    break;

                case 'TTS_ERROR':
                    dispatch({ type: 'SET_ERROR', message: msg.message });
                    break;
            }
        };

        workerRef.current = worker;

        return () => {
            worker.terminate();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Request a chunk to be synthesized
    const requestChunk = useCallback((index: number) => {
        if (!workerRef.current) return;
        if (index >= chunksRef.current.length) return;

        const chunk = chunksRef.current[index];
        const msg: InMsg = {
            type: 'TTS_SYNTH',
            jobId: jobIdRef.current,
            chunkIndex: index,
            text: chunk.text,
            language: 'en',
            numInferenceSteps: 10,
            speed: 1.0,
        };
        workerRef.current.postMessage(msg);
    }, []);

    // Initialize model (can be called eagerly or lazily)
    const initModel = useCallback(async () => {
        if (state.modelReady) return;
        if (!workerRef.current) return;

        dispatch({ type: 'SET_STATUS', status: 'loading-model' });

        // Initialize chunker WASM too
        await ChunkerCore.init();

        const msg: InMsg = { type: 'TTS_INIT' };
        workerRef.current.postMessage(msg);
    }, [state.modelReady]);

    // Play text
    const play = useCallback(async (text: string, _language?: string) => {
        if (!workerRef.current) return;

        // Ensure model is ready
        if (!state.modelReady) {
            await initModel();
        }

        // Ensure chunker is ready
        await ChunkerCore.init();

        // Stop any existing playback
        await audioPlayer.stop();

        // Generate new job ID
        jobIdRef.current = `tts-${Date.now()}`;

        // Chunk the text
        const chunks = ChunkerCore.chunkForTTS(text);
        if (chunks.length === 0) return;

        chunksRef.current = chunks;
        currentChunkIdxRef.current = 0;

        dispatch({ type: 'SET_STATUS', status: 'synthesizing' });
        dispatch({ type: 'SET_CHUNK_PROGRESS', current: 0, total: chunks.length });

        // Start with first chunk
        requestChunk(0);
    }, [state.modelReady, initModel, requestChunk]);

    // Pause
    const pause = useCallback(async () => {
        await audioPlayer.pause();
        dispatch({ type: 'SET_STATUS', status: 'paused' });
    }, []);

    // Resume
    const resume = useCallback(async () => {
        await audioPlayer.resume();
        dispatch({ type: 'SET_STATUS', status: 'playing' });
    }, []);

    // Stop
    const stop = useCallback(async () => {
        // Cancel in worker
        if (workerRef.current && jobIdRef.current) {
            const msg: InMsg = { type: 'TTS_CANCEL', jobId: jobIdRef.current };
            workerRef.current.postMessage(msg);
        }

        await audioPlayer.stop();
        chunksRef.current = [];
        currentChunkIdxRef.current = 0;
        dispatch({ type: 'RESET' });
    }, []);

    const value: TTSContextValue = {
        state,
        play,
        pause,
        resume,
        stop,
        initModel,
    };

    return (
        <TTSContext.Provider value={value}>
            {children}
        </TTSContext.Provider>
    );
}

// ============================================================================
// Hook
// ============================================================================

export function useTTS() {
    const ctx = useContext(TTSContext);
    if (!ctx) {
        throw new Error('useTTS must be used within a TTSProvider');
    }
    return ctx;
}
