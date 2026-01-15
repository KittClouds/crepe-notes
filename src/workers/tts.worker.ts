/**
 * TTS Web Worker
 * 
 * Runs @huggingface/transformers pipeline in isolation.
 * Model: onnx-community/Supertonic-TTS-2-ONNX
 */
/// <reference lib="webworker" />

import { pipeline, type TextToAudioPipeline } from "@huggingface/transformers";

// ============================================================================
// Message Types
// ============================================================================

export type TTSInitMsg = {
    type: "TTS_INIT";
    modelId?: string; // defaults to Supertonic
};

export type TTSSynthMsg = {
    type: "TTS_SYNTH";
    jobId: string;
    chunkIndex: number;
    text: string;
    language?: string; // "en" | "ko" | "es" | "pt" | "fr"
    speakerEmbUrl?: string;
    numInferenceSteps?: number;
    speed?: number;
};

export type TTSCancelMsg = {
    type: "TTS_CANCEL";
    jobId: string;
};

export type InMsg = TTSInitMsg | TTSSynthMsg | TTSCancelMsg;

export type TTSReadyMsg = { type: "TTS_READY" };
export type TTSProgressMsg = { type: "TTS_PROGRESS"; progress: number; status: string };
export type TTSAudioMsg = {
    type: "TTS_AUDIO";
    jobId: string;
    chunkIndex: number;
    wavBytes: ArrayBuffer;
};
export type TTSErrorMsg = { type: "TTS_ERROR"; jobId?: string; message: string };

export type OutMsg = TTSReadyMsg | TTSProgressMsg | TTSAudioMsg | TTSErrorMsg;

// ============================================================================
// Worker State
// ============================================================================

const DEFAULT_MODEL = "onnx-community/Supertonic-TTS-2-ONNX";
let tts: TextToAudioPipeline | null = null;
const cancelled = new Set<string>();

async function ensureTts(modelId: string = DEFAULT_MODEL) {
    if (tts) return;

    // Pipeline downloads/caches model on first run
    self.postMessage({ type: "TTS_PROGRESS", progress: 0, status: "Loading model..." } satisfies OutMsg);

    tts = await pipeline("text-to-speech", modelId, {
        progress_callback: (progress: { status: string; progress?: number }) => {
            self.postMessage({
                type: "TTS_PROGRESS",
                progress: progress.progress ?? 0,
                status: progress.status,
            } satisfies OutMsg);
        },
    });
}

// ============================================================================
// Message Handler
// ============================================================================

self.onmessage = async (ev: MessageEvent<InMsg>) => {
    const msg = ev.data;

    try {
        if (msg.type === "TTS_CANCEL") {
            cancelled.add(msg.jobId);
            return;
        }

        if (msg.type === "TTS_INIT") {
            await ensureTts(msg.modelId);
            self.postMessage({ type: "TTS_READY" } satisfies OutMsg);
            return;
        }

        if (msg.type === "TTS_SYNTH") {
            if (cancelled.has(msg.jobId)) return;

            await ensureTts();

            if (!tts) {
                throw new Error("TTS pipeline not initialized");
            }

            // Wrap text with language tag if specified
            const lang = msg.language || "en";
            const wrappedText = `<${lang}>${msg.text}</${lang}>`;

            // Run synthesis
            const audio = await tts(wrappedText, {
                speaker_embeddings: msg.speakerEmbUrl,
                // @ts-expect-error - model specific params
                num_inference_steps: msg.numInferenceSteps ?? 10,
                speed: msg.speed ?? 1.0,
            });

            if (cancelled.has(msg.jobId)) return;

            // Convert to WAV blob
            // The audio object has toBlob() method per model card
            let wavBytes: ArrayBuffer;

            if ('toBlob' in audio && typeof audio.toBlob === 'function') {
                const blob: Blob = await audio.toBlob();
                wavBytes = await blob.arrayBuffer();
            } else if ('audio' in audio && audio.audio) {
                // Fallback: raw audio data
                const audioData = audio.audio as Float32Array;
                const sampleRate = (audio as { sampling_rate?: number }).sampling_rate || 44100;
                wavBytes = float32ToWav(audioData, sampleRate);
            } else {
                throw new Error("Unexpected audio output format");
            }

            self.postMessage(
                {
                    type: "TTS_AUDIO",
                    jobId: msg.jobId,
                    chunkIndex: msg.chunkIndex,
                    wavBytes,
                } satisfies OutMsg,
                { transfer: [wavBytes] }
            );
        }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        self.postMessage({
            type: "TTS_ERROR",
            jobId: 'jobId' in msg ? msg.jobId : undefined,
            message,
        } satisfies OutMsg);
    }
};

// ============================================================================
// WAV Encoding Helper
// ============================================================================

function float32ToWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = samples.length * bytesPerSample;
    const headerSize = 44;
    const buffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(buffer);

    // RIFF header
    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, "WAVE");

    // fmt chunk
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data chunk
    writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);

    // Write samples (convert float32 to int16)
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        const val = s < 0 ? s * 0x8000 : s * 0x7fff;
        view.setInt16(offset, val, true);
        offset += 2;
    }

    return buffer;
}

function writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}
