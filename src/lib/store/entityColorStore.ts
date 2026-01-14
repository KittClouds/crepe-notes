// src/lib/store/entityColorStore.ts
// Unified Entity Color System - Single source of truth for all entity colors
// Uses CSS custom properties for live updates across the entire app

import type { EntityKind } from '@/lib/types/entityTypes';
import { ENTITY_KINDS } from '@/lib/types/entityTypes';

// ============================================
// DEFAULT COLORS (HSL VALUES)
// ============================================

// HSL values without the hsl() wrapper - used in CSS as: hsl(var(--entity-character))
export const DEFAULT_ENTITY_COLORS: Record<EntityKind, string> = {
    CHARACTER: '280 70% 60%',      // Purple
    LOCATION: '200 75% 55%',       // Blue
    ORGANIZATION: '340 75% 55%',   // Pink/Rose
    ITEM: '45 90% 50%',            // Gold
    CONCEPT: '170 65% 45%',        // Teal
    EVENT: '25 90% 55%',           // Orange
    FACTION: '0 70% 55%',          // Red
    CREATURE: '120 50% 45%',       // Green
    UNKNOWN: '220 10% 50%',        // Gray
    // Narrative structure types
    ACT: '230 80% 55%',            // Royal Blue
    ARC: '270 70% 60%',            // Violet
    BEAT: '320 70% 55%',           // Magenta
    CHAPTER: '175 65% 45%',        // Teal
    NARRATIVE: '250 60% 55%',      // Indigo
    NETWORK: '190 70% 50%',        // Cyan
    SCENE: '330 70% 60%',          // Pink
    TIMELINE: '50 85% 50%',        // Gold
    NPC: '30 80% 55%',             // Orange
    MAGIC_SYSTEM: '280 80% 55%',   // Purple
    WORLD: '160 60% 45%',          // Teal-Green
    RULE: '220 60% 50%',           // Blue-Gray
};

const STORAGE_KEY = 'entity-theme-colors-v2';

// ============================================
// STORE CLASS
// ============================================

class EntityColorStore {
    private colors: Record<EntityKind, string>;
    private listeners: Set<() => void> = new Set();
    private initialized = false;
    // Cached snapshot for useSyncExternalStore - same reference until data changes
    private snapshot: Record<EntityKind, string>;

    constructor() {
        this.colors = { ...DEFAULT_ENTITY_COLORS };
        this.snapshot = this.colors;
    }

    /**
     * Initialize store - must be called after DOM is ready
     * Loads from localStorage and syncs to CSS variables
     */
    initialize(): void {
        if (this.initialized) return;

        // Load from localStorage
        this.loadFromStorage();

        // Update snapshot
        this.snapshot = { ...this.colors };

        // Sync all colors to CSS variables
        this.syncAllToCssVars();

        this.initialized = true;
        console.log('[EntityColorStore] Initialized with', Object.keys(this.colors).length, 'colors');
    }

    // ============================================
    // GETTERS - CSS Variable Format
    // ============================================

    /**
     * Get color as CSS hsl() string using CSS variable
     * Returns: 'hsl(var(--entity-character))'
     */
    getEntityColor(kind: EntityKind | string): string {
        const varName = this.getCssVarName(kind);
        return `hsl(var(${varName}))`;
    }

    /**
     * Get background color with opacity
     * Returns: 'hsl(var(--entity-character) / 0.2)'
     */
    getEntityBgColor(kind: EntityKind | string, opacity = 0.2): string {
        const varName = this.getCssVarName(kind);
        return `hsl(var(${varName}) / ${opacity})`;
    }

    /**
     * Get CSS variable name for a kind
     * Returns: '--entity-character'
     */
    getCssVarName(kind: EntityKind | string): string {
        return `--entity-${kind.toLowerCase().replace(/_/g, '-')}`;
    }

    /**
     * Get raw HSL value (without hsl() wrapper)
     * Returns: '280 70% 60%'
     */
    getRawHsl(kind: EntityKind): string {
        return this.colors[kind] || this.colors.UNKNOWN || '220 10% 50%';
    }

    /**
     * Get snapshot of all colors - returns STABLE reference for useSyncExternalStore
     */
    getSnapshot(): Record<EntityKind, string> {
        return this.snapshot;
    }

