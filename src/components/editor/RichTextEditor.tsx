import React, { useEffect, useRef, useCallback } from 'react';
import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';

// Entity highlighter plugin
import { entityHighlighter } from '../../editor/plugins/entityHighlighter';

// Types
import type { SaveStatus } from '../../api';

export interface RichTextEditorProps {
  noteId: string;
  initialMarkdown: string;
  onMarkdownChange: (markdown: string) => void;
  saveStatus?: SaveStatus;
  readOnly?: boolean;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  noteId,
  initialMarkdown,
  onMarkdownChange,
  saveStatus = 'saved',
  readOnly = false,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const isInitializedRef = useRef(false);

  // Stable callback ref to avoid recreating editor
  const onChangeRef = useRef(onMarkdownChange);
  onChangeRef.current = onMarkdownChange;

  const handleMarkdownUpdate = useCallback((markdown: string) => {
    onChangeRef.current(markdown);
  }, []);

  useEffect(() => {
    if (!editorRef.current || isInitializedRef.current) return;

    const initializeEditor = async () => {
      try {
        const crepe = new Crepe({
          root: editorRef.current!,
          defaultValue: initialMarkdown,
          features: {
            [Crepe.Feature.Toolbar]: true,
            [Crepe.Feature.LinkTooltip]: true,
            [Crepe.Feature.ImageBlock]: true,
            [Crepe.Feature.BlockEdit]: true,
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

        // Set up listener for markdown updates
        crepe.on((listener) => {
          listener.markdownUpdated((ctx, markdown, prevMarkdown) => {
            if (markdown !== prevMarkdown) {
              handleMarkdownUpdate(markdown);
            }
          });
        });

        // Add custom entity highlighter plugin
        crepe.editor.use(entityHighlighter);

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
};

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
