// AI Actions for inline text editing
import type { Ctx } from '@milkdown/kit/ctx';
import { editorViewCtx } from '@milkdown/kit/core';
import { TextSelection } from '@milkdown/kit/prose/state';

export type AIEditAction = 'improve' | 'shorten' | 'lengthen' | 'fix' | 'continue' | 'custom';

// Prompts for each action (used when backend is ready)
export const ACTION_PROMPTS: Record<AIEditAction, string> = {
    improve: 'Improve and polish this text while preserving its meaning. Make it clearer and more engaging:',
    shorten: 'Make this text more concise while preserving its key meaning:',
    lengthen: 'Expand and elaborate on this text with more detail:',
    fix: 'Fix any grammar, spelling, and punctuation errors in this text:',
    continue: 'Continue writing from where this text ends, maintaining the same style and tone:',
    custom: '', // Custom prompt provided by user
};

/**
 * Get the currently selected text from the editor
 */
export function getSelectedText(ctx: Ctx): { text: string; from: number; to: number } | null {
    try {
        const view = ctx.get(editorViewCtx);
        const { from, to, empty } = view.state.selection;

        if (empty) return null;

        const text = view.state.doc.textBetween(from, to, ' ');
        return { text, from, to };
    } catch (e) {
        console.error('[AI] Failed to get selection:', e);
        return null;
    }
}

/**
 * Replace the current selection with new text
 * This is the core mechanism for AI text replacement
 */
export function replaceSelection(ctx: Ctx, newText: string): boolean {
    try {
        const view = ctx.get(editorViewCtx);
        const { from, to } = view.state.selection;

        // Create transaction to replace text
        const tr = view.state.tr.insertText(newText, from, to);

        // Set selection to the new text range
        const newTo = from + newText.length;
        tr.setSelection(TextSelection.create(tr.doc, from, newTo));

        // Dispatch the transaction
        view.dispatch(tr);

        return true;
    } catch (e) {
        console.error('[AI] Failed to replace selection:', e);
        return false;
    }
}

/**
 * Insert text at cursor position (for continue action)
 */
export function insertAtCursor(ctx: Ctx, text: string): boolean {
    try {
        const view = ctx.get(editorViewCtx);
        const { to } = view.state.selection;

        const tr = view.state.tr.insertText(text, to);
        view.dispatch(tr);

        return true;
    } catch (e) {
        console.error('[AI] Failed to insert text:', e);
        return false;
    }
}

/**
 * Placeholder AI action handler
 * Will be replaced with Rust/Rig backend call later
 */
export async function runAIAction(
    ctx: Ctx,
    action: AIEditAction,
    customPrompt?: string
): Promise<void> {
    const selection = getSelectedText(ctx);

    if (!selection && action !== 'continue') {
        console.warn('[AI] No text selected');
        return;
    }

    const selectedText = selection?.text || '';
    const prompt = action === 'custom' ? customPrompt || '' : ACTION_PROMPTS[action];

    console.log('[AI] Action:', action);
    console.log('[AI] Selected text:', selectedText);
    console.log('[AI] Prompt:', prompt);

    // TODO: Call Rust/Rig backend here
    // For now, just show a placeholder result
    const placeholderResult = `[AI ${action}: ${selectedText.slice(0, 20)}...]`;

    // Simulate async delay
    await new Promise(resolve => setTimeout(resolve, 500));

    if (action === 'continue') {
        insertAtCursor(ctx, ` ${placeholderResult}`);
    } else {
        replaceSelection(ctx, placeholderResult);
    }
}
