// src/editor/plugins/details/indentGuides.ts
// Visual indent guide lines for nested content

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import type { EditorState } from '@milkdown/kit/prose/state';

export const indentGuidesPlugin = $prose(() => {
    return new Plugin({
        key: new PluginKey('indentGuides'),

        state: {
            init: (_, state: EditorState) => {
                return createIndentGuides(state);
            },

            apply: (tr, decorations, oldState, newState) => {
                if (!tr.docChanged) return decorations;
                return createIndentGuides(newState);
            },
        },

        props: {
            decorations(state) {
                return this.getState(state);
            },
        },
    });
});

/**
 * Create indent guide decorations for indented blocks
 */
function createIndentGuides(state: EditorState): DecorationSet {
    const decorations: Decoration[] = [];
    const { doc } = state;

    doc.descendants((node, pos) => {
        // Only show guides for indented blocks
        if (!node.isBlock) return;

        const indent = node.attrs?.indent;
        if (typeof indent !== 'number' || indent === 0) return;

        // Create guide line widget for each indent level
        for (let level = 1; level <= indent; level++) {
            const decoration = Decoration.widget(
                pos,
                () => {
                    const guide = document.createElement('div');
                    guide.className = 'indent-guide';
                    guide.style.left = `${(level - 1) * 24}px`; // 24px per indent level
                    return guide;
                },
                {
                    side: -1,
                    key: `indent-guide-${pos}-${level}`,
                }
            );

            decorations.push(decoration);
        }
    });

    return DecorationSet.create(doc, decorations);
}
