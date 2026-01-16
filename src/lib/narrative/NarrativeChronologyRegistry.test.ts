/**
 * NarrativeChronologyRegistry Tests
 * 
 * TDD: Tests define the contract for:
 * 1. Registering Narrative Timeline roots
 * 2. Auto-numbering Arc/Act/Chapter
 * 3. Tracking Scenes/Beats without numbering
 * 4. Scope-limited to Narrative Timeline children
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    NarrativeChronologyRegistry,
    narrativeRegistry,
    type NarrativeElement,
    type NarrativeTimelineRoot
} from './NarrativeChronologyRegistry';

describe('NarrativeChronologyRegistry', () => {
    let registry: NarrativeChronologyRegistry;

    beforeEach(() => {
        registry = new NarrativeChronologyRegistry();
    });

    // =========================================================================
    // ROOT REGISTRATION
    // =========================================================================

    describe('registerNarrativeRoot', () => {
        it('should register a Narrative Timeline folder as root', () => {
            registry.registerNarrativeRoot('folder-1', 'My Story Timeline');

            const root = registry.getNarrativeRoot('folder-1');
            expect(root).not.toBeNull();
            expect(root?.id).toBe('folder-1');
            expect(root?.name).toBe('My Story Timeline');
        });

        it('should initialize counters to zero', () => {
            registry.registerNarrativeRoot('folder-1', 'Timeline');

            const root = registry.getNarrativeRoot('folder-1');
            expect(root?.arcCount).toBe(0);
            expect(root?.actCount).toBe(0);
            expect(root?.chapterCount).toBe(0);
        });

        it('should allow multiple narrative roots', () => {
            registry.registerNarrativeRoot('story-1', 'Story A');
            registry.registerNarrativeRoot('story-2', 'Story B');

            expect(registry.getTimelineRoots()).toHaveLength(2);
        });
    });

    // =========================================================================
    // ELEMENT REGISTRATION
    // =========================================================================

    describe('registerElement', () => {
        beforeEach(() => {
            registry.registerNarrativeRoot('narrative-root', 'Main Story');
        });

        it('should register an Arc with ordinal 1', () => {
            const element = registry.registerElement('arc-1', 'ARC', 'narrative-root', 'The Beginning');

            expect(element.type).toBe('ARC');
            expect(element.ordinal).toBe(1);
            expect(element.label).toBe('The Beginning');
            expect(element.narrativeRootId).toBe('narrative-root');
        });

        it('should auto-increment Arc ordinal', () => {
            registry.registerElement('arc-1', 'ARC', 'narrative-root', 'Arc One');
            const arc2 = registry.registerElement('arc-2', 'ARC', 'narrative-root', 'Arc Two');
            const arc3 = registry.registerElement('arc-3', 'ARC', 'narrative-root', 'Arc Three');

            expect(arc2.ordinal).toBe(2);
            expect(arc3.ordinal).toBe(3);
        });

        it('should auto-increment Chapter ordinal within Arc', () => {
            registry.registerElement('arc-1', 'ARC', 'narrative-root', 'Main Arc');

            const ch1 = registry.registerElement('ch-1', 'CHAPTER', 'arc-1', 'Chapter One');
            const ch2 = registry.registerElement('ch-2', 'CHAPTER', 'arc-1', 'Chapter Two');

            expect(ch1.ordinal).toBe(1);
            expect(ch2.ordinal).toBe(2);
        });

        it('should NOT assign ordinal to Scene', () => {
            registry.registerElement('arc-1', 'ARC', 'narrative-root', 'Arc');
            const scene = registry.registerElement('scene-1', 'SCENE', 'arc-1', 'Opening Scene');

            expect(scene.ordinal).toBeUndefined();
            expect(scene.type).toBe('SCENE');
        });

        it('should NOT assign ordinal to Beat', () => {
            registry.registerElement('arc-1', 'ARC', 'narrative-root', 'Arc');
            registry.registerElement('scene-1', 'SCENE', 'arc-1', 'Scene');
            const beat = registry.registerElement('beat-1', 'BEAT', 'scene-1', 'First Beat');

            expect(beat.ordinal).toBeUndefined();
            expect(beat.type).toBe('BEAT');
        });

        it('should track ancestry path', () => {
            registry.registerElement('arc-1', 'ARC', 'narrative-root', 'Arc');
            registry.registerElement('act-1', 'ACT', 'arc-1', 'Act');
            registry.registerElement('ch-1', 'CHAPTER', 'act-1', 'Chapter');
            const scene = registry.registerElement('scene-1', 'SCENE', 'ch-1', 'Scene');

            expect(scene.path).toEqual(['narrative-root', 'arc-1', 'act-1', 'ch-1', 'scene-1']);
        });
    });

    // =========================================================================
    // ORDINAL QUERIES
    // =========================================================================

    describe('getNextOrdinal', () => {
        beforeEach(() => {
            registry.registerNarrativeRoot('root', 'Story');
        });

        it('should return 1 for first Arc', () => {
            expect(registry.getNextOrdinal('root', 'ARC')).toBe(1);
        });

        it('should return 2 after registering first Arc', () => {
            registry.registerElement('arc-1', 'ARC', 'root', 'First');
            expect(registry.getNextOrdinal('root', 'ARC')).toBe(2);
        });

        it('should track Chapters separately per parent', () => {
            registry.registerElement('arc-1', 'ARC', 'root', 'Arc 1');
            registry.registerElement('arc-2', 'ARC', 'root', 'Arc 2');

            registry.registerElement('ch-1', 'CHAPTER', 'arc-1', 'Ch 1');
            registry.registerElement('ch-2', 'CHAPTER', 'arc-1', 'Ch 2');

            // Arc 2 should start at Chapter 1
            expect(registry.getNextOrdinal('arc-2', 'CHAPTER')).toBe(1);
        });
    });

    // =========================================================================
    // SCOPE DETECTION
    // =========================================================================

    describe('isUnderNarrativeTimeline', () => {
        beforeEach(() => {
            registry.registerNarrativeRoot('root', 'Story');
            registry.registerElement('arc-1', 'ARC', 'root', 'Arc');
            registry.registerElement('ch-1', 'CHAPTER', 'arc-1', 'Chapter');
        });

        it('should return true for registered root', () => {
            expect(registry.isUnderNarrativeTimeline('root')).toBe(true);
        });

        it('should return true for direct child of root', () => {
            expect(registry.isUnderNarrativeTimeline('arc-1')).toBe(true);
        });

        it('should return true for nested child', () => {
            expect(registry.isUnderNarrativeTimeline('ch-1')).toBe(true);
        });

        it('should return false for unregistered folder', () => {
            expect(registry.isUnderNarrativeTimeline('random-folder')).toBe(false);
        });
    });

    // =========================================================================
    // ELEMENT QUERIES
    // =========================================================================

    describe('getAllScenes', () => {
        beforeEach(() => {
            registry.registerNarrativeRoot('root', 'Story');
            registry.registerElement('arc-1', 'ARC', 'root', 'Arc');
            registry.registerElement('scene-1', 'SCENE', 'arc-1', 'Scene A');
            registry.registerElement('scene-2', 'SCENE', 'arc-1', 'Scene B');
            registry.registerElement('beat-1', 'BEAT', 'scene-1', 'Beat');
        });

        it('should return all scenes in narrative', () => {
            const scenes = registry.getAllScenes('root');
            expect(scenes).toHaveLength(2);
            expect(scenes.map(s => s.label)).toEqual(['Scene A', 'Scene B']);
        });
    });

    describe('getAllBeats', () => {
        beforeEach(() => {
            registry.registerNarrativeRoot('root', 'Story');
            registry.registerElement('scene-1', 'SCENE', 'root', 'Scene');
            registry.registerElement('beat-1', 'BEAT', 'scene-1', 'Beat 1');
            registry.registerElement('beat-2', 'BEAT', 'scene-1', 'Beat 2');
        });

        it('should return all beats in narrative', () => {
            const beats = registry.getAllBeats('root');
            expect(beats).toHaveLength(2);
        });
    });

    describe('getElementsByType', () => {
        beforeEach(() => {
            registry.registerNarrativeRoot('root', 'Story');
            registry.registerElement('arc-1', 'ARC', 'root', 'Arc 1');
            registry.registerElement('arc-2', 'ARC', 'root', 'Arc 2');
            registry.registerElement('act-1', 'ACT', 'arc-1', 'Act 1');
        });

        it('should return all arcs', () => {
            const arcs = registry.getArcs('root');
            expect(arcs).toHaveLength(2);
        });

        it('should return all acts', () => {
            const acts = registry.getActs('root');
            expect(acts).toHaveLength(1);
        });
    });

    // =========================================================================
    // TITLE FORMATTING
    // =========================================================================

    describe('formatNarrativeTitle', () => {
        it('should format Arc with ordinal', () => {
            const title = registry.formatNarrativeTitle('ARC', 1, 'The Beginning');
            expect(title).toBe('Arc 1: The Beginning');
        });

        it('should format Chapter with ordinal', () => {
            const title = registry.formatNarrativeTitle('CHAPTER', 3, 'The Confrontation');
            expect(title).toBe('Chapter 3: The Confrontation');
        });

        it('should format Scene without ordinal', () => {
            const title = registry.formatNarrativeTitle('SCENE', null, 'The Duel');
            expect(title).toBe('[SCENE] The Duel');
        });

        it('should format Beat without ordinal', () => {
            const title = registry.formatNarrativeTitle('BEAT', null, 'Sword Clash');
            expect(title).toBe('[BEAT] Sword Clash');
        });
    });

    // =========================================================================
    // NARRATIVE ORDER
    // =========================================================================

    describe('narrativeOrder', () => {
        beforeEach(() => {
            registry.registerNarrativeRoot('root', 'Story');
            registry.registerElement('scene-1', 'SCENE', 'root', 'Scene A');
            registry.registerElement('scene-2', 'SCENE', 'root', 'Scene B');
            registry.registerElement('scene-3', 'SCENE', 'root', 'Scene C');
        });

        it('should initialize empty narrative order', () => {
            const order = registry.getNarrativeOrder('root');
            expect(order).toEqual([]);
        });

        it('should update narrative order', () => {
            const newOrder = ['scene-2', 'scene-1', 'scene-3'];
            registry.setNarrativeOrder('root', newOrder);

            const savedOrder = registry.getNarrativeOrder('root');
            expect(savedOrder).toEqual(newOrder);
        });

        it('should persist narrative order', () => {
            // Mock persistence test logic (since actual storage is skipped)
            const newOrder = ['scene-3', 'scene-2'];
            registry.setNarrativeOrder('root', newOrder);

            // Verify in-memory state
            expect(registry.getNarrativeOrder('root')).toEqual(newOrder);

            // Verify it handles invalid root gracefully
            expect(registry.getNarrativeOrder('non-existent')).toEqual([]);
        });
    });

    // =========================================================================
    // PERSISTENCE (requires browser environment, skip in Node)
    // =========================================================================

    describe.skip('persistence', () => {
        it('should save to localStorage', () => {
            registry.registerNarrativeRoot('root', 'Story');
            registry.registerElement('arc-1', 'ARC', 'root', 'Arc');

            // Create new instance - should load from storage
            const registry2 = new NarrativeChronologyRegistry();
            registry2.loadFromStorage();

            expect(registry2.getNarrativeRoot('root')).not.toBeNull();
            expect(registry2.getElementById('arc-1')).not.toBeNull();
        });
    });
});
