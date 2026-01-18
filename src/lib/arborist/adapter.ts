import { ArboristNode, ArboristTree } from './types';
import type { Folder, Note, FolderWithChildren } from '@/types/noteTypes';
import { getEntityColor } from '@/lib/store/entityColorStore';
import { ENTITY_KINDS } from '@/lib/types/entityTypes';

const DEFAULT_COLORS = [
    "#3b82f6", "#10b981", "#8b5cf6", "#ec4899",
    "#f59e0b", "#ef4444", "#14b8a6", "#6366f1"
];

/**
 * Check if a kind is a valid entity kind
 */
function isValidKind(kind: string | undefined): boolean {
    return !!kind && ENTITY_KINDS.includes(kind as any);
}

/**
 * Recursively transform FolderWithChildren tree to Arborist-compatible format
 * Preserves color inheritance and entity semantics
 * Propagates narrativeId for vault isolation
 */
function transformFolderToNode(
    folder: FolderWithChildren,
    depth: number = 0,
    parentColor?: string,
    parentNarrativeId?: string
): ArboristNode {
    // Map DB fields (snake_case) to UI fields (camelCase) if missing
    const rawFolder = folder as any;
    const entityKind = (folder.entityKind || rawFolder.entity_kind) as any;
    const entitySubtype = folder.entitySubtype || rawFolder.entity_subtype;
    const parentId = folder.parent_id || rawFolder.parent_id; // Handle all casings
    const inheritedKind = (folder as any).inheritedKind || rawFolder.inherited_kind || entityKind; // Folders can inherit from themselves or explicit prop
    const inheritedSubtype = (folder as any).inheritedSubtype || rawFolder.inherited_subtype || entitySubtype;

    // Narrative Vault Detection: NARRATIVE folders are vault roots
    const isNarrativeRoot = entityKind === 'NARRATIVE';
    // If this is a narrative root, use own ID. Otherwise inherit from parent.
    const narrativeId = isNarrativeRoot
        ? folder.id
        : (folder.narrativeId || rawFolder.narrative_id || parentNarrativeId);

    // Compute scope ID for this folder
    // Rule: narrative content → narrative scope, otherwise folder scope
    const computedScopeId = narrativeId
        ? `narrative:${narrativeId}`
        : `folder:${folder.id}`;

    // Color resolution: folder.color → parentColor → entity CSS var → default by depth
    const effectiveColor = folder.color
        || parentColor
        || (isValidKind(entityKind) ? getEntityColor(entityKind) : undefined)
        || DEFAULT_COLORS[depth % DEFAULT_COLORS.length];

    // Transform child notes to leaf nodes
    const noteNodes: ArboristNode[] = (folder.notes || []).map(note => {
        const rawNote = note as any;
        const noteKind = (note.entityKind || rawNote.entity_kind) as any;
        const noteSubtype = note.entitySubtype || rawNote.entity_subtype;

        // Compute scope ID for this note
        // Rule: note-only for notes (design decision #1)
        // Exception: narrative content uses vault-wide (design decision #2)
        const noteScopeId = narrativeId
            ? `narrative:${narrativeId}`  // Vault-wide for narrative content
            : `note:${note.id}`;          // Note-only for global notes

        return {
            id: note.id,
            name: note.title,
            type: 'note' as const,
            isEntity: typeof note.isEntity === 'boolean' ? note.isEntity : (note.isEntity === 1 || !!note.isEntity),
            entityKind: noteKind,
            entitySubtype: noteSubtype,
            entityLabel: note.entityLabel || rawNote.entity_label,
            favorite: typeof note.favorite === 'number' ? note.favorite : (note.favorite ? 1 : 0),
            isPinned: typeof note.isPinned === 'number' ? note.isPinned : (note.isPinned ? 1 : 0),
            folderId: note.parent_id || rawNote.parent_id || undefined,
            inheritedKind,
            inheritedSubtype,
            effectiveColor,
            depth: depth + 1,
            size: (note.content || '').length,  // D3-style metric
            noteData: note,
            // Propagate narrativeId to notes
            narrativeId,
            // Computed scope for entity filtering
            computedScopeId: noteScopeId,
        };
    });

    // Transform child folders recursively - pass narrativeId for propagation
    const folderNodes: ArboristNode[] = (folder.children || []).map(subfolder =>
        transformFolderToNode(subfolder, depth + 1, effectiveColor, narrativeId)
    );

    // Combine children: folders first, then notes
    const children = [...folderNodes, ...noteNodes];

    return {
        id: folder.id,
        name: folder.name,
        type: 'folder' as const,
        children: children.length > 0 ? children : undefined,
        parentId: parentId || undefined,
        color: folder.color || undefined,
        entityKind,
        entitySubtype,
        entityLabel: (folder as any).entityLabel || rawFolder.entity_label,
        isTypedRoot: !!folder.isTypedRoot || rawFolder.is_typed_root === 1,
        isSubtypeRoot: (folder as any).isSubtypeRoot || rawFolder.is_subtype_root === 1,
        inheritedKind,
        inheritedSubtype,
        networkId: (folder as any).networkId,
        // Narrative vault isolation
        isNarrativeRoot,
        narrativeId,
        // Computed scope for entity filtering
        computedScopeId,
        effectiveColor,
        depth,
        count: children.length,
        fantasyDate: (folder as any).fantasy_date || rawFolder.fantasy_date,
        folderData: {
            ...folder,
            // Ensure folderData has correct props for TypedFolderMenu
            entityKind,
            entitySubtype,
            narrativeId,
            isNarrativeRoot,
        },
    };
}

/**
 * Build Arborist tree from NotesContext data
 */
export function buildArboristTree(
    folderTree: FolderWithChildren[],
    globalNotes: Note[]
): ArboristTree {
    const rootFolders = folderTree.map(folder => transformFolderToNode(folder, 0));

    // Add global notes (no folder) as root-level nodes
    const rootNotes: ArboristNode[] = globalNotes.map(note => {
        const rawNote = note as any;
        const noteKind = (note.entityKind || rawNote.entity_kind) as any;

        return {
            id: note.id,
            name: note.title,
            type: 'note' as const,
            isEntity: typeof note.isEntity === 'boolean' ? note.isEntity : (note.isEntity === 1 || !!note.isEntity),
            entityKind: noteKind,
            entitySubtype: note.entitySubtype || rawNote.entity_subtype,
            entityLabel: note.entityLabel || rawNote.entity_label,
            favorite: typeof note.favorite === 'number' ? note.favorite : (note.favorite ? 1 : 0),
            isPinned: typeof note.isPinned === 'number' ? note.isPinned : (note.isPinned ? 1 : 0),
            folderId: undefined,
            effectiveColor: isValidKind(noteKind)
                ? getEntityColor(noteKind)
                : DEFAULT_COLORS[0],
            depth: 0,
            size: (note.content || '').length,
            noteData: note,
        };
    });

    return [...rootFolders, ...rootNotes];
}

/**
 * Get parent node color for inheritance (for hover effects, etc.)
 */
export function getParentColor(
    nodeId: string,
    tree: ArboristTree
): string | undefined {
    // Recursive search for node's parent
    function findParent(nodes: ArboristNode[], targetId: string): ArboristNode | null {
        for (const node of nodes) {
            if (node.children?.some(child => child.id === targetId)) {
                return node;
            }
            if (node.children) {
                const found = findParent(node.children, targetId);
                if (found) return found;
            }
        }
        return null;
    }

    const parent = findParent(tree, nodeId);
    return parent?.effectiveColor;
}
