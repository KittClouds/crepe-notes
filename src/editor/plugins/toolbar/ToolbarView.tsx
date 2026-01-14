// src/editor/plugins/toolbar/ToolbarView.tsx
// React component for the selection toolbar
// Uses vanilla DOM approach since we don't have MilkdownProvider wrapper

import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { TooltipProvider } from '@milkdown/kit/plugin/tooltip';
import { commandsCtx } from '@milkdown/kit/core';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { Ctx } from '@milkdown/kit/ctx';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { EditorState, PluginView } from '@milkdown/kit/prose/state';
import { TextSelection } from '@milkdown/kit/prose/state';

import { TOOLBAR_ITEMS, ChevronDown } from './commands';
import { ColorPicker } from './ColorPicker';
import { setTextColorCommand } from '../marks';
import type { ToolbarButton, ToolbarDropdown, ToolbarItem, DropdownItem } from './types';
import './toolbar.css';

// ============================================================================
// Plugin View - Creates vanilla DOM container and mounts React
// ============================================================================

export class SelectionToolbarPluginView implements PluginView {
    private tooltipProvider: TooltipProvider;
    private content: HTMLElement;
    private root: Root;
    private ctx: Ctx;

    constructor(ctx: Ctx, view: EditorView) {
        this.ctx = ctx;

        // Create container element
        this.content = document.createElement('div');
        this.content.className = 'selection-toolbar-wrapper';

        // Mount React root
        this.root = createRoot(this.content);
        this.root.render(
            <SelectionToolbar ctx={ctx} onHide={() => this.tooltipProvider.hide()} />
        );

        // Create tooltip provider for positioning
        this.tooltipProvider = new TooltipProvider({
            content: this.content,
            debounce: 50,
            offset: { mainAxis: 10 },
            shouldShow: (view: EditorView) => {
                const { doc, selection } = view.state;
                const { empty, from, to } = selection;

                // Don't show if selection is empty
                if (empty) return false;

                // Don't show if not a text selection
                if (!(selection instanceof TextSelection)) return false;

                // Don't show if no actual text selected
                const isEmptyTextBlock = !doc.textBetween(from, to).length;
                if (isEmptyTextBlock) return false;

                // Don't show if editor is readonly
                if (!view.editable) return false;

                // Don't show if tooltip children have focus
                const activeElement = (view.dom.getRootNode() as ShadowRoot | Document).activeElement;
                const isTooltipChildren = this.content.contains(activeElement);
                if (!view.hasFocus() && !isTooltipChildren) return false;

                return true;
            },
        });

        this.update(view);
    }

    update = (view: EditorView, prevState?: EditorState) => {
        this.tooltipProvider.update(view, prevState);
        // Re-render React with updated selection state
        this.root.render(
            <SelectionToolbar
                ctx={this.ctx}
                onHide={() => this.tooltipProvider.hide()}
                selection={view.state.selection}
            />
        );
    };

    destroy = () => {
        this.tooltipProvider.destroy();
        this.root.unmount();
        this.content.remove();
    };
}

// ============================================================================
// React Component
// ============================================================================

interface SelectionToolbarProps {
    ctx: Ctx;
    onHide: () => void;
    selection?: any;
}

function SelectionToolbar({ ctx, onHide, selection }: SelectionToolbarProps) {
    const action = useCallback(
        (fn: (ctx: Ctx) => void) => {
            try {
                fn(ctx);
            } catch (err) {
                console.error('[Toolbar] Command error:', err);
            }
        },
        [ctx]
    );

    const handleButtonClick = (item: ToolbarButton) => (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        action(item.onRun);
    };

    const isActive = (item: ToolbarButton): boolean => {
        if (!item.isActive) return false;
        try {
            return item.isActive(ctx);
        } catch {
            return false;
        }
    };

    return (
        <Tooltip.Provider delayDuration={300}>
            <div className="selection-toolbar">
                {TOOLBAR_ITEMS.map((item) => (
                    <ToolbarItemRenderer
                        key={item.id}
                        item={item}
                        ctx={ctx}
                        onButtonClick={handleButtonClick}
                        isActive={isActive}
                        action={action}
                    />
                ))}
            </div>
        </Tooltip.Provider>
    );
}

// ============================================================================
// Item Renderer
// ============================================================================

interface ToolbarItemRendererProps {
    item: ToolbarItem;
    ctx: Ctx;
    onButtonClick: (item: ToolbarButton) => (e: React.MouseEvent) => void;
    isActive: (item: ToolbarButton) => boolean;
    action: (fn: (ctx: Ctx) => void) => void;
}

