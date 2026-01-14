// src/editor/plugins/toolbar/commands.tsx
// Command definitions and toolbar configuration

import { commandsCtx } from '@milkdown/kit/core';
import {
    toggleStrongCommand,
    toggleEmphasisCommand,
    toggleInlineCodeCommand,
    strongSchema,
    emphasisSchema,
    inlineCodeSchema,
    linkSchema,
} from '@milkdown/kit/preset/commonmark';
import {
    toggleStrikethroughCommand,
    strikethroughSchema,
} from '@milkdown/kit/preset/gfm';
import { toggleLinkCommand } from '@milkdown/kit/component/link-tooltip';

// Custom marks
// Custom marks & nodes
// Custom marks & nodes
import { setTextColorCommand, setFontFamilyCommand, setFontSizeCommand, setUnderlineCommand, underlineSchema } from '../marks';
import { setTextAlignCommand, indentCommand, outdentCommand } from '../nodes';
import { FONT_FAMILIES, FONT_SIZES } from '../../../constants/fonts';

import {
    Bold,
    Italic,
    Underline,
    Strikethrough,
    Code,
    Link2,
    Palette,
    Highlighter,
    AlignLeft,
    AlignCenter,
    AlignRight,
    AlignJustify,
    ChevronDown,
    Type,
    ALargeSmall,
    Sparkles,
    Minimize2,
    Expand,
    Check,
    ArrowRight,
    Wand2,
    Indent,
    Outdent,
} from 'lucide-react';

import type { ToolbarItem } from './types';
import { runAIAction, type AIEditAction } from './aiActions';

// Helper to check if a mark is active on selection
function isMarkActive(ctx: any, schema: any): boolean {
    try {
        const commands = ctx.get(commandsCtx);
        // Use the isMarkSelectedCommand pattern from Crepe
        const { isMarkSelectedCommand } = require('@milkdown/kit/preset/commonmark');
        return commands.call(isMarkSelectedCommand.key, schema.type(ctx));
    } catch {
        return false;
    }
}

// Text colors for the color picker
const TEXT_COLORS = [
    { id: 'default', label: 'Default', color: 'currentColor' },
    { id: 'gray', label: 'Gray', color: '#6b7280' },
    { id: 'red', label: 'Red', color: '#ef4444' },
    { id: 'orange', label: 'Orange', color: '#f97316' },
    { id: 'amber', label: 'Amber', color: '#f59e0b' },
    { id: 'green', label: 'Green', color: '#22c55e' },
    { id: 'blue', label: 'Blue', color: '#3b82f6' },
    { id: 'purple', label: 'Purple', color: '#a855f7' },
    { id: 'pink', label: 'Pink', color: '#ec4899' },
];

// Highlight colors for the highlighter
const HIGHLIGHT_COLORS = [
    { id: 'none', label: 'None', color: 'transparent' },
    { id: 'yellow', label: 'Yellow', color: '#fef08a' },
    { id: 'green', label: 'Green', color: '#bbf7d0' },
    { id: 'blue', label: 'Blue', color: '#bfdbfe' },
    { id: 'purple', label: 'Purple', color: '#e9d5ff' },
    { id: 'pink', label: 'Pink', color: '#fecdd3' },
    { id: 'orange', label: 'Orange', color: '#fed7aa' },
];

