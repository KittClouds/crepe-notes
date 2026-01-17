
import { describe, it, expect, beforeEach } from 'vitest';
import { ImplicitCore } from './implicit-scan';
import type { RegisteredEntity } from '../registry/SmartGraphRegistry';

// Mock data
const mockEntities: RegisteredEntity[] = [
    {
        id: 'char_luffy',
        label: 'Monkey D. Luffy',
        kind: 'CHARACTER',
        aliases: ['Straw Hat'],
        // ... other boilerplate fields
        mentionsByNote: new Map(),
        totalMentions: 0,
        lastSeenDate: new Date(),
        createdAt: new Date(),
        createdBy: 'user',
        firstNote: 'n1'
    },
    {
        id: 'loc_shire',
        label: 'The Shire',
        kind: 'LOCATION',
        aliases: [],
        mentionsByNote: new Map(),
        totalMentions: 0,
        lastSeenDate: new Date(),
        createdAt: new Date(),
        createdBy: 'user',
        firstNote: 'n2'
    }
];

describe('ImplicitCore', () => {
    let core: ImplicitCore;

    beforeEach(() => {
        core = new ImplicitCore();
    });

    it('should hydrate and find exact matches', () => {
        core.hydrate(mockEntities);
        const results = core.scan('Monkey D. Luffy is the king.');

        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
            type: 'entity_implicit',
            label: 'Monkey D. Luffy',
            matchedText: 'Monkey D. Luffy',
            from: 0,
            to: 15
        });
    });

    it('should find explicit aliases', () => {
        core.hydrate(mockEntities);
        const results = core.scan('The Straw Hat pirate.');

        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
            type: 'entity_implicit',
            label: 'Monkey D. Luffy', // Should resolve to primary label
            matchedText: 'Straw Hat'
        });
    });

    it('should generate and find implicit aliases (Smart Aliases)', () => {
        // "Monkey D. Luffy" -> "Luffy"
        core.hydrate(mockEntities);
        const results = core.scan('Luffy ate meat.');

        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
            type: 'entity_implicit',
            label: 'Monkey D. Luffy',
            matchedText: 'Luffy'
        });
    });

    it('should handle multiple entities in text', () => {
        core.hydrate(mockEntities);
        const results = core.scan('Luffy visited The Shire.');

        expect(results).toHaveLength(2);
        // Order depends on implementation, but both should be there
        const labels = results.map(r => r.label).sort();
        expect(labels).toEqual(['Monkey D. Luffy', 'The Shire']);
    });

    it('should prevent overlapping matches (longest wins)', () => {
        // "Monkey D. Luffy" contains "Luffy"
        // If we type "Monkey D. Luffy", we shouldn't get two matches overlapping
        core.hydrate(mockEntities);
        const results = core.scan('Monkey D. Luffy');

        expect(results).toHaveLength(1);
        expect(results[0].matchedText).toBe('Monkey D. Luffy');
    });

    it('should use caching for repeated calls', () => {
        core.hydrate(mockEntities);
        const text = 'Luffy runs.';
        const first = core.scan(text);
        const second = core.scan(text);

        expect(first).toEqual(second);
        // We can't easily inspect internal cache state without exposing it, 
        // but this ensures consistency.
    });
});
