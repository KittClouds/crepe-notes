// src/lib/Scanner/pattern-scanner.ts
// Pattern-based scanner for entities, entity refs, and note links
// V3: Clean mental model - [KIND|Label] for entities, [[ref]] for entity refs, <<note>> for notes

import type { DecorationSpan, EntityKind, SpanType } from './types';
import { smartGraphRegistry } from '../registry/SmartGraphRegistry';

// =============================================================================
// CLEAN PATTERNS
// =============================================================================

// Entity Tag: [KIND|Label] - creates/references entity with explicit type
const ENTITY_TAG_PATTERN = /\[([A-Z_]+)\|([^\]]+)\]/g;

// Entity Reference: [[entity]] - references existing entity by label
const ENTITY_REF_PATTERN = /\[\[([^\]]+)\]\]/g;

// Note Link: <<note>> - links to note by title (NOT an entity)
const NOTE_LINK_PATTERN = /<<([^>]+)>>/g;

// Relationship patterns (use entity refs or note links)
const RELATIONSHIP_FORWARD = /(\[[A-Z_]+\|[^\]]+\]|\[\[[^\]]+\]\]|<<[^>]+>>)\s*(?:\(([A-Z_]+)\))?\s*->\s*(\[[A-Z_]+\|[^\]]+\]|\[\[[^\]]+\]\]|<<[^>]+>>)/g;
const RELATIONSHIP_BACKWARD = /(\[[A-Z_]+\|[^\]]+\]|\[\[[^\]]+\]\]|<<[^>]+>>)\s*(?:\(([A-Z_]+)\))?\s*<-\s*(\[[A-Z_]+\|[^\]]+\]|\[\[[^\]]+\]\]|<<[^>]+>>)/g;
const RELATIONSHIP_BIDIR = /(\[[A-Z_]+\|[^\]]+\]|\[\[[^\]]+\]\]|<<[^>]+>>)\s*(?:\(([A-Z_]+)\))?\s*<->\s*(\[[A-Z_]+\|[^\]]+\]|\[\[[^\]]+\]\]|<<[^>]+>>)/g;

// =============================================================================
// Scanner
// =============================================================================

/**
 * Scan text for all patterns and return decoration spans.
 * Also auto-registers new entities to the registry.
 */
export async function scanForPatterns(text: string, noteId?: string): Promise<DecorationSpan[]> {
    const spans: DecorationSpan[] = [];
    const processedRanges: [number, number][] = [];

    const overlaps = (from: number, to: number) => {
        return processedRanges.some(([s, e]) => from < e && to > s);
    };
    const addRange = (from: number, to: number) => {
        processedRanges.push([from, to]);
    };

    // 1. Entity Tags: [KIND|Label] - Auto-register
    await scanWithPatternAsync(text, ENTITY_TAG_PATTERN, async (match, index) => {
        const [fullMatch, kind, label] = match;
        if (overlaps(index, index + fullMatch.length)) return;
        addRange(index, index + fullMatch.length);

        // Auto-register entity
        if (noteId) {
            await smartGraphRegistry.registerEntity(label, kind as EntityKind || 'UNKNOWN', noteId, { source: 'auto' });
        }

        spans.push({
            type: 'entity',
            from: index,
            to: index + fullMatch.length,
            label,
            kind: kind as EntityKind,
            resolved: true,
        });
    });

    // 2. Entity References: [[entity]] - Lookup only
    scanWithPattern(text, ENTITY_REF_PATTERN, (match, index) => {
        const [fullMatch, label] = match;
        if (overlaps(index, index + fullMatch.length)) return;
        addRange(index, index + fullMatch.length);

        const existing = smartGraphRegistry.findEntityByLabel(label);
        spans.push({
            type: 'entity_ref',
            from: index,
            to: index + fullMatch.length,
            label,
            target: label,
            kind: existing?.kind,
            resolved: !!existing,
        });
    });

    // 3. Note Links: <<note>> - No entity involvement
    scanWithPattern(text, NOTE_LINK_PATTERN, (match, index) => {
        const [fullMatch, target] = match;
        if (overlaps(index, index + fullMatch.length)) return;
        addRange(index, index + fullMatch.length);

        spans.push({
            type: 'wikilink',
            from: index,
            to: index + fullMatch.length,
            label: target,
            target,
            resolved: true, // Will be resolved by navigation
        });
    });

    // 4. Relationships
    scanWithPattern(text, RELATIONSHIP_BIDIR, (match, index) => {
        const [fullMatch, source, verb, target] = match;
        if (overlaps(index, index + fullMatch.length)) return;
        addRange(index, index + fullMatch.length);

        spans.push({
            type: 'relationship',
            from: index,
            to: index + fullMatch.length,
            label: verb || 'RELATES_TO',
            sourceEntity: extractEntityName(source),
            targetEntity: extractEntityName(target),
            verb: verb || 'RELATES_TO',
            direction: 'bidirectional',
        });
    });

    scanWithPattern(text, RELATIONSHIP_FORWARD, (match, index) => {
        const [fullMatch, source, verb, target] = match;
        if (overlaps(index, index + fullMatch.length)) return;
        addRange(index, index + fullMatch.length);

        spans.push({
            type: 'relationship',
            from: index,
            to: index + fullMatch.length,
            label: verb || 'RELATES_TO',
            sourceEntity: extractEntityName(source),
            targetEntity: extractEntityName(target),
            verb: verb || 'RELATES_TO',
            direction: 'forward',
        });
    });

    scanWithPattern(text, RELATIONSHIP_BACKWARD, (match, index) => {
        const [fullMatch, source, verb, target] = match;
        if (overlaps(index, index + fullMatch.length)) return;
        addRange(index, index + fullMatch.length);

        spans.push({
            type: 'relationship',
            from: index,
            to: index + fullMatch.length,
            label: verb || 'RELATES_TO',
            sourceEntity: extractEntityName(target),
            targetEntity: extractEntityName(source),
            verb: verb || 'RELATES_TO',
            direction: 'backward',
        });
    });

    spans.sort((a, b) => a.from - b.from);
    return spans;
}

