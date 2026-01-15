// src/editor/plugins/details/detailsInteractive.ts
// Interactive click handler for details/summary toggle

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';

export const detailsInteractivePlugin = $prose(() => {
    return new Plugin({
        key: new PluginKey('detailsInteractive'),

        props: {
            handleDOMEvents: {
                click: (view, event) => {
                    const target = event.target as HTMLElement;
                    const summary = target.closest('summary');

                    if (!summary) return false;

                    // Find the details node in ProseMirror
                    const pos = view.posAtDOM(summary, 0);
                    if (pos === null || pos === undefined) return false;

                    const $pos = view.state.doc.resolve(pos);

                    // Find parent details node
                    for (let depth = $pos.depth; depth > 0; depth--) {
                        const node = $pos.node(depth);

                        if (node.type.name === 'details') {
                            const nodePos = $pos.before(depth);
                            const newOpen = !node.attrs.open;

                            const tr = view.state.tr.setNodeMarkup(nodePos, undefined, {
                                ...node.attrs,
                                open: newOpen,
                            });

                            view.dispatch(tr);

                            // Prevent default details behavior (browser toggle)
                            event.preventDefault();
                            event.stopPropagation();
                            return true;
                        }
                    }

                    return false;
                },
            },
        },
    });
});
