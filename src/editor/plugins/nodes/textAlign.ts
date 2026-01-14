import { $nodeAttr, $command } from '@milkdown/kit/utils';
import { paragraphSchema, headingSchema } from '@milkdown/kit/preset/commonmark';

// Helper to inject alignment into DOM output
const injectAlignToDOM = (originalOutput: any, node: any) => {
    const align = node.attrs.textAlign;
    if (!align || align === 'left') return originalOutput;

    const extraAttrs = {
        style: `text-align: ${align}`,
        'data-text-align': align
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

// Helper to inject alignment parsing
const injectAlignToParse = (rules: any[] = []) => {
    return rules.map(rule => ({
        ...rule,
        getAttrs: (dom: HTMLElement) => {
            const base = rule.getAttrs ? rule.getAttrs(dom) : {};
            if (base === false) return false;

            const align = dom.style.textAlign || dom.getAttribute('align') || 'left';
            return {
                ...base,
                textAlign: align
            };
        }
    }));
};

// Plugin to extend paragraph and heading nodes with textAlign attribute
export const textAlignPlugin = (ctx: any) => {
    // Update paragraph
    ctx.update(paragraphSchema.key, (prev: any) => {
        return (ctx: any) => {
            const prevSchema = prev(ctx);
            return {
                ...prevSchema,
                attrs: {
                    ...prevSchema.attrs,
                    textAlign: { default: 'left' },
                },
                parseDOM: injectAlignToParse(prevSchema.parseDOM),
                toDOM: (node: any) => injectAlignToDOM(prevSchema.toDOM(node), node),
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
                    textAlign: { default: 'left' },
                },
                parseDOM: injectAlignToParse(prevSchema.parseDOM),
                toDOM: (node: any) => injectAlignToDOM(prevSchema.toDOM(node), node),
            };
        };
    });
};

// Command to set text alignment
export const setTextAlignCommand = $command(
    'SetTextAlign',
    (ctx) =>
        (align: 'left' | 'center' | 'right' | 'justify' = 'left') =>
            (state, dispatch) => {
                const { selection } = state;
                const { from, to } = selection;

                // Find all blocks in selection
                const tr = state.tr;
                let hasChange = false;

                state.doc.nodesBetween(from, to, (node, pos) => {
                    const nodeType = node.type.name;
                    if (nodeType === 'paragraph' || nodeType === 'heading') {
                        // Only update if value matches changed
                        if (node.attrs.textAlign !== align) {
                            tr.setNodeMarkup(pos, undefined, {
                                ...node.attrs,
                                textAlign: align,
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
