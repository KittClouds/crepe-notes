import React from 'react';
import { NodeRendererProps } from 'react-arborist';
import { ArboristNode } from '@/lib/arborist/types';
import {
    Folder as FolderIcon,
    FolderOpen,
    MoreVertical,
    Star,
    AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ENTITY_ICONS, ENTITY_KINDS, type EntityKind } from '@/lib/types/entityTypes';
import { getDisplayName } from '@/lib/utils/titleParser';
import { CustomNoteIcon } from '@/components/icons/CustomNoteIcon';

interface ArboristTreeNodeProps extends NodeRendererProps<ArboristNode> {
    onContextMenu?: (node: ArboristNode, e: React.MouseEvent) => void;
    isHovered?: boolean;
    folderTheme?: 'default' | 'structured' | 'minimal';
}

/**
 * ArboristTreeNode - Sleeker, less cartoonish file tree node (formerly V2)
 * 
 * Visual changes from V1:
 * - 1px thin connector lines (still entity-colored)
 * - Compact box-style toggles [+]/[-]
 * - Smaller row height (28px vs 32px)
 * - Tighter spacing and typography
 * 
 * Functionality preserved 1:1:
 * - Entity icons and colors
 * - Entity badges
 * - Favorites, mismatch warnings
 * - Context menu
 * - Drag handles
 */
