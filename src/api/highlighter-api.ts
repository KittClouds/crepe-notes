// src/api/highlighter-api.ts
// Highlighter API - interface between Scanner and Editor
// Connected to highlightingStore for live mode updates

import type { DecorationSpan, HighlighterConfig, HighlightMode } from '../lib/Scanner';
import { scanDocument, getDecorationStyle, getDecorationClass } from '../lib/Scanner';
import { highlightingStore } from '../lib/store/highlightingStore';
import type { EntityKind } from '../lib/types/entityTypes';
import { implicitScanner } from '../lib/Scanner/ImplicitScanner';

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

function docContent(doc: ProseMirrorDoc): string {
    let text = '';
    doc.descendants((node) => {
        if (node.isText && node.text) {
            text += node.text;
        }
    });
    return text;
}

class DefaultHighlighterApi implements HighlighterApi {
    private enableWikilinks = true;
    private enableEntityRefs = true;
    private implicitDecorations: DecorationSpan[] = [];
    private lastContext: string = '';
    private listeners: Set<() => void> = new Set();
    private isScanning = false;
    private scanVersion = 0;

    constructor() {
        // subscribe to store changes
        highlightingStore.subscribe(() => this.notifyListeners());
    }

    private notifyListeners() {
        this.listeners.forEach(cb => cb());
    }

    getDecorations(doc: ProseMirrorDoc): DecorationSpan[] {
        const settings = highlightingStore.getSettings();

        if (settings.mode === 'off') {
            return [];
        }

        const spans = scanDocument(doc);
        const text = docContent(doc); // We need a helper to get text from doc to check change

        // Trigger implicit scan if text changed (debounced ideally, but simplistic for now)
        // Or just scan always if not scanning?
        if (text !== this.lastContext) {
            this.lastContext = text;
            this.triggerImplicitScan(doc);
        }

        // Merge implicit spans
        // Start with explicit spans
        const allSpans = [...spans];

        // Add implicit spans that DON'T overlap with explicit ones
        for (const implicit of this.implicitDecorations) {
            const overlaps = allSpans.some(explicit =>
                (implicit.from >= explicit.from && implicit.from < explicit.to) ||
                (implicit.to > explicit.from && implicit.to <= explicit.to) ||
                (implicit.from <= explicit.from && implicit.to >= explicit.to)
            );

            if (!overlaps) {
                allSpans.push(implicit);
            }
        }

        // Resort
        allSpans.sort((a, b) => a.from - b.from);

        // Filter based on config
        return allSpans.filter(span => {
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
            this.notifyListeners();
        }
    }

    subscribe(callback: () => void): () => void {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    private triggerImplicitScan(doc: ProseMirrorDoc) {
        const myVersion = ++this.scanVersion;
        const batch: { id: number, text: string }[] = [];
        const nodePositions = new Map<number, number>(); // Map batch ID to document position

        let batchIdCounter = 0;
        doc.descendants((node, pos) => {
            if (node.isText && node.text) {
                const id = batchIdCounter++;
                batch.push({ id, text: node.text });
                nodePositions.set(id, pos);
            }
        });

        // If nothing to scan
        if (batch.length === 0) {
            this.implicitDecorations = [];
            this.notifyListeners();
            return;
        }

        implicitScanner.scanBatch(batch).then(results => {
            // Only apply if this is still the latest requested scan
            if (this.scanVersion !== myVersion) return;

            const mergedSpans: DecorationSpan[] = [];

            // Reconstruct spans with correct document offsets
            for (const [id, spans] of results.entries()) {
                const nodeStart = nodePositions.get(id);
                if (nodeStart !== undefined) {
                    for (const span of spans) {
                        mergedSpans.push({
                            ...span,
                            from: nodeStart + span.from,
                            to: nodeStart + span.to
                        });
                    }
                }
            }

            this.implicitDecorations = mergedSpans;
            this.notifyListeners();
        });
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

