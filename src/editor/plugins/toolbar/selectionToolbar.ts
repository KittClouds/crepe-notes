// src/editor/plugins/toolbar/selectionToolbar.ts
// Custom selection toolbar plugin for Milkdown Crepe

import type { Ctx } from '@milkdown/kit/ctx';
import type { EditorView } from '@milkdown/kit/prose/view';
import { tooltipFactory } from '@milkdown/kit/plugin/tooltip';
import { SelectionToolbarPluginView } from './ToolbarView';

// Create the tooltip plugin with a unique ID
export const selectionTooltip = tooltipFactory('CUSTOM_SELECTION_TOOLBAR');

// Factory function to create the plugin view
export function createSelectionToolbarView(ctx: Ctx) {
    return (view: EditorView) => new SelectionToolbarPluginView(ctx, view);
}