    /**
     * Get all colors (creates new object - use getSnapshot for React hooks)
     */
    getAllColors(): Record<EntityKind, string> {
        return { ...this.colors };
    }

    // ============================================
    // SETTERS - Update CSS variables live
    // ============================================

    /**
     * Set color for a kind - updates CSS variable immediately
     */
    setColor(kind: EntityKind, hslValue: string): void {
        this.colors[kind] = hslValue;
        this.setCssVar(kind, hslValue);
        this.saveToStorage();
        this.notify();
    }

    /**
     * Set multiple colors at once
     */
    setColors(colors: Partial<Record<EntityKind, string>>): void {
        for (const [kind, hsl] of Object.entries(colors)) {
            if (hsl) {
                this.colors[kind as EntityKind] = hsl;
                this.setCssVar(kind as EntityKind, hsl);
            }
        }
        this.saveToStorage();
        this.notify();
    }

    /**
     * Reset all colors to defaults
     */
    reset(): void {
        this.colors = { ...DEFAULT_ENTITY_COLORS };
        this.syncAllToCssVars();
        this.saveToStorage();
        this.notify();
    }

    // ============================================
    // CSS VARIABLE MANAGEMENT
    // ============================================

    private setCssVar(kind: EntityKind | string, hslValue: string): void {
        const varName = this.getCssVarName(kind);
        document.documentElement.style.setProperty(varName, hslValue);
    }

    private syncAllToCssVars(): void {
        for (const [kind, hsl] of Object.entries(this.colors)) {
            this.setCssVar(kind, hsl);
        }
    }

    // ============================================
    // PERSISTENCE
    // ============================================

    private loadFromStorage(): void {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                // Merge with defaults to handle new entity kinds
                this.colors = { ...DEFAULT_ENTITY_COLORS, ...parsed };
            }
        } catch (e) {
            console.warn('[EntityColorStore] Failed to load from localStorage:', e);
        }
    }

    private saveToStorage(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.colors));
        } catch (e) {
            console.warn('[EntityColorStore] Failed to save to localStorage:', e);
        }
    }

    // ============================================
    // SUBSCRIPTIONS
    // ============================================

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notify(): void {
        // Create new snapshot reference so useSyncExternalStore detects change
        this.snapshot = { ...this.colors };
        this.listeners.forEach(fn => fn());
    }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

export const entityColorStore = new EntityColorStore();

// ============================================
// CONVENIENCE FUNCTIONS (for easy import)
// ============================================

/**
 * Get entity color as CSS hsl() string using CSS variable
 * Usage: style={{ color: getEntityColor('CHARACTER') }}
 * Returns: 'hsl(var(--entity-character))'
 */
export function getEntityColor(kind: EntityKind | string | undefined): string {
    if (!kind) return 'hsl(var(--entity-unknown))';
    return entityColorStore.getEntityColor(kind);
}

/**
 * Get entity background color with opacity
 * Usage: style={{ backgroundColor: getEntityBgColor('CHARACTER') }}
 * Returns: 'hsl(var(--entity-character) / 0.2)'
 */
export function getEntityBgColor(kind: EntityKind | string | undefined, opacity = 0.2): string {
    if (!kind) return `hsl(var(--entity-unknown) / ${opacity})`;
    return entityColorStore.getEntityBgColor(kind, opacity);
}

/**
 * Get CSS variable name for an entity kind
 * Returns: '--entity-character'
 */
export function getEntityColorVar(kind: EntityKind | string): string {
    return entityColorStore.getCssVarName(kind);
}

// ============================================
// REACT HOOK
// ============================================

import { useSyncExternalStore, useCallback } from 'react';

/**
 * React hook for entity colors with live updates
 */
export function useEntityColors() {
    // Use getSnapshot for stable reference - avoids infinite loops
    const colors = useSyncExternalStore(
        entityColorStore.subscribe.bind(entityColorStore),
        entityColorStore.getSnapshot.bind(entityColorStore)
    );

    const setColor = useCallback((kind: EntityKind, hsl: string) => {
        entityColorStore.setColor(kind, hsl);
    }, []);

    const reset = useCallback(() => {
        entityColorStore.reset();
    }, []);

    return {
        colors,
        setColor,
        reset,
        getEntityColor,
        getEntityBgColor,
    };
}