function ToolbarItemRenderer({
    item,
    ctx,
    onButtonClick,
    isActive,
    action,
}: ToolbarItemRendererProps) {
    if (item.type === 'separator') {
        return <div className="toolbar-separator" />;
    }

    if (item.type === 'button') {
        const active = isActive(item);
        return (
            <Tooltip.Root>
                <Tooltip.Trigger asChild>
                    <button
                        type="button"
                        className={`toolbar-button ${active ? 'active' : ''}`}
                        onMouseDown={(e) => {
                            e.preventDefault(); // Prevent editor blur
                        }}
                        onClick={onButtonClick(item)}
                    >
                        {item.icon}
                    </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                    <Tooltip.Content className="toolbar-tooltip" sideOffset={5}>
                        <span>{item.label}</span>
                        {item.shortcut && (
                            <kbd className="toolbar-shortcut">{item.shortcut}</kbd>
                        )}
                        <Tooltip.Arrow className="toolbar-tooltip-arrow" />
                    </Tooltip.Content>
                </Tooltip.Portal>
            </Tooltip.Root>
        );
    }

    if (item.type === 'dropdown') {
        // Use enhanced ColorPicker for text-color and highlight
        if (item.id === 'text-color' || item.id === 'highlight') {
            return (
                <ColorPicker
                    type={item.id}
                    icon={item.icon}
                    label={item.label}
                    onColorSelect={(color) => {
                        // Find the matching item or use the color directly
                        const matchingItem = item.items.find(i => i.color === color);
                        if (matchingItem) {
                            action(matchingItem.onRun);
                        } else if (color) {
                            // Direct color selection (from custom picker)
                            action((ctx) => {
                                ctx.get(commandsCtx).call(setTextColorCommand.key, color);
                            });
                        } else {
                            // null = remove color
                            const defaultItem = item.items.find(i => i.id === 'default' || i.id === 'none');
                            if (defaultItem) action(defaultItem.onRun);
                        }
                    }}
                />
            );
        }
        return <ToolbarDropdownRenderer item={item} action={action} />;
    }

    return null;
}

// ============================================================================
// Dropdown Renderer
// ============================================================================

interface ToolbarDropdownRendererProps {
    item: ToolbarDropdown;
    action: (fn: (ctx: Ctx) => void) => void;
}

function ToolbarDropdownRenderer({ item, action }: ToolbarDropdownRendererProps) {
    const isColorPicker = item.id === 'text-color' || item.id === 'highlight';

    return (
        <DropdownMenu.Root>
            <Tooltip.Root>
                <Tooltip.Trigger asChild>
                    <DropdownMenu.Trigger asChild>
                        <button
                            type="button"
                            className="toolbar-button toolbar-dropdown-trigger"
                            onMouseDown={(e) => e.preventDefault()}
                        >
                            {item.icon}
                            <ChevronDown size={10} className="ml-0.5 opacity-60" />
                        </button>
                    </DropdownMenu.Trigger>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                    <Tooltip.Content className="toolbar-tooltip" sideOffset={5}>
                        {item.label}
                        <Tooltip.Arrow className="toolbar-tooltip-arrow" />
                    </Tooltip.Content>
                </Tooltip.Portal>
            </Tooltip.Root>

            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    className="toolbar-dropdown-content"
                    sideOffset={8}
                    onCloseAutoFocus={(e) => e.preventDefault()}
                >
                    {isColorPicker ? (
                        <div className="toolbar-color-grid">
                            {item.items.map((dropdownItem) => (
                                <DropdownMenu.Item
                                    key={dropdownItem.id}
                                    className="toolbar-color-swatch"
                                    style={{ backgroundColor: dropdownItem.color }}
                                    onSelect={() => action(dropdownItem.onRun)}
                                    title={dropdownItem.label}
                                />
                            ))}
                        </div>
                    ) : (
                        item.items.map((dropdownItem) => (
                            <DropdownMenu.Item
                                key={dropdownItem.id}
                                className="toolbar-dropdown-item"
                                onSelect={() => action(dropdownItem.onRun)}
                            >
                                {dropdownItem.icon && (
                                    <span className="toolbar-dropdown-icon">{dropdownItem.icon}</span>
                                )}
                                <span>{dropdownItem.label}</span>
                            </DropdownMenu.Item>
                        ))
                    )}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
}
