/**
 * Binding Engine Adapter - Web Version (Stub)
 * 
 * Bindings require the native desktop app with SurrealDB.
 * This stub provides the same interface but does nothing.
 */

import type {
    FieldBinding as LegacyFieldBinding,
    CreateBindingOptions,
    BindingChangeEvent,
} from './types';

/**
 * Binding Engine Adapter - Stub for web
 */
export class BindingEngineAdapter {
    private static instance: BindingEngineAdapter | null = null;
    private listeners: Set<(event: BindingChangeEvent) => void> = new Set();
    private initialized = false;

    private constructor() { }

    static getInstance(): BindingEngineAdapter {
        if (!BindingEngineAdapter.instance) {
            BindingEngineAdapter.instance = new BindingEngineAdapter();
        }
        return BindingEngineAdapter.instance;
    }

    setWorldId(_worldId: string): void {
        // No-op
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;
        console.log('[BindingEngineAdapter] Web mode - bindings not available');
        this.initialized = true;
    }

    async createBinding(_options: CreateBindingOptions): Promise<LegacyFieldBinding> {
        throw new Error('Bindings require desktop app');
    }

    async deleteBinding(_bindingId: string): Promise<boolean> {
        return false;
    }

    getBinding(_bindingId: string): LegacyFieldBinding | undefined {
        return undefined;
    }

    getBindingsForSource(_entityId: string, _fieldName: string): LegacyFieldBinding[] {
        return [];
    }

    getBindingsForTarget(_entityId: string, _fieldName: string): LegacyFieldBinding[] {
        return [];
    }

    getBindingsForEntity(_entityId: string): LegacyFieldBinding[] {
        return [];
    }

    getAllBindings(): LegacyFieldBinding[] {
        return [];
    }

    hasBindings(_entityId: string, _fieldName: string): boolean {
        return false;
    }

    subscribe(callback: (event: BindingChangeEvent) => void): () => void {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }
}

// Export singleton instance
export const bindingEngineAdapter = BindingEngineAdapter.getInstance();
