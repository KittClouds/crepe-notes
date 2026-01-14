/**
 * Binding Bridge Stub
 * 
 * Stub implementation for browser mode - no Tauri connection.
 * Full implementation will be wired when Tauri backend is connected.
 */

import type { FieldBinding, CreateBindingOptions, UpdateBindingOptions } from '@/lib/bindings/types';

/**
 * Stub binding bridge - stores bindings in memory/localStorage
 */
class BindingBridgeStub {
    private bindings: Map<string, FieldBinding> = new Map();
    private readonly STORAGE_KEY = 'graphaite_bindings';

    constructor() {
        this.loadFromStorage();
    }

    private loadFromStorage(): void {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                const data = JSON.parse(stored);
                this.bindings = new Map(Object.entries(data));
            }
        } catch (e) {
            console.warn('[BindingBridge] Failed to load from storage:', e);
        }
    }

    private saveToStorage(): void {
        try {
            const data = Object.fromEntries(this.bindings);
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('[BindingBridge] Failed to save to storage:', e);
        }
    }

    async createBinding(options: CreateBindingOptions): Promise<FieldBinding> {
        const id = `binding_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const binding: FieldBinding = {
            id,
            sourceEntityId: options.sourceEntityId,
            sourceFieldName: options.sourceFieldName,
            targetEntityId: options.targetEntityId,
            targetFieldName: options.targetFieldName,
            bindingType: options.bindingType || 'direct',
            transforms: options.transforms || [],
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        this.bindings.set(id, binding);
        this.saveToStorage();
        return binding;
    }

    async getBinding(id: string): Promise<FieldBinding | null> {
        return this.bindings.get(id) || null;
    }

    async getAllBindings(): Promise<FieldBinding[]> {
        return Array.from(this.bindings.values());
    }

    async getBindingsForEntity(entityId: string): Promise<FieldBinding[]> {
        return Array.from(this.bindings.values()).filter(
            b => b.sourceEntityId === entityId || b.targetEntityId === entityId
        );
    }

    async updateBinding(id: string, updates: UpdateBindingOptions): Promise<FieldBinding | null> {
        const existing = this.bindings.get(id);
        if (!existing) return null;

        const updated: FieldBinding = {
            ...existing,
            ...updates,
            updatedAt: new Date(),
        };
        this.bindings.set(id, updated);
        this.saveToStorage();
        return updated;
    }

    async deleteBinding(id: string): Promise<boolean> {
        const existed = this.bindings.has(id);
        this.bindings.delete(id);
        if (existed) this.saveToStorage();
        return existed;
    }

    async initialize(): Promise<void> {
        console.log('[BindingBridge] Stub initialized (browser mode)');
    }
}

export const bindingBridge = new BindingBridgeStub();
