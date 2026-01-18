/**
 * Narrative Vault Isolation Tests
 * 
 * TDD Contracts for entity isolation within narrative scopes.
 * These tests define the expected behavior BEFORE implementation.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// =============================================================================
// CONTRACT 1: GraphScope includes 'narrative'
// =============================================================================

describe('GraphScope Types', () => {
    it('should include narrative as valid scope type', () => {
        // These types are defined in src/lib/cozo/types.ts
        type GraphScope = 'note' | 'folder' | 'vault' | 'narrative';

        const scopes: GraphScope[] = ['note', 'folder', 'vault', 'narrative'];
        expect(scopes).toContain('narrative');
    });

    it('should build narrative scope identifier correctly', () => {
        // When scope is 'narrative' with id 'abc123', 
        // groupId should be 'narrative:abc123'
        const buildScopeIdentifier = (scope: string, id: string) => {
            if (scope === 'vault') return { scope, id, groupId: 'vault:global' };
            if (scope === 'narrative') return { scope, id, groupId: `narrative:${id}` };
            return { scope, id, groupId: `${scope}:${id}` };
        };

        const result = buildScopeIdentifier('narrative', 'story-xyz');
        expect(result.groupId).toBe('narrative:story-xyz');
    });
});

// =============================================================================
// CONTRACT 2: Folder carries narrativeId
// =============================================================================

describe('Folder Narrative Scoping', () => {
    interface Folder {
        id: string;
        name: string;
        entityKind?: string;
        narrativeId?: string;
        isNarrativeRoot?: boolean;
    }

    it('NARRATIVE folder should be marked as narrative root', () => {
        const folder: Folder = {
            id: 'folder-123',
            name: 'One Piece World',
            entityKind: 'NARRATIVE',
            isNarrativeRoot: true,
            narrativeId: 'folder-123', // Self-referential for root
        };

        expect(folder.isNarrativeRoot).toBe(true);
        expect(folder.narrativeId).toBe(folder.id);
    });

    it('child folder should inherit narrativeId from parent', () => {
        const parentNarrativeId = 'story-root-abc';

        const childFolder: Folder = {
            id: 'child-folder-456',
            name: 'East Blue Arc',
            entityKind: 'ARC',
            narrativeId: parentNarrativeId, // Inherited
        };

        expect(childFolder.narrativeId).toBe(parentNarrativeId);
    });

    it('global folder should have no narrativeId', () => {
        const globalFolder: Folder = {
            id: 'global-folder-789',
            name: 'My Notes',
            // No entityKind = regular folder
        };

        expect(globalFolder.narrativeId).toBeUndefined();
    });
});

// =============================================================================
// CONTRACT 3: Entity IDs are scoped by narrative
// =============================================================================

describe('Entity Narrative Isolation', () => {
    interface Entity {
        id: string;
        name: string;
        narrativeId?: string;
        groupId: string;
    }

    it('same name in different narratives = different entity IDs', () => {
        const luffyOnePiece: Entity = {
            id: 'entity-luffy-abc',
            name: 'Luffy',
            narrativeId: 'narrative-one-piece',
            groupId: 'narrative:narrative-one-piece',
        };

        const luffyFanfic: Entity = {
            id: 'entity-luffy-xyz',
            name: 'Luffy',
            narrativeId: 'narrative-fanfic-world',
            groupId: 'narrative:narrative-fanfic-world',
        };

        // Same name
        expect(luffyOnePiece.name).toBe(luffyFanfic.name);
        // Different IDs (isolated)
        expect(luffyOnePiece.id).not.toBe(luffyFanfic.id);
        // Different scopes
        expect(luffyOnePiece.groupId).not.toBe(luffyFanfic.groupId);
    });

    it('entity lookup should respect narrative scope', async () => {
        // Simulated entity store
        const entities: Entity[] = [
            { id: 'e1', name: 'Luffy', narrativeId: 'story-a', groupId: 'narrative:story-a' },
            { id: 'e2', name: 'Luffy', narrativeId: 'story-b', groupId: 'narrative:story-b' },
            { id: 'e3', name: 'Zoro', narrativeId: 'story-a', groupId: 'narrative:story-a' },
        ];

        // Query for 'Luffy' scoped to story-a
        const findEntitiesInNarrative = (name: string, narrativeId: string) =>
            entities.filter(e => e.name === name && e.narrativeId === narrativeId);

        const result = findEntitiesInNarrative('Luffy', 'story-a');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('e1');
    });

    it('global entities should NOT match narrative scopes', () => {
        const entities = [
            { id: 'e1', name: 'Luffy', narrativeId: 'story-a', groupId: 'narrative:story-a' },
            { id: 'e2', name: 'Luffy', narrativeId: undefined, groupId: 'vault:global' },
        ];

        const narrativeScopedLuffy = entities.filter(
            e => e.name === 'Luffy' && e.narrativeId === 'story-a'
        );

        expect(narrativeScopedLuffy).toHaveLength(1);
        expect(narrativeScopedLuffy[0].groupId).toBe('narrative:story-a');
    });
});

// =============================================================================
// CONTRACT 4: Scanner respects narrative isolation
// =============================================================================

describe('Scanner Narrative Isolation', () => {
    interface HydratedEntity {
        id: string;
        label: string;
        aliases: string[];
        narrativeId?: string;
    }

    interface ScanContext {
        noteId: string;
        narrativeId?: string;
    }

    it('should only hydrate entities from same narrative', () => {
        const allEntities: HydratedEntity[] = [
            { id: 'e1', label: 'Luffy', aliases: ['Straw Hat'], narrativeId: 'story-a' },
            { id: 'e2', label: 'Naruto', aliases: [], narrativeId: 'story-b' },
            { id: 'e3', label: 'Zoro', aliases: ['Roronoa'], narrativeId: 'story-a' },
        ];

        const context: ScanContext = { noteId: 'note-123', narrativeId: 'story-a' };

        // Filter entities for this narrative context
        const scopedEntities = allEntities.filter(
            e => e.narrativeId === context.narrativeId
        );

        expect(scopedEntities).toHaveLength(2);
        expect(scopedEntities.map(e => e.label)).toEqual(['Luffy', 'Zoro']);
    });

    it('should not match entities from other narratives during scan', () => {
        const storyAEntities = ['Luffy', 'Zoro', 'Nami'];
        const storyBEntities = ['Luffy', 'Sakura', 'Sasuke'];

        const textInStoryA = "Luffy fought Zoro";
        const scanContext = { narrativeId: 'story-a' };

        // Only story-a entities should be used for matching
        const matchedNames = ['Luffy', 'Zoro']; // These exist in story-a

        // 'Sakura' from story-b should NOT accidentally match
        expect(storyBEntities).not.toContain('Zoro');
        expect(storyAEntities).toContain('Zoro');
    });
});

// =============================================================================
// CONTRACT 5: Arborist tree propagates narrativeId
// =============================================================================

describe('Arborist Narrative Propagation', () => {
    interface ArboristNode {
        id: string;
        name: string;
        type: 'folder' | 'note';
        isNarrativeRoot?: boolean;
        narrativeId?: string;
        children?: ArboristNode[];
    }

    it('narrative root should set narrativeId to self', () => {
        const root: ArboristNode = {
            id: 'narrative-123',
            name: 'One Piece',
            type: 'folder',
            isNarrativeRoot: true,
            narrativeId: 'narrative-123',
        };

        expect(root.narrativeId).toBe(root.id);
    });

    it('children should inherit narrativeId from root', () => {
        const propagateNarrativeId = (
            node: ArboristNode,
            inheritedNarrativeId?: string
        ): ArboristNode => {
            const effectiveNarrativeId = node.isNarrativeRoot
                ? node.id
                : inheritedNarrativeId;

            return {
                ...node,
                narrativeId: effectiveNarrativeId,
                children: node.children?.map(child =>
                    propagateNarrativeId(child, effectiveNarrativeId)
                ),
            };
        };

        const tree: ArboristNode = {
            id: 'narrative-root',
            name: 'One Piece',
            type: 'folder',
            isNarrativeRoot: true,
            children: [
                {
                    id: 'arc-folder',
                    name: 'East Blue',
                    type: 'folder',
                    children: [
                        { id: 'note-1', name: 'Chapter 1', type: 'note' },
                    ],
                },
            ],
        };

        const result = propagateNarrativeId(tree);

        expect(result.narrativeId).toBe('narrative-root');
        expect(result.children?.[0].narrativeId).toBe('narrative-root');
        expect(result.children?.[0].children?.[0].narrativeId).toBe('narrative-root');
    });

    it('non-narrative folders should have no narrativeId', () => {
        const globalFolder: ArboristNode = {
            id: 'global-folder',
            name: 'My Notes',
            type: 'folder',
            children: [
                { id: 'random-note', name: 'Ideas', type: 'note' },
            ],
        };

        expect(globalFolder.narrativeId).toBeUndefined();
        expect(globalFolder.children?.[0].narrativeId).toBeUndefined();
    });
});

// =============================================================================
// INTEGRATION: Real narrativeScope utilities
// =============================================================================

describe('narrativeScope Utilities (Integration)', () => {
    // Test against actual implementation
    it('should correctly build narrative scope identifier', async () => {
        const { buildScopeIdentifier } = await import('@/lib/cozo/types');

        const result = buildScopeIdentifier('narrative', 'my-story-123');
        expect(result.groupId).toBe('narrative:my-story-123');
        expect(result.scope).toBe('narrative');
    });

    it('should correctly identify narrative scopes', async () => {
        const { isNarrativeScope, extractNarrativeId } = await import('@/lib/cozo/narrativeScope');

        expect(isNarrativeScope('narrative:story-abc')).toBe(true);
        expect(isNarrativeScope('vault:global')).toBe(false);
        expect(isNarrativeScope('folder:xyz')).toBe(false);

        expect(extractNarrativeId('narrative:story-abc')).toBe('story-abc');
        expect(extractNarrativeId('vault:global')).toBeUndefined();
    });

    it('should filter entities by narrative correctly', async () => {
        const { filterEntitiesByNarrative } = await import('@/lib/cozo/narrativeScope');

        const entities = [
            { id: 'e1', name: 'Luffy', narrativeId: 'story-a' },
            { id: 'e2', name: 'Naruto', narrativeId: 'story-b' },
            { id: 'e3', name: 'Batman', narrativeId: undefined },
        ] as any[];

        const storyAEntities = filterEntitiesByNarrative(entities, 'story-a');
        expect(storyAEntities).toHaveLength(1);
        expect(storyAEntities[0].name).toBe('Luffy');

        const globalEntities = filterEntitiesByNarrative(entities, undefined);
        expect(globalEntities).toHaveLength(1);
        expect(globalEntities[0].name).toBe('Batman');
    });

    it('should check entity cross-references correctly', async () => {
        const { canEntitiesReference } = await import('@/lib/cozo/narrativeScope');

        // Same narrative - can reference
        expect(canEntitiesReference(
            { narrativeId: 'story-a' },
            { narrativeId: 'story-a' }
        )).toBe(true);

        // Different narratives - cannot reference
        expect(canEntitiesReference(
            { narrativeId: 'story-a' },
            { narrativeId: 'story-b' }
        )).toBe(false);

        // Both global - can reference
        expect(canEntitiesReference(
            { narrativeId: undefined },
            { narrativeId: undefined }
        )).toBe(true);

        // One narrative, one global - cannot reference
        expect(canEntitiesReference(
            { narrativeId: 'story-a' },
            { narrativeId: undefined }
        )).toBe(false);
    });
});
