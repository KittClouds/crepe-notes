import React, { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Crepe } from '@milkdown/crepe';
import { defaultValueCtx, commandsCtx, editorViewCtx } from '@milkdown/kit/core';
import { replaceAll } from '@milkdown/kit/utils';
import { undoCommand, redoCommand } from '@milkdown/kit/plugin/history';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';

// Font loader
import { loadEditorFonts } from '../../utils/fontLoader';

// Entity highlighter plugin
import { entityHighlighter } from '../../editor/plugins/entityHighlighter';

// Highlighter API for scan coordinator integration
import { getHighlighterApi } from '../../api';

// KittCore for full document scan
import { kittCore } from '../../lib/kittcore';

// Performance instrumentation
import { markNoteSwitchEnd } from '../../lib/utils/notePerf';

// Narrative Registry for scope resolution
import { narrativeRegistry } from '../../lib/narrative';

// Custom selection toolbar plugin
import { selectionTooltip, createSelectionToolbarView } from '../../editor/plugins/toolbar';

// Custom marks (text color, highlight, etc.)
// Custom marks & nodes
// Custom marks & nodes
import {
  textColorAttr,
  textColorSchema,
  setTextColorCommand,
  fontFamilyMark,
  setFontFamilyCommand,
  fontSizeMark,
  setFontSizeCommand,
  underlineAttr,
  underlineSchema,
  setUnderlineCommand
} from '../../editor/plugins/marks';
import { textAlignPlugin, setTextAlignCommand, indentPlugin, indentCommand, outdentCommand } from '../../editor/plugins/nodes';

// Block handle plugin
import { block } from '@milkdown/kit/plugin/block';
import { configureBlockHandle } from '../../editor/plugins/blockHandle/index';

// Details/Collapsible sections plugin
import {
  detailsNodes,
  detailsInteractivePlugin,
  indentGuidesPlugin
} from '../../editor/plugins/details';

// Types
import type { SaveStatus } from '../../api';

// Content can be JSON doc or markdown string
export type EditorContent =
  | { type: 'json'; value: object }
  | { type: 'markdown'; value: string };

export interface RichTextEditorProps {
  noteId: string;
  /** Initial content - JSON preferred, markdown as fallback */
  initialContent: EditorContent;
  /** Markdown content for content swap (needed when initial is JSON) */
  markdownContent?: string;
  /** Called when content changes - provides both JSON and markdown */
  onContentChange: (content: { json: object; markdown: string }) => void;
  saveStatus?: SaveStatus;
  readOnly?: boolean;
}

// Exposed methods via ref
export interface RichTextEditorRef {
  undo: () => void;
  redo: () => void;
}

