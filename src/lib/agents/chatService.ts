// src/lib/agents/chatService.ts
// Chat Service - STUB for Rig Rust replacement
//
// ┌─────────────────────────────────────────────────────────────────────────────┐
// │  STUB - Mastra chat has been removed. Replacing with Rig (Rust).           │
// │  This provides a stub interface until Tauri backend is wired.              │
// └─────────────────────────────────────────────────────────────────────────────┘

import type { ModelProvider } from './mastra.config';

interface StreamPart {
    type: 'text-delta' | 'tool-call' | 'tool-result';
    text?: string;
    toolCallId?: string;
    toolName?: string;
    input?: unknown;
    output?: unknown;
}

interface StreamResponse {
    fullStream: AsyncIterable<StreamPart>;
}

interface ChatServiceRequest {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    modelProvider: ModelProvider;
    modelName: string;
}

/**
 * Chat Service - stub implementation
 * 
 * TODO: Replace with Tauri invoke to Rig backend:
 * return invoke('chat_stream', { messages, modelProvider, modelName });
 */
class ChatService {
    async streamResponse(_request: ChatServiceRequest): Promise<StreamResponse> {
        console.warn('[ChatService] STUB - Rig backend not connected');

        // Return a mock stream that yields a stub message
        const stubStream: AsyncIterable<StreamPart> = {
            async *[Symbol.asyncIterator]() {
                yield {
                    type: 'text-delta' as const,
                    text: '🚧 AI backend is being replaced with Rig (Rust). This feature will be available once the Tauri backend is connected.'
                };
            }
        };

        return { fullStream: stubStream };
    }
}

export const chatService = new ChatService();
