// Block Handle UI Component with tabbed menu
import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tabs from '@radix-ui/react-tabs';
import {
    GripVertical, Plus, Trash2, Copy, Clipboard,
    AlignLeft, AlignCenter, AlignRight, ChevronRight, ChevronDown,
    Heading1, Heading2, Heading3, Heading4, Heading5, Heading6,
    Quote, Minus, List, ListOrdered, CheckSquare,
    Image, Code, Table, Calculator, Pilcrow
} from 'lucide-react';
import type { Ctx } from '@milkdown/kit/ctx';
import { commandsCtx } from '@milkdown/kit/core';
import {
    setBlockTypeCommand,
    wrapInBlockTypeCommand,
    addBlockTypeCommand,
    clearTextInCurrentBlockCommand,
    headingSchema,
    blockquoteSchema,
    hrSchema,
    bulletListSchema,
    orderedListSchema,
    codeBlockSchema,
    paragraphSchema,
} from '@milkdown/kit/preset/commonmark';
import { insertDetailsCommand } from '../details';

interface BlockHandleUIProps {
    ctx: Ctx;
    onAdd?: () => void;
}

export function BlockHandleUI({ ctx, onAdd }: BlockHandleUIProps) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    // Command helpers
    const runCommand = (action: (ctx: Ctx) => void) => {
        try {
            action(ctx);
            setIsMenuOpen(false);
        } catch (e) {
            console.error('[BlockHandle] Command error:', e);
        }
    };

    const insertHeading = (level: number) => runCommand((ctx) => {
        const commands = ctx.get(commandsCtx);
        const heading = headingSchema.type(ctx);
        commands.call(clearTextInCurrentBlockCommand.key);
        commands.call(setBlockTypeCommand.key, { nodeType: heading, attrs: { level } });
    });

    const insertParagraph = () => runCommand((ctx) => {
        const commands = ctx.get(commandsCtx);
        const paragraph = paragraphSchema.type(ctx);
        commands.call(clearTextInCurrentBlockCommand.key);
        commands.call(setBlockTypeCommand.key, { nodeType: paragraph });
    });

    const insertQuote = () => runCommand((ctx) => {
        const commands = ctx.get(commandsCtx);
        const blockquote = blockquoteSchema.type(ctx);
        commands.call(clearTextInCurrentBlockCommand.key);
        commands.call(wrapInBlockTypeCommand.key, { nodeType: blockquote });
    });

    const insertDivider = () => runCommand((ctx) => {
        const commands = ctx.get(commandsCtx);
        const hr = hrSchema.type(ctx);
        commands.call(clearTextInCurrentBlockCommand.key);
        commands.call(addBlockTypeCommand.key, { nodeType: hr });
    });

    const insertBulletList = () => runCommand((ctx) => {
        const commands = ctx.get(commandsCtx);
        const bulletList = bulletListSchema.type(ctx);
        commands.call(clearTextInCurrentBlockCommand.key);
        commands.call(wrapInBlockTypeCommand.key, { nodeType: bulletList });
    });

    const insertOrderedList = () => runCommand((ctx) => {
        const commands = ctx.get(commandsCtx);
        const orderedList = orderedListSchema.type(ctx);
        commands.call(clearTextInCurrentBlockCommand.key);
        commands.call(wrapInBlockTypeCommand.key, { nodeType: orderedList });
    });

    const insertCodeBlock = () => runCommand((ctx) => {
        const commands = ctx.get(commandsCtx);
        const codeBlock = codeBlockSchema.type(ctx);
        commands.call(clearTextInCurrentBlockCommand.key);
        commands.call(setBlockTypeCommand.key, { nodeType: codeBlock });
    });

    return (
        <div className="block-handle-container" data-show="true">
            {/* Plus Button with Menu */}
            <DropdownMenu.Root open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                <DropdownMenu.Trigger asChild>
                    <button
                        type="button"
                        className="block-handle-add"
                        aria-label="Add block"
                    >
                        <Plus size={14} />
                    </button>
                </DropdownMenu.Trigger>

                <DropdownMenu.Portal>
                    <DropdownMenu.Content
                        className="block-menu-panel"
                        sideOffset={8}
                        align="start"
                    >
                        <Tabs.Root defaultValue="text" className="block-menu-tabs">
                            <Tabs.List className="block-menu-tab-list">
                                <Tabs.Trigger value="text" className="block-menu-tab">Text</Tabs.Trigger>
                                <Tabs.Trigger value="list" className="block-menu-tab">List</Tabs.Trigger>
                                <Tabs.Trigger value="advanced" className="block-menu-tab">Advanced</Tabs.Trigger>
                                <Tabs.Trigger value="actions" className="block-menu-tab">Actions</Tabs.Trigger>
                            </Tabs.List>

                            {/* Text Tab */}
                            <Tabs.Content value="text" className="block-menu-content">
                                <div className="block-menu-scroll">
                                    <MenuItem icon={<Pilcrow size={16} />} label="Paragraph" onClick={insertParagraph} />
                                    <div className="block-menu-divider" />
                                    <MenuItem icon={<Heading1 size={16} />} label="Heading 1" onClick={() => insertHeading(1)} />
                                    <MenuItem icon={<Heading2 size={16} />} label="Heading 2" onClick={() => insertHeading(2)} />
                                    <MenuItem icon={<Heading3 size={16} />} label="Heading 3" onClick={() => insertHeading(3)} />
                                    <MenuItem icon={<Heading4 size={16} />} label="Heading 4" onClick={() => insertHeading(4)} />
                                    <MenuItem icon={<Heading5 size={16} />} label="Heading 5" onClick={() => insertHeading(5)} />
                                    <MenuItem icon={<Heading6 size={16} />} label="Heading 6" onClick={() => insertHeading(6)} />
                                    <div className="block-menu-divider" />
                                    <MenuItem icon={<Quote size={16} />} label="Quote" onClick={insertQuote} />
                                    <MenuItem icon={<Minus size={16} />} label="Divider" onClick={insertDivider} />
                                </div>
                            </Tabs.Content>

                            {/* List Tab */}
                            <Tabs.Content value="list" className="block-menu-content">
                                <div className="block-menu-scroll">
                                    <MenuItem icon={<List size={16} />} label="Bullet List" onClick={insertBulletList} />
                                    <MenuItem icon={<ListOrdered size={16} />} label="Ordered List" onClick={insertOrderedList} />
                                    <MenuItem icon={<CheckSquare size={16} />} label="Task List" onClick={() => console.log('Task list')} />
                                </div>
                            </Tabs.Content>

                            {/* Advanced Tab */}
                            <Tabs.Content value="advanced" className="block-menu-content">
                                <div className="block-menu-scroll">
                                    <MenuItem icon={<Image size={16} />} label="Image" onClick={() => console.log('Image')} />
                                    <MenuItem icon={<Code size={16} />} label="Code Block" onClick={insertCodeBlock} />
                                    <MenuItem icon={<ChevronDown size={16} />} label="Collapsible Section" onClick={() => runCommand((ctx) => {
                                        const commands = ctx.get(commandsCtx);
                                        commands.call(insertDetailsCommand.key, 'Click to expand');
                                    })} />
                                    <MenuItem icon={<Table size={16} />} label="Table" onClick={() => console.log('Table')} />
                                    <MenuItem icon={<Calculator size={16} />} label="Math" onClick={() => console.log('Math')} />
                                </div>
                            </Tabs.Content>

                            {/* Actions Tab (existing items) */}
                            <Tabs.Content value="actions" className="block-menu-content">
                                <div className="block-menu-scroll">
                                    <MenuItem icon={<Trash2 size={16} />} label="Delete" onClick={() => console.log('Delete')} />
                                    <MenuItem icon={<Copy size={16} />} label="Duplicate" onClick={() => console.log('Duplicate')} />
                                    <MenuItem icon={<Clipboard size={16} />} label="Copy to Clipboard" onClick={() => console.log('Copy')} />
                                    <div className="block-menu-divider" />
                                    <div className="block-menu-sublabel">Align</div>
                                    <MenuItem icon={<AlignLeft size={16} />} label="Left" onClick={() => console.log('Align left')} />
                                    <MenuItem icon={<AlignCenter size={16} />} label="Center" onClick={() => console.log('Align center')} />
                                    <MenuItem icon={<AlignRight size={16} />} label="Right" onClick={() => console.log('Align right')} />
                                </div>
                            </Tabs.Content>
                        </Tabs.Root>
                    </DropdownMenu.Content>
                </DropdownMenu.Portal>
            </DropdownMenu.Root>

            {/* Drag Handle */}
            <button
                type="button"
                className="block-handle-drag"
                draggable
                aria-label="Drag to move block"
            >
                <GripVertical size={14} />
            </button>
        </div>
    );
}

// Menu Item Component
interface MenuItemProps {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
}

function MenuItem({ icon, label, onClick }: MenuItemProps) {
    return (
        <button className="block-menu-item" onClick={onClick}>
            <span className="block-menu-item-icon">{icon}</span>
            <span className="block-menu-item-label">{label}</span>
        </button>
    );
}