/**
 * Sync version for decoration building (no auto-registration)
 */
export function scanForPatternsSync(text: string): DecorationSpan[] {
    const spans: DecorationSpan[] = [];
    const processedRanges: [number, number][] = [];

    const overlaps = (from: number, to: number) => {
        return processedRanges.some(([s, e]) => from < e && to > s);
    };
    const addRange = (from: number, to: number) => {
        processedRanges.push([from, to]);
    };

    // 1. Entity Tags: [KIND|Label]
    scanWithPattern(text, ENTITY_TAG_PATTERN, (match, index) => {
        const [fullMatch, kind, label] = match;
        if (overlaps(index, index + fullMatch.length)) return;
        addRange(index, index + fullMatch.length);

        spans.push({
            type: 'entity',
            from: index,
            to: index + fullMatch.length,
            label,
            kind: kind as EntityKind,
            resolved: smartGraphRegistry.isRegisteredEntity(label),
        });
    });

    // 2. Entity References: [[entity]]
    scanWithPattern(text, ENTITY_REF_PATTERN, (match, index) => {
        const [fullMatch, label] = match;
        if (overlaps(index, index + fullMatch.length)) return;
        addRange(index, index + fullMatch.length);

        const existing = smartGraphRegistry.findEntityByLabel(label);
        spans.push({
            type: 'entity_ref',
            from: index,
            to: index + fullMatch.length,
            label,
            target: label,
            kind: existing?.kind,
            resolved: !!existing,
        });
    });

    // 3. Note Links: <<note>>
    scanWithPattern(text, NOTE_LINK_PATTERN, (match, index) => {
        const [fullMatch, target] = match;
        if (overlaps(index, index + fullMatch.length)) return;
        addRange(index, index + fullMatch.length);

        spans.push({
            type: 'wikilink',
            from: index,
            to: index + fullMatch.length,
            label: target,
            target,
            resolved: true,
        });
    });

    // 4. Relationships
    scanWithPattern(text, RELATIONSHIP_BIDIR, (match, index) => {
        const [fullMatch, source, verb, target] = match;
        if (overlaps(index, index + fullMatch.length)) return;
        addRange(index, index + fullMatch.length);

        spans.push({
            type: 'relationship',
            from: index,
            to: index + fullMatch.length,
            label: verb || 'RELATES_TO',
            sourceEntity: extractEntityName(source),
            targetEntity: extractEntityName(target),
            verb: verb || 'RELATES_TO',
            direction: 'bidirectional',
        });
    });

    scanWithPattern(text, RELATIONSHIP_FORWARD, (match, index) => {
        const [fullMatch, source, verb, target] = match;
        if (overlaps(index, index + fullMatch.length)) return;
        addRange(index, index + fullMatch.length);

        spans.push({
            type: 'relationship',
            from: index,
            to: index + fullMatch.length,
            label: verb || 'RELATES_TO',
            sourceEntity: extractEntityName(source),
            targetEntity: extractEntityName(target),
            verb: verb || 'RELATES_TO',
            direction: 'forward',
        });
    });

    scanWithPattern(text, RELATIONSHIP_BACKWARD, (match, index) => {
        const [fullMatch, source, verb, target] = match;
        if (overlaps(index, index + fullMatch.length)) return;
        addRange(index, index + fullMatch.length);

        spans.push({
            type: 'relationship',
            from: index,
            to: index + fullMatch.length,
            label: verb || 'RELATES_TO',
            sourceEntity: extractEntityName(target),
            targetEntity: extractEntityName(source),
            verb: verb || 'RELATES_TO',
            direction: 'backward',
        });
    });

    spans.sort((a, b) => a.from - b.from);
    return spans;
}

// =============================================================================
// Helpers
// =============================================================================

function scanWithPattern(
    text: string,
    pattern: RegExp,
    callback: (match: RegExpExecArray, index: number) => void
): void {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
        callback(match, match.index);
    }
}

async function scanWithPatternAsync(
    text: string,
    pattern: RegExp,
    callback: (match: RegExpExecArray, index: number) => Promise<void>
): Promise<void> {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
        await callback(match, match.index);
    }
}

function extractEntityName(ref: string): string {
    // [KIND|Name] → Name
    const tagMatch = ref.match(/\[([A-Z_]+)\|([^\]]+)\]/);
    if (tagMatch) return tagMatch[2];

    // [[Name]] → Name
    const refMatch = ref.match(/\[\[([^\]]+)\]\]/);
    if (refMatch) return refMatch[1];

    // <<Name>> → Name
    const noteMatch = ref.match(/<<([^>]+)>>/);
    if (noteMatch) return noteMatch[1];

    return ref;
}

/**
 * Scan a ProseMirror-like document structure.
 */
export function scanDocument(
    doc: { descendants: (callback: (node: { isText?: boolean; text?: string }, pos: number) => void) => void }
): DecorationSpan[] {
    const spans: DecorationSpan[] = [];

    doc.descendants((node, pos) => {
        if (!node.isText || !node.text) return;

        const nodeSpans = scanForPatternsSync(node.text);
        for (const span of nodeSpans) {
            spans.push({
                ...span,
                from: pos + span.from,
                to: pos + span.to,
            });
        }
    });

    return spans;
}

// Legacy export
export function scanForEntities(text: string): DecorationSpan[] {
    return scanForPatternsSync(text).filter(s => s.type === 'entity');
}
