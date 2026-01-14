// src/api/highlighter-api.ts
// Highlighter API - interface between Scanner and Editor
// Connected to highlightingStore for live mode updates

import type { DecorationSpan, HighlighterConfig, HighlightMode } from '../lib/Scanner';
import { scanDocument, getDecorationStyle, getDecorationClass } from '../lib/Scanner';
import { highlightingStore } from '../lib/store/highlightingStore';
import type { EntityKind } from '../lib/types/entityTypes';

// =============================================================================
// HIGHLIGHTER API INTERFACE
// =============================================================================

export interface HighlighterApi {
    /** Get decoration spans for a ProseMirror document */
    getDecorations(doc: ProseMirrorDoc): DecorationSpan[];

    /** Get inline CSS style for a decoration span */
    getStyle(span: DecorationSpan): string;

    /** Get CSS class for a decoration span */
    getClass(span: DecorationSpan): string;

    /** Get current highlight mode */
    getMode(): HighlightMode;

    /** Set highlight mode (updates both API and store) */
    setMode(mode: HighlightMode): void;

    /** Get full configuration */
    getConfig(): HighlighterConfig;

    /** Update configuration */
    setConfig(config: Partial<HighlighterConfig>): void;

    /** Subscribe to settings changes for editor refresh */
    subscribe(callback: () => void): () => void;
}

// ProseMirror document interface (minimal)
export interface ProseMirrorDoc {
    descendants: (callback: (node: { isText?: boolean; text?: string }, pos: number) => void) => void;
}

// =============================================================================
// DEFAULT IMPLEMENTATION - CONNECTED TO HIGHLIGHTING STORE
// =============================================================================

class DefaultHighlighterApi implements HighlighterApi {
    private enableWikilinks = true;
    private enableEntityRefs = true;

    getDecorations(doc: ProseMirrorDoc): DecorationSpan[] {
        const settings = highlightingStore.getSettings();

        if (settings.mode === 'off') {
            return [];
        }

        const spans = scanDocument(doc);

        // Filter based on config
        return spans.filter(span => {
            // Filter by type
            if (span.type === 'wikilink' && !settings.showWikilinks) return false;
            if (span.type === 'entity_ref' && !this.enableEntityRefs) return false;

            // Focus mode: filter by entity kind
            if (settings.mode === 'focus' && span.type === 'entity' && span.kind) {
                return settings.focusEntityKinds.includes(span.kind as EntityKind);
            }

            return true;
        });
    }

    getStyle(span: DecorationSpan): string {
        const mode = highlightingStore.getMode();
        return getDecorationStyle(span, mode);
    }

    getClass(span: DecorationSpan): string {
        return getDecorationClass(span);
    }

    getMode(): HighlightMode {
        return highlightingStore.getMode();
    }

    setMode(mode: HighlightMode): void {
        highlightingStore.setMode(mode);
    }

    getConfig(): HighlighterConfig {
        const settings = highlightingStore.getSettings();
        return {
            mode: settings.mode,
            enabledKinds: settings.focusEntityKinds.length > 0 ? settings.focusEntityKinds : undefined,
            enableWikilinks: settings.showWikilinks,
            enableEntityRefs: this.enableEntityRefs,
        };
    }

    setConfig(config: Partial<HighlighterConfig>): void {
        if (config.mode) {
            highlightingStore.setMode(config.mode);
        }
        if (config.enableWikilinks !== undefined) {
            highlightingStore.setSettings({ showWikilinks: config.enableWikilinks });
        }
        if (config.enabledKinds !== undefined) {
            highlightingStore.setSettings({ focusEntityKinds: config.enabledKinds as EntityKind[] });
        }
        if (config.enableEntityRefs !== undefined) {
            this.enableEntityRefs = config.enableEntityRefs;
        }
    }

    subscribe(callback: () => void): () => void {
        return highlightingStore.subscribe(callback);
    }
}

// =============================================================================
// SINGLETON
// =============================================================================

let _instance: HighlighterApi | null = null;

export function getHighlighterApi(): HighlighterApi {
    if (!_instance) {
        _instance = new DefaultHighlighterApi();
    }
    return _instance;
}

export function setHighlighterApi(api: HighlighterApi): void {
    _instance = api;
}

