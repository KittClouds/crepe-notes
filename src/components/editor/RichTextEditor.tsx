import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';

export interface RichTextEditorProps {
  noteId: string;
  initialMarkdown: string;
  onMarkdownChange: (markdown: string) => void;
  readOnly?: boolean;
}

type SaveStatus = 'saved' | 'saving' | 'unsaved';

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  noteId,
  initialMarkdown,
  onMarkdownChange,
  readOnly = false,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);

  const handleMarkdownUpdate = useCallback((markdown: string) => {
    setSaveStatus('saving');
    onMarkdownChange(markdown);
    
    // Simulate autosave completion
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setSaveStatus('saved');
    }, 800);
  }, [onMarkdownChange]);

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
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
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
