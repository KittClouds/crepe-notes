/**
 * TTS Module
 * 
 * Text-to-Speech using @huggingface/transformers in a Web Worker.
 */

export { TTSProvider, useTTS, type TTSStatus } from './TTSContext';
export { AudioQueuePlayer, audioPlayer } from './playerEngine';