export function ArboristTreeNode({
    node,
    style,
    dragHandle,
    onContextMenu,
    isHovered = false,
    folderTheme = 'default',
}: ArboristTreeNodeProps) {
    const data = node.data;
    const isFolder = data.type === 'folder';
    const isNote = data.type === 'note';

    // Icon selection - Entity notes get ENTITY_ICONS, plain notes get CustomNoteIcon, folders get Folder icons
    const isEntityNote = isNote && data.isEntity && data.entityKind;
    const EntityIcon = isEntityNote
        ? ENTITY_ICONS[data.entityKind as EntityKind]
        : null;
    const FolderIconComponent = node.isOpen ? FolderOpen : FolderIcon;

    // Entity color - only applied to entity notes and folders
    const iconColor = isEntityNote ? data.effectiveColor : (isFolder ? data.effectiveColor : undefined);

    // Kind mismatch detection - PRESERVED 1:1
    const hasKindMismatch = isNote &&
        data.isEntity &&
        data.entityKind &&
        (data.folderId || data.noteData?.folderId) &&
        data.inheritedKind &&
        data.entityKind !== data.inheritedKind;

    // V2: Smaller indent (16px vs 20px)
    const indent = 16;
    const level = node.level || 0;

    return (
        <div
            ref={dragHandle}
            style={{
                ...style,
                paddingLeft: `${level * indent}px`,
            }}
            className={cn(
                // V2: Smaller row height (h-7 = 28px vs h-8 = 32px)
                "relative flex items-center gap-1.5 h-7 w-full group/node pr-2",
                "transition-colors duration-100",
                node.isSelected && "bg-accent/80",
                isHovered && "bg-muted/50"
            )}
            onClick={() => node.isInternal && node.toggle()}
        >
            {/* V2: Continuous flowing tree lines - Theme Aware */}
            {level > 0 && folderTheme !== 'minimal' && (() => {
                const lines: React.ReactNode[] = [];
                const isLastChild = !node.nextSibling;

                // Structured = VS Code style (Strict vertical guides, no horizontal/curves)
                // Default = L-brackets + Animated particles
                const showParticles = folderTheme === 'default';
                const showHorizontal = folderTheme === 'default';

                // 1. Draw vertical ancestor lines (The "Tree Guides")
                for (let i = 0; i < level - 1; i++) {
                    let ancestor = node.parent;
                    for (let j = level - 2; j > i; j--) {
                        ancestor = ancestor?.parent ?? null;
                    }
                    if (ancestor?.nextSibling) {
                        lines.push(
                            <div
                                key={`vline-${i}`}
                                className="absolute top-0 bottom-0 opacity-30"
                                style={{
                                    left: `${i * indent + 8}px`,
                                    width: '1px',
                                    backgroundColor: iconColor,
                                }}
                            />
                        );
                    }
                }

                // 2. Draw Current Level Connector
                // For Structured: Draws full vertical guide if not last child, or stops at node if last.
                // For Default: Draws top half L-connector if last child.
                lines.push(
                    <div
                        key="vline-current"
                        className="absolute opacity-30"
                        style={{
                            left: `${(level - 1) * indent + 8}px`,
                            top: 0,
                            bottom: isLastChild ? '50%' : 0,
                            width: '1px',
                            backgroundColor: iconColor,
                        }}
                    >
                        {/* Animated particle (Default theme only) */}
                        {showParticles && (
                            <div
                                className="tree-line-particle"
                                style={{
                                    left: '-1px',
                                    backgroundColor: iconColor,
                                    color: iconColor,
                                    animationDelay: `${Math.random() * 2}s`,
                                }}
                            />
                        )}
                    </div>
                );

                // 3. Horizontal Connector (L-shape part)
                // Only for Default theme. Structured (VS Code) skips this.
                if (showHorizontal) {
                    lines.push(
                        <div
                            key="hline"
                            className="absolute opacity-30"
                            style={{
                                left: `${(level - 1) * indent + 8}px`,
                                top: '14px',
                                width: '10px',
                                height: '1px',
                                backgroundColor: iconColor,
                            }}
                        />
                    );
                }

                return <>{lines}</>;
            })()}

            {/* V2: Entity-colored dot toggle - filled = collapsed, ring = expanded */}
            {isFolder && (
                <button
                    className={cn(
                        "flex items-center justify-center shrink-0 z-10",
                        "w-4 h-4 rounded-full",
                        "transition-all duration-150",
                        "hover:scale-110",
                        !node.data.children?.length && "invisible"
                    )}
                    onClick={(e) => {
                        e.stopPropagation();
                        node.toggle();
                    }}
                >
                    {node.isOpen ? (
                        // Expanded: hollow ring
                        <div
                            className="w-2 h-2 rounded-full border-[1.5px] transition-all"
                            style={{ borderColor: iconColor }}
                        />
                    ) : (
                        // Collapsed: filled dot
                        <div
                            className="w-2 h-2 rounded-full transition-all"
                            style={{ backgroundColor: iconColor }}
                        />
                    )}
                </button>
            )}

            {/* Spacer for notes (align with folders) */}
            {isNote && <div className="h-4 w-4 shrink-0" />}

            {/* Icon - entity-colored for entities/folders, original colors for plain notes */}
            {isFolder ? (
                <FolderIconComponent
                    className="h-3.5 w-3.5 shrink-0 z-10"
                    style={{ color: iconColor }}
                    strokeWidth={1.5}
                />
            ) : isEntityNote && EntityIcon ? (
                <EntityIcon
                    className="h-3.5 w-3.5 shrink-0 z-10"
                    style={{ color: iconColor }}
                />
            ) : (
                <CustomNoteIcon
                    className="h-[22px] w-[22px] shrink-0 z-10"
                    useCurrentColor={false}
                />
            )}

            {/* Fantasy Date Badge - PRESERVED 1:1 */}
            {data.fantasyDate && (
                <span className="text-[8px] text-muted-foreground font-mono shrink-0 z-10 opacity-60">
                    {`D${data.fantasyDate.day}.M${data.fantasyDate.month}`}
                </span>
            )}

            {/* V2: Display name or Edit Input - entity-colored for main folders */}
            {node.isEditing ? (
                <input
                    type="text"
                    autoFocus
                    defaultValue={data.name}
                    className="flex-1 text-xs bg-transparent border border-border rounded px-1 py-0.5 z-10 outline-none focus:ring-1 focus:ring-ring"
                    style={{
                        color: (isFolder && data.entityKind && (data.isTypedRoot || level === 0))
                            ? iconColor
                            : undefined
                    }}
                    onFocus={(e) => e.target.select()}
                    onBlur={(e) => {
                        const newName = e.target.value.trim();
                        if (newName && newName !== data.name) {
                            node.submit(newName);
                        } else {
                            node.reset();
                        }
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            const newName = e.currentTarget.value.trim();
                            if (newName && newName !== data.name) {
                                node.submit(newName);
                            } else {
                                node.reset();
                            }
                        } else if (e.key === 'Escape') {
                            node.reset();
                        }
                    }}
                    onClick={(e) => e.stopPropagation()}
                />
            ) : (
                <span
                    className="truncate text-xs flex-1 z-10"
                    style={{
                        color: (isFolder && data.entityKind && (data.isTypedRoot || level === 0))
                            ? iconColor
                            : undefined
                    }}
                >
                    {getDisplayName(data.name) || (isFolder ? "New Folder" : "Untitled Note")}
                </span>
            )}

            {/* Entity badge - uses CSS variables */}
            {data.entityKind && ENTITY_KINDS.includes(data.entityKind as EntityKind) && (
                <span
                    className="text-[9px] px-1 py-0.5 rounded font-medium shrink-0 z-10"
                    style={{
                        backgroundColor: `hsl(var(--entity-${data.entityKind.toLowerCase().replace('_', '-')}) / 0.15)`,
                        color: `hsl(var(--entity-${data.entityKind.toLowerCase().replace('_', '-')}))`,
                    }}
                >
                    {data.entitySubtype
                        ? `${data.entityKind}:${data.entitySubtype}`
                        : data.entityKind}
                </span>
            )}

            {/* Kind mismatch warning - PRESERVED 1:1 */}
            {hasKindMismatch && (
                <AlertTriangle
                    className="h-3 w-3 shrink-0 text-amber-500 z-10"
                    strokeWidth={1.5}
                />
            )}

            {/* Favorite star - PRESERVED 1:1 */}
            {isNote && data.favorite && (
                <Star className="h-3 w-3 shrink-0 fill-yellow-400 text-yellow-400 z-10" />
            )}

            {/* Context menu trigger - PRESERVED 1:1 */}
            <div className="opacity-0 group-hover/node:opacity-100 transition-opacity z-10">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 p-0"
                    onClick={(e) => {
                        e.stopPropagation();
                        onContextMenu?.(data, e);
                    }}
                >
                    <MoreVertical className="h-3 w-3" />
                </Button>
            </div>
        </div>
    );
}
