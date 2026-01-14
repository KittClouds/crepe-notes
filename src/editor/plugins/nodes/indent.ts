import { $nodeAttr, $command } from '@milkdown/kit/utils';
import { paragraphSchema, headingSchema } from '@milkdown/kit/preset/commonmark';

// Indent levels in pixels
const INDENT_STEP = 24; // 24px per indent level
const MAX_INDENT_LEVEL = 8;

// Helper to inject indent into DOM output
const injectIndentToDOM = (originalOutput: any, node: any) => {
    const indent = node.attrs.indent || 0;
    if (indent <= 0) return originalOutput;

    const marginLeft = indent * INDENT_STEP;
    const extraAttrs = {
        style: `margin-left: ${marginLeft}px`,
        'data-indent': String(indent)
    };

    if (Array.isArray(originalOutput)) {
        const [tag, ...rest] = originalOutput;
        // Check if second element is attrs object (not a child node or 0)
        if (rest.length > 0 && typeof rest[0] === 'object' && !Array.isArray(rest[0]) && rest[0] !== 0) {
            // Merge with existing attrs
            const existing = rest[0];
            const merged = {
                ...existing,
                ...extraAttrs,
                style: [existing.style, extraAttrs.style].filter(Boolean).join(';')
            };
            return [tag, merged, ...rest.slice(1)];
        } else {
            // Insert new attrs
            return [tag, extraAttrs, ...rest];
        }
    }
    return originalOutput;
};

// Helper to inject indent parsing
const injectIndentToParse = (rules: any[] = []) => {
    return rules.map(rule => ({
        ...rule,
        getAttrs: (dom: HTMLElement) => {
            const base = rule.getAttrs ? rule.getAttrs(dom) : {};
            if (base === false) return false;

            // Parse indent from data attribute or margin-left style
            let indent = parseInt(dom.getAttribute('data-indent') || '0', 10);
            if (!indent && dom.style.marginLeft) {
                const px = parseInt(dom.style.marginLeft, 10);
                if (px > 0) {
                    indent = Math.round(px / INDENT_STEP);
                }
            }
            return {
                ...base,
                indent: Math.min(indent, MAX_INDENT_LEVEL)
            };
        }
    }));
};

// Plugin to extend paragraph and heading nodes with indent attribute
export const indentPlugin = (ctx: any) => {
    // Update paragraph
    ctx.update(paragraphSchema.key, (prev: any) => {
        return (ctx: any) => {
            const prevSchema = prev(ctx);
            return {
                ...prevSchema,
                attrs: {
                    ...prevSchema.attrs,
                    indent: { default: 0 },
                },
                parseDOM: injectIndentToParse(prevSchema.parseDOM),
                toDOM: (node: any) => injectIndentToDOM(prevSchema.toDOM(node), node),
            };
        };
    });

    // Update heading
    ctx.update(headingSchema.key, (prev: any) => {
        return (ctx: any) => {
            const prevSchema = prev(ctx);
            return {
                ...prevSchema,
                attrs: {
                    ...prevSchema.attrs,
                    indent: { default: 0 },
                },
                parseDOM: injectIndentToParse(prevSchema.parseDOM),
                toDOM: (node: any) => injectIndentToDOM(prevSchema.toDOM(node), node),
            };
        };
    });
};

// Command to increase indent
export const indentCommand = $command(
    'Indent',
    (ctx) =>
        () =>
            (state, dispatch) => {
                const { selection } = state;
                const { from, to } = selection;

                const tr = state.tr;
                let hasChange = false;

                state.doc.nodesBetween(from, to, (node, pos) => {
                    const nodeType = node.type.name;
                    if (nodeType === 'paragraph' || nodeType === 'heading') {
                        const currentIndent = node.attrs.indent || 0;
                        if (currentIndent < MAX_INDENT_LEVEL) {
                            tr.setNodeMarkup(pos, undefined, {
                                ...node.attrs,
                                indent: currentIndent + 1,
                            });
                            hasChange = true;
                        }
                    }
                });

                if (hasChange && dispatch) {
                    dispatch(tr);
                    return true;
                }
                return false;
            }
);

// Command to decrease indent (outdent)
export const outdentCommand = $command(
    'Outdent',
    (ctx) =>
        () =>
            (state, dispatch) => {
                const { selection } = state;
                const { from, to } = selection;

                const tr = state.tr;
                let hasChange = false;

                state.doc.nodesBetween(from, to, (node, pos) => {
                    const nodeType = node.type.name;
                    if (nodeType === 'paragraph' || nodeType === 'heading') {
                        const currentIndent = node.attrs.indent || 0;
                        if (currentIndent > 0) {
                            tr.setNodeMarkup(pos, undefined, {
                                ...node.attrs,
                                indent: currentIndent - 1,
                            });
                            hasChange = true;
                        }
                    }
                });

                if (hasChange && dispatch) {
                    dispatch(tr);
                    return true;
                }
                return false;
            }
);
