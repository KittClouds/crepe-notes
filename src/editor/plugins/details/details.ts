// src/editor/plugins/details/details.ts
// Collapsible Details Node - HTML <details>/<summary> structure

import { $node, $command } from '@milkdown/kit/utils';

/**
 * Details Node (Collapsible Section Container)
 */
export const detailsNode = $node('details', () => ({
    content: 'details_summary details_content',
    group: 'block',
    defining: true,

    attrs: {
        open: { default: true },
    },

    parseDOM: [
        {
            tag: 'details',
            getAttrs: (dom: HTMLElement) => ({
                open: dom.hasAttribute('open'),
            }),
        },
    ],

    toDOM: (node) => {
        const { open } = node.attrs;
        return [
            'details',
            {
                open: open ? 'open' : null,
                'data-details': '',
                class: 'milkdown-details',
            },
            0,
        ];
    },

    parseMarkdown: {
        match: () => false,
        runner: () => { },
    },

    toMarkdown: {
        match: (node) => node.type.name === 'details',
        runner: (state, node) => {
            // Serialize as HTML for markdown export
            state.addNode('html', undefined, `<details${node.attrs.open ? ' open' : ''}>`);
            state.next(node.content);
            state.addNode('html', undefined, '</details>');
        },
    },
}));

/**
 * Details Summary (Clickable Header)
 */
export const detailsSummaryNode = $node('details_summary', () => ({
    content: 'inline*',
    defining: true,

    parseDOM: [{ tag: 'summary' }],

    toDOM: () => ['summary', { class: 'milkdown-details-summary' }, 0],

    parseMarkdown: {
        match: () => false,
        runner: () => { },
    },

    toMarkdown: {
        match: (node) => node.type.name === 'details_summary',
        runner: (state, node) => {
            state.addNode('html', undefined, '<summary>');
            state.next(node.content);
            state.addNode('html', undefined, '</summary>');
        },
    },
}));

/**
 * Details Content (Collapsible Body)
 */
export const detailsContentNode = $node('details_content', () => ({
    content: 'block+',
    defining: true,

    parseDOM: [
        { tag: 'div[data-details-content]' },
    ],

    toDOM: () => ['div', { 'data-details-content': '', class: 'milkdown-details-content' }, 0],

    parseMarkdown: {
        match: () => false,
        runner: () => { },
    },

    toMarkdown: {
        match: (node) => node.type.name === 'details_content',
        runner: (state, node) => {
            state.next(node.content);
        },
    },
}));

/**
 * Toggle Details Open/Closed Command
 */
export const toggleDetailsCommand = $command('ToggleDetails', () => {
    return () => (state, dispatch) => {
        const { $from } = state.selection;

        // Find parent details node
        for (let depth = $from.depth; depth > 0; depth--) {
            const node = $from.node(depth);

            if (node.type.name === 'details') {
                const pos = $from.before(depth);
                const newOpen = !node.attrs.open;

                const tr = state.tr.setNodeMarkup(pos, undefined, {
                    ...node.attrs,
                    open: newOpen,
                });

                dispatch?.(tr);
                return true;
            }
        }

        return false;
    };
});

/**
 * Insert Details Block Command
 */
export const insertDetailsCommand = $command('InsertDetails', (ctx) => {
    return (summaryText: string = 'Click to expand') => (state, dispatch) => {
        const { schema, selection } = state;

        const detailsType = schema.nodes.details;
        const summaryType = schema.nodes.details_summary;
        const contentType = schema.nodes.details_content;
        const paragraphType = schema.nodes.paragraph;

        if (!detailsType || !summaryType || !contentType) {
            console.warn('[Details] Node types not found in schema');
            return false;
        }

        const detailsNode = detailsType.create(
            { open: true },
            [
                summaryType.create(null, schema.text(summaryText)),
                contentType.create(null, paragraphType.create()),
            ]
        );

        const tr = state.tr.replaceSelectionWith(detailsNode);
        dispatch?.(tr);
        return true;
    };
});

// Export all as array for easy .use()
export const detailsNodes = [
    detailsNode,
    detailsSummaryNode,
    detailsContentNode,
    toggleDetailsCommand,
    insertDetailsCommand,
];