export const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(({
  noteId,
  initialContent,
  markdownContent: markdownContentProp,
  onContentChange,
  saveStatus = 'saved',
  readOnly = false,
}, ref) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const isInitializedRef = useRef(false);

  // Stable callback ref to avoid recreating editor
  const onChangeRef = useRef(onContentChange);
  onChangeRef.current = onContentChange;

  // Track previous noteId to detect switches
  const prevNoteIdRef = useRef<string | null>(null);

  const handleContentUpdate = useCallback((json: object, markdown: string) => {
    onChangeRef.current({ json, markdown });
  }, []);

  // Expose undo/redo methods via ref
  useImperativeHandle(ref, () => ({
    undo: () => {
      if (crepeRef.current) {
        try {
          crepeRef.current.editor.ctx.get(commandsCtx).call(undoCommand.key);
        } catch (e) {
          console.error('[Editor] Undo failed:', e);
        }
      }
    },
    redo: () => {
      if (crepeRef.current) {
        try {
          crepeRef.current.editor.ctx.get(commandsCtx).call(redoCommand.key);
        } catch (e) {
          console.error('[Editor] Redo failed:', e);
        }
      }
    },
  }), []);

  useEffect(() => {
    if (!editorRef.current || isInitializedRef.current) return;

    const initializeEditor = async () => {
      try {
        // Determine default value based on content type
        const defaultValue = initialContent.type === 'json'
          ? { type: 'json' as const, value: initialContent.value as any }
          : initialContent.value; // Markdown string



        const sanitizeJSON = (node: any): any => {
          if (!node) return node;
          if (Array.isArray(node)) return node.map(sanitizeJSON);
          if (typeof node === 'object') {
            const newNode = { ...node };
            // Fix specific known attribute issues - spread should be boolean
            if (newNode.attrs && typeof newNode.attrs.spread === 'string') {
              newNode.attrs = { ...newNode.attrs };
              newNode.attrs.spread = newNode.attrs.spread === 'true';
            }
            // Recursively sanitize children
            if (newNode.content) {
              newNode.content = newNode.content.map(sanitizeJSON);
            }
            return newNode;
          }
          return node;
        };

        performance.mark('editor_new_start');
        const crepe = new Crepe({
          root: editorRef.current!,
          defaultValue: initialContent.type === 'json'
            ? { type: 'json' as const, value: sanitizeJSON(initialContent.value) }
            : initialContent.value,
          features: {
            [Crepe.Feature.Toolbar]: false, // Disabled - using custom selection toolbar
            [Crepe.Feature.LinkTooltip]: true,
            [Crepe.Feature.ImageBlock]: true,
            [Crepe.Feature.BlockEdit]: false, // Using custom block handle
            [Crepe.Feature.Placeholder]: true,
            [Crepe.Feature.CodeMirror]: true,
            [Crepe.Feature.ListItem]: true,
            [Crepe.Feature.Table]: true,
          },
          featureConfigs: {
            [Crepe.Feature.Placeholder]: {
              text: 'Start writing your note...',
              mode: 'block',
            },
          },
        });

        // Set up listener for document updates - emit both JSON and markdown
        crepe.on((listener) => {
          listener.updated((ctx, doc, prevDoc) => {
            // Only emit if content actually changed
            if (!doc.eq(prevDoc)) {
              const json = doc.toJSON();
              const markdown = crepe.getMarkdown();
              handleContentUpdate(json, markdown);
            }
          });
        });

        // Add custom selection toolbar plugin
        crepe.editor
          .config((ctx) => {
            ctx.set(selectionTooltip.key, {
              view: createSelectionToolbarView(ctx),
            });
          })
          .use(selectionTooltip);

        // Add custom marks (text color, etc.)
        crepe.editor
          .use(textColorAttr)
          .use(textColorSchema)
          .use(setTextColorCommand)
          .config(textAlignPlugin)
          .use(setTextAlignCommand)
          .config(indentPlugin)
          .use(indentCommand)
          .use(outdentCommand)
          .use(fontFamilyMark)
          .use(setFontFamilyCommand)
          .use(fontSizeMark)
          .use(setFontSizeCommand)
          .use(underlineAttr)
          .use(underlineSchema)
          .use(setUnderlineCommand);

        // Load fonts
        loadEditorFonts();

        // Add custom entity highlighter plugin
        crepe.editor.use(entityHighlighter);

        // Add custom block handle plugin
        crepe.editor
          .config((ctx) => {
            configureBlockHandle(ctx);
          })
          .use(block);

        // Add collapsible details nodes and plugins
        detailsNodes.forEach((node) => crepe.editor.use(node));
        crepe.editor.use(detailsInteractivePlugin);
        crepe.editor.use(indentGuidesPlugin);

        performance.mark('editor_new_end');

        performance.mark('editor_create_start');
        await crepe.create();
        performance.mark('editor_create_end');

        // Log timings
        const tNew = performance.measure('editor_new', 'editor_new_start', 'editor_new_end').duration;
        const tCreate = performance.measure('editor_create', 'editor_create_start', 'editor_create_end').duration;
        console.log(`[NotePerf] 🔍 Editor Init: new=${tNew.toFixed(1)}ms, create=${tCreate.toFixed(1)}ms`);

        if (readOnly) {
          crepe.setReadonly(true);
        }

        crepeRef.current = crepe;
        isInitializedRef.current = true;
        markNoteSwitchEnd(noteId);
      } catch (error) {
        console.error('Failed to initialize Milkdown Crepe editor:', error);
      }
    };

    initializeEditor();

    return () => {
      if (crepeRef.current) {
        performance.mark('editor_destroy_start');
        crepeRef.current.destroy();
        performance.mark('editor_destroy_end');
        const tDestroy = performance.measure('editor_destroy', 'editor_destroy_start', 'editor_destroy_end').duration;
        console.log(`[NotePerf] 💥 Editor Destroy: ${tDestroy.toFixed(1)}ms`);
        crepeRef.current = null;
        isInitializedRef.current = false;
      }
    };
  }, []); // Only run once on mount - no noteId dependency

  // Content swap when noteId changes (without remounting)
  useEffect(() => {
    if (!crepeRef.current || !isInitializedRef.current) return;
    if (prevNoteIdRef.current === noteId) return;

    performance.mark('content_swap_start');
    prevNoteIdRef.current = noteId;

    // Sanitize JSON to fix attribute type issues
    const sanitizeJSON = (node: any): any => {
      if (!node) return node;
      if (Array.isArray(node)) return node.map(sanitizeJSON);
      if (typeof node === 'object') {
        const newNode = { ...node };
        if (newNode.attrs && typeof newNode.attrs.spread === 'string') {
          newNode.attrs = { ...newNode.attrs };
          newNode.attrs.spread = newNode.attrs.spread === 'true';
        }
        if (newNode.content) {
          newNode.content = newNode.content.map(sanitizeJSON);
        }
        return newNode;
      }
      return node;
    };

    try {
      // Access the editor's ProseMirror view through Milkdown
      crepeRef.current.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const schema = view.state.schema;

        if (initialContent.type === 'json') {
          // Parse JSON doc using ProseMirror's nodeFromJSON - preserves colors/marks
          const sanitizedDoc = sanitizeJSON(initialContent.value);
          const newDoc = schema.nodeFromJSON(sanitizedDoc);

          // Create transaction to replace entire document
          const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, newDoc.content);
          view.dispatch(tr);
        } else {
          // WARNING: Markdown path loses formatting (colors, etc.)
          // This should only be used as absolute fallback
          console.warn('[Editor] Using markdown fallback - formatting may be lost!');

          // replaceAll is a macro - use it directly as action
          // We need to call it outside the action callback
        }
      });

      // Handle markdown outside the action callback (replaceAll is its own action)
      if (initialContent.type !== 'json') {
        crepeRef.current.editor.action(replaceAll(initialContent.value));
      }
    } catch (e) {
      console.error('[NotePerf] Content swap error:', e);
    }

    performance.mark('content_swap_end');
    const tSwap = performance.measure('content_swap', 'content_swap_start', 'content_swap_end').duration;
    console.log(`[NotePerf] ⚡ Content Swap: ${tSwap.toFixed(1)}ms`);
    markNoteSwitchEnd(noteId);
  }, [noteId, initialContent]);

  // Wire highlighterApi.setNoteId when noteId changes
  useEffect(() => {
    if (noteId) {
      const api = getHighlighterApi();
      // Resolve narrative scope (if any)
      const narrativeRoot = narrativeRegistry.getNarrativeRoot(noteId);
      api.setNoteId(noteId, narrativeRoot?.id);
    }
  }, [noteId]);

  // WASM scanning moved to event-driven (save/content change) - not on note switch
  // This prevents UI blocking on note open. Scans now trigger via:
  // - ScanCoordinator (on entity events)
  // - Save events (via onContentChange debounce)
  // KittCore stays hydrated and ready, but passive.

  // Keystroke handler for scan coordinator
  useEffect(() => {
    const container = editorRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only track printable characters
      if (e.key.length === 1) {
        const api = getHighlighterApi();

        // Get cursor position and context from editor
        if (crepeRef.current) {
          try {
            const markdown = crepeRef.current.getMarkdown();
            // Use selection start as approximate cursor position
            const selection = window.getSelection();
            const cursorPos = selection?.anchorOffset ?? 0;
            api.onKeystroke(e.key, cursorPos, markdown);
          } catch {
            // Editor may not be ready, ignore
          }
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle readonly changes
  useEffect(() => {
    if (crepeRef.current) {
      crepeRef.current.setReadonly(readOnly);
    }
  }, [readOnly]);

  return (
    <div className="flex flex-col h-full relative group">
      {/* Editor */}
      <div className="flex-1 overflow-auto scrollbar-thin">
        <div
          ref={editorRef}
          className="milkdown-editor-wrapper min-h-full"
        />
      </div>

      {/* Floating Status Indicator */}
      <div className="absolute bottom-4 right-6 pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity duration-200">
        <StatusBadge status={saveStatus} />
      </div>
    </div>
  );
});

interface StatusBadgeProps {
  status: SaveStatus;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const statusConfig = {
    saved: {
      className: 'badge-synced',
      icon: (
        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
          <path fillRule="evenodd" d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
        </svg>
      ),
      text: 'Saved',
    },
    saving: {
      className: 'badge-saving',
      icon: (
        <svg className="w-3 h-3 animate-spin-slow" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 14A6 6 0 118 2a6 6 0 010 12z" opacity="0.25" />
          <path d="M8 2a6 6 0 016 6h2A8 8 0 008 0v2z" />
        </svg>
      ),
      text: 'Saving...',
    },
    unsaved: {
      className: 'badge-offline',
      icon: (
        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="8" r="4" />
        </svg>
      ),
      text: 'Unsaved',
    },
    error: {
      className: 'badge-error',
      icon: (
        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 3.75a.75.75 0 011.5 0v4a.75.75 0 01-1.5 0v-4zm.75 7.25a1 1 0 110-2 1 1 0 010 2z" />
        </svg>
      ),
      text: 'Error',
    },
  };

  const config = statusConfig[status];

  return (
    <span className={config.className}>
      {config.icon}
      <span>{config.text}</span>
    </span>
  );
};

export default RichTextEditor;