export const TOOLBAR_ITEMS: ToolbarItem[] = [
    // === AI Group (FIRST) ===
    {
        id: 'ai',
        type: 'dropdown',
        label: 'AI',
        icon: <Sparkles size={16} className="text-purple-400" />,
        items: [
            {
                id: 'improve',
                label: 'Improve',
                icon: <Sparkles size={14} />,
                onRun: (ctx) => runAIAction(ctx, 'improve'),
            },
            {
                id: 'shorten',
                label: 'Shorten',
                icon: <Minimize2 size={14} />,
                onRun: (ctx) => runAIAction(ctx, 'shorten'),
            },
            {
                id: 'fix',
                label: 'Fix Grammar',
                icon: <Check size={14} />,
                onRun: (ctx) => runAIAction(ctx, 'fix'),
            },
            {
                id: 'lengthen',
                label: 'Extend',
                icon: <Expand size={14} />,
                onRun: (ctx) => runAIAction(ctx, 'lengthen'),
            },
            {
                id: 'continue',
                label: 'Continue',
                icon: <ArrowRight size={14} />,
                onRun: (ctx) => runAIAction(ctx, 'continue'),
            },
        ],
    },
    { id: 'sep-ai', type: 'separator' },
    // === Formatting Group ===
    {
        id: 'bold',
        type: 'button',
        label: 'Bold',
        icon: <Bold size={16} />,
        shortcut: 'Ctrl+B',
        isActive: (ctx) => isMarkActive(ctx, strongSchema),
        onRun: (ctx) => {
            ctx.get(commandsCtx).call(toggleStrongCommand.key);
        },
    },
    {
        id: 'italic',
        type: 'button',
        label: 'Italic',
        icon: <Italic size={16} />,
        shortcut: 'Ctrl+I',
        isActive: (ctx) => isMarkActive(ctx, emphasisSchema),
        onRun: (ctx) => {
            ctx.get(commandsCtx).call(toggleEmphasisCommand.key);
        },
    },
    {
        id: 'underline',
        type: 'dropdown',
        label: 'Underline',
        icon: <Underline size={16} />,
        items: [
            {
                id: 'default',
                label: 'Default',
                color: 'currentColor',
                onRun: (ctx) => ctx.get(commandsCtx).call(setUnderlineCommand.key, null),
            },
            ...TEXT_COLORS.filter(c => c.id !== 'default').map(c => ({
                id: c.id,
                label: c.label,
                color: c.color,
                onRun: (ctx) => ctx.get(commandsCtx).call(setUnderlineCommand.key, c.color),
            })),
        ]
    },
    {
        id: 'strikethrough',
        type: 'button',
        label: 'Strikethrough',
        icon: <Strikethrough size={16} />,
        shortcut: 'Ctrl+Shift+X',
        isActive: (ctx) => isMarkActive(ctx, strikethroughSchema),
        onRun: (ctx) => {
            ctx.get(commandsCtx).call(toggleStrikethroughCommand.key);
        },
    },
    {
        id: 'code',
        type: 'button',
        label: 'Inline Code',
        icon: <Code size={16} />,
        shortcut: 'Ctrl+E',
        isActive: (ctx) => isMarkActive(ctx, inlineCodeSchema),
        onRun: (ctx) => {
            ctx.get(commandsCtx).call(toggleInlineCodeCommand.key);
        },
    },
    {
        id: 'link',
        type: 'button',
        label: 'Link',
        icon: <Link2 size={16} />,
        shortcut: 'Ctrl+K',
        isActive: (ctx) => isMarkActive(ctx, linkSchema),
        onRun: (ctx) => {
            ctx.get(commandsCtx).call(toggleLinkCommand.key);
        },
    },
    { id: 'sep1', type: 'separator' },
    // === Color Group ===
    {
        id: 'text-color',
        type: 'dropdown',
        label: 'Text Color',
        icon: (
            <div className="flex flex-col items-center">
                <span className="text-sm font-bold">A</span>
                <div className="w-4 h-0.5 bg-current -mt-0.5" />
            </div>
        ),
        items: TEXT_COLORS.map((c) => ({
            id: c.id,
            label: c.label,
            color: c.color,
            onRun: (ctx) => {
                const color = c.id === 'default' ? null : c.color;
                ctx.get(commandsCtx).call(setTextColorCommand.key, color);
            },
        })),
    },
    {
        id: 'highlight',
        type: 'dropdown',
        label: 'Highlight',
        icon: <Highlighter size={16} />,
        items: HIGHLIGHT_COLORS.map((c) => ({
            id: c.id,
            label: c.label,
            color: c.color,
            onRun: () => {
                console.warn(`[Toolbar] Highlight "${c.label}" not yet implemented`);
            },
        })),
    },
    { id: 'sep2', type: 'separator' },
    // === Alignment Group ===
    {
        id: 'alignment',
        type: 'dropdown',
        label: 'Alignment',
        icon: <AlignLeft size={16} />,
        items: [
            {
                id: 'left',
                label: 'Left',
                icon: <AlignLeft size={14} />,
                onRun: (ctx) => ctx.get(commandsCtx).call(setTextAlignCommand.key, 'left'),
            },
            {
                id: 'center',
                label: 'Center',
                icon: <AlignCenter size={14} />,
                onRun: (ctx) => ctx.get(commandsCtx).call(setTextAlignCommand.key, 'center'),
            },
            {
                id: 'right',
                label: 'Right',
                icon: <AlignRight size={14} />,
                onRun: (ctx) => ctx.get(commandsCtx).call(setTextAlignCommand.key, 'right'),
            },
            {
                id: 'justify',
                label: 'Justify',
                icon: <AlignJustify size={14} />,
                onRun: (ctx) => ctx.get(commandsCtx).call(setTextAlignCommand.key, 'justify'),
            },
        ],
    },
    // Indent/Outdent buttons
    {
        id: 'indent',
        type: 'button',
        label: 'Indent',
        icon: <Indent size={16} />,
        onRun: (ctx) => ctx.get(commandsCtx).call(indentCommand.key),
        isActive: () => false,
    },
    {
        id: 'outdent',
        type: 'button',
        label: 'Outdent',
        icon: <Outdent size={16} />,
        onRun: (ctx) => ctx.get(commandsCtx).call(outdentCommand.key),
        isActive: () => false,
    },
    { id: 'sep3', type: 'separator' },
    // === Font Group ===
    {
        id: 'font-family',
        type: 'dropdown',
        label: 'Font Family',
        icon: <Type size={16} />,
        items: FONT_FAMILIES.map((f) => ({
            id: f.value,
            label: f.label,
            onRun: (ctx) => {
                const family = f.value === 'default' ? null : f.family;
                ctx.get(commandsCtx).call(setFontFamilyCommand.key, family);
            },
        })),
    },
    {
        id: 'font-size',
        type: 'dropdown',
        label: 'Font Size',
        icon: <ALargeSmall size={16} />,
        items: FONT_SIZES.map((s) => ({
            id: s.value,
            label: s.label,
            onRun: (ctx) => {
                const size = s.value === 'default' ? null : s.size;
                ctx.get(commandsCtx).call(setFontSizeCommand.key, size);
            },
        })),
    },
];

export { ChevronDown };
