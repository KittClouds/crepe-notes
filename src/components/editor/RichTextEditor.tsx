import React, { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Crepe } from '@milkdown/crepe';
import { defaultValueCtx, commandsCtx } from '@milkdown/kit/core';
import { undoCommand, redoCommand } from '@milkdown/kit/plugin/history';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';

// Font loader
import { loadEditorFonts } from '../../utils/fontLoader';

// Entity highlighter plugin
import { entityHighlighter } from '../../editor/plugins/entityHighlighter';

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

        const crepe = new Crepe({
          root: editorRef.current!,
          defaultValue,
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

        await crepe.create();

        if (readOnly) {
          crepe.setReadonly(true);
        }

        crepeRef.current = crepe;
        isInitializedRef.current = true;
      } catch (error) {
        console.error('Failed to initialize Milkdown Crepe editor:', error);
      }
    };

    initializeEditor();

    return () => {
      if (crepeRef.current) {
        crepeRef.current.destroy();
        crepeRef.current = null;
        isInitializedRef.current = false;
      }
    };
  }, [noteId]);

  // Handle readonly changes
  useEffect(() => {
    if (crepeRef.current) {
      crepeRef.current.setReadonly(readOnly);
    }
  }, [readOnly]);

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="flex items-center justify-end px-4 py-2 border-b border-border bg-card">
        <StatusBadge status={saveStatus} />
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-auto scrollbar-thin">
        <div
          ref={editorRef}
          className="milkdown-editor-wrapper min-h-full"
        />
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
