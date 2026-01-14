// src/lib/agents/mastra.config.ts
// Model Configuration - STUB for Rig Rust replacement
//
// ┌─────────────────────────────────────────────────────────────────────────────┐
// │  STUB - Mastra has been removed. Replacing with Rig (Rust).                │
// │  This file provides TypeScript types and stub data until Tauri backend.    │
// └─────────────────────────────────────────────────────────────────────────────┘

export type ModelProvider = 'google' | 'openrouter';

export interface AvailableModel {
    modelId: string;
    displayName: string;
    provider: ModelProvider;
    isFree?: boolean;
}

/**
 * Available models - stub data
 * TODO: Replace with Tauri command to get models from Rig backend
 */
export const availableModels: AvailableModel[] = [
    // Google Gemini (via Rig)
    {
        modelId: 'gemini-2.5-flash',
        displayName: 'Gemini 2.5 Flash',
        provider: 'google',
    },
    {
        modelId: 'gemini-2.5-pro',
        displayName: 'Gemini 2.5 Pro',
        provider: 'google',
    },
    // OpenRouter (via Rig)
    {
        modelId: 'nemotron-3-30b',
        displayName: 'Nemotron 3 Nano 30B (FREE)',
        provider: 'openrouter',
        isFree: true,
    },
    {
        modelId: 'llama-3.1-70b',
        displayName: 'Llama 3.1 70B',
        provider: 'openrouter',
        isFree: true,
    },
    {
        modelId: 'deepseek-chat',
        displayName: 'DeepSeek Chat',
        provider: 'openrouter',
        isFree: true,
    },
];
