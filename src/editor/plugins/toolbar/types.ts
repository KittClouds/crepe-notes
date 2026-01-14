// src/editor/plugins/toolbar/types.ts
// Type definitions for the custom selection toolbar

import type { Ctx } from '@milkdown/kit/ctx';
import type { ReactNode } from 'react';

export type ToolbarItemType = 'button' | 'dropdown' | 'separator';

export interface ToolbarButton {
    id: string;
    type: 'button';
    label: string;
    icon: ReactNode;
    shortcut?: string;
    isActive: (ctx: Ctx) => boolean;
    onRun: (ctx: Ctx) => void;
}

export interface DropdownItem {
    id: string;
    label: string;
    icon?: ReactNode;
    color?: string; // For color pickers
    onRun: (ctx: Ctx, payload?: string) => void;
}

export interface ToolbarDropdown {
    id: string;
    type: 'dropdown';
    label: string;
    icon: ReactNode;
    items: DropdownItem[];
}

export interface ToolbarSeparator {
    id: string;
    type: 'separator';
}

export type ToolbarItem = ToolbarButton | ToolbarDropdown | ToolbarSeparator;
