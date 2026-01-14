// Block handle plugin for Crepe
// Uses @milkdown/kit/plugin/block with custom React view

import { block, blockConfig, BlockProvider, type BlockProviderOptions } from '@milkdown/kit/plugin/block';
import type { Ctx } from '@milkdown/kit/ctx';
import type { PluginView } from '@milkdown/kit/prose/state';
import { editorViewCtx } from '@milkdown/kit/core';
import { paragraphSchema } from '@milkdown/kit/preset/commonmark';
import { findParent } from '@milkdown/kit/prose';
import { TextSelection } from '@milkdown/kit/prose/state';
import ReactDOM from 'react-dom/client';
import { BlockHandleUI } from './BlockHandleUI';

import './blockHandle.css';

class BlockHandleView implements PluginView {
    private content: HTMLElement;
    private provider: BlockProvider;
    private root: ReactDOM.Root;
    private ctx: Ctx;

    constructor(ctx: Ctx) {
        this.ctx = ctx;

        // Create container element
        this.content = document.createElement('div');
        this.content.classList.add('milkdown-block-handle');

        // Create React root and render UI
        this.root = ReactDOM.createRoot(this.content);
        this.root.render(
            <BlockHandleUI
                ctx={ctx}
                onAdd={() => this.onAdd()}
            />
        );

        // Create BlockProvider with positioning options
        this.provider = new BlockProvider({
            ctx,
            content: this.content,
            getOffset: () => 24,
            getPlacement: () => 'left', // Vertically centered with block
        } as Partial<BlockProviderOptions>);

        // Initial update
        this.update();
    }

    update = () => {
        this.provider.update();
    };

    destroy = () => {
        this.provider.destroy();
        this.content.remove();
        this.root.unmount();
    };

    onAdd = () => {
        const ctx = this.ctx;
        const view = ctx.get(editorViewCtx);
        if (!view.hasFocus()) view.focus();

        const { state, dispatch } = view;
        const active = this.provider.active;
        if (!active) return;

        const $pos = active.$pos;
        const pos = $pos.pos + active.node.nodeSize;
        let tr = state.tr.insert(pos, paragraphSchema.type(ctx).create());
        tr = tr.setSelection(TextSelection.near(tr.doc.resolve(pos)));
        dispatch(tr.scrollIntoView());

        this.provider.hide();
    };
}

// Configure block handle (called in editor config)
export function configureBlockHandle(ctx: Ctx) {
    ctx.set(blockConfig.key, {
        filterNodes: (pos) => {
            const filter = findParent((node) =>
                ['table', 'blockquote', 'math_inline'].includes(node.type.name)
            )(pos);
            if (filter) return false;
            return true;
        },
    });

    ctx.set(block.key, {
        view: () => new BlockHandleView(ctx),
    });
}

// Factory function for use in config
export function createBlockHandleView(ctx: Ctx) {
    return () => new BlockHandleView(ctx);
}

// Re-export the block plugin
export { block as blockPlugin };
