import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { AppSidebar } from '@/components/sidebar/AppSidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { RichTextEditor } from '@/components/editor/RichTextEditor';
import { NoteTabs } from '@/components/tabs/NoteTabs';
import { DarkModeToggle } from '@/components/theme/DarkModeToggle';
import { HubPanel } from '@/components/hub';
import { RightSidebarProvider, RightSidebar, RightSidebarTrigger } from '@/components/RightSidebar';
import { EntitySelectionProvider } from '@/contexts/EntitySelectionContext';
import type { EntityStats } from '@/components/hub';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNotesStore } from '@/hooks/useNotesStore';
import { setCurrentNoteId } from '@/lib/storage';
import { getNavigationApi } from '@/api';
import { scanForPatternsSync, scanForPatterns } from '@/lib/Scanner/pattern-scanner';
import { smartGraphRegistry } from '@/lib/registry';
import type { EntityKind } from '@/lib/types/entityTypes';

const Index: React.FC = () => {
  const {
    state,
    updateNote,
    deleteNote,
    selectNote,
    createNote,
  } = useNotesStore();

  // Footer link state
  const [entityStats, setEntityStats] = useState<EntityStats[]>([]);
  const [wordCount, setWordCount] = useState(0);
  const [characterCount, setCharacterCount] = useState(0);

  // Current note derived from store
  const currentNote = useMemo(() => {
    if (!state.selectedNoteId) return null;
    return state.notes.find(n => n.id === state.selectedNoteId) || null;
  }, [state.selectedNoteId, state.notes]);

  // Scan current note for outgoing links and entities
  useEffect(() => {
    if (!currentNote) {
      setEntityStats([]);
      setWordCount(0);
      setCharacterCount(0);
      return;
    }

    const content = currentNote.markdownContent || currentNote.content || '';
    const spans = scanForPatternsSync(content);

    // (Outgoing links removed - using Entities panel only)

    // Extract entity stats
    const entityMap = new Map<string, EntityStats>();
    for (const span of spans) {
      if (span.kind) {
        const key = `${span.kind}:${span.label}`;
        const existing = entityMap.get(key);
        if (existing) {
          existing.mentionsInThisNote++;
        } else {
          entityMap.set(key, {
            entityKind: span.kind,
            entityLabel: span.label,
            mentionsInThisNote: 1,
            mentionsAcrossVault: 1, // TODO: Calculate across vault
            appearanceCount: 1,
          });
        }
      }
    }
    setEntityStats(Array.from(entityMap.values()));

    // Word and character count (strip syntax patterns)
    const text = content.replace(/\[[A-Z_]+\|[^\]]+\]|\[\[[^\]]+\]\]|<<[^>]+>>/g, '');
    setWordCount(text.split(/\s+/).filter(w => w.length > 0).length);
    setCharacterCount(text.length);

    // Auto-register entities to registry (async, fire-and-forget)
    if (currentNote.id) {
      scanForPatterns(content, currentNote.id).catch(console.error);
    }
  }, [currentNote]);

  // (Backlinks removed - using Entities panel only)

  // Wire up NavigationApi handler ONCE
  useEffect(() => {
    const navigationApi = getNavigationApi();

    const unsubscribe = navigationApi.onNavigate((noteId) => {
      console.log('[Index] Navigation handler called with:', noteId);
      selectNote(noteId);
      setCurrentNoteId(noteId);
      toast.success('Navigated to note');
    });

    return unsubscribe;
  }, [selectNote]);

  // Keep navigation API in sync with current notes (separate effect)
  useEffect(() => {
    const navigationApi = getNavigationApi();
    navigationApi.setNotes(state.notes);
  }, [state.notes]);

  // Auto-select first note if none selected
  useEffect(() => {
    if (!state.selectedNoteId && state.notes.length > 0) {
      selectNote(state.notes[0].id);
    }
  }, [state.selectedNoteId, state.notes, selectNote]);

  const handleTitleChange = (title: string) => {
    if (!currentNote) return;
    updateNote(currentNote.id, { title });
  };

  const handleMarkdownChange = (markdown: string) => {
    if (!currentNote) return;
    updateNote(currentNote.id, { markdownContent: markdown });
  };

  const handleDeleteNote = () => {
    if (!currentNote) return;
    deleteNote(currentNote.id);
    toast.success('Note deleted');
  };

  const handleNavigate = useCallback((title: string) => {
    const note = state.notes.find(n =>
      n.title.toLowerCase() === title.toLowerCase() ||
      (n.isEntity && n.entityLabel?.toLowerCase() === title.toLowerCase())
    );
    if (note) {
      selectNote(note.id);
      toast.success(`Navigated to ${title}`);
    }
  }, [state.notes, selectNote]);

  const handleCreateEntityNote = useCallback((label: string, entityKind: string) => {
    // Create entity note with proper title format
    const formattedTitle = `[${entityKind}|${label}]`;
    createNote({
      title: formattedTitle,
      markdownContent: `# ${label}\n\nEntity Type: ${entityKind}\n`,
      folderId: null,
      tags: [],
      entityKind: entityKind as EntityKind,
      isEntity: 1,
      entityLabel: label,
    });
    toast.success(`Created entity note: ${label}`);
  }, [createNote]);

  return (
    <SidebarProvider className="h-screen overflow-hidden">
      <RightSidebarProvider defaultOpen={false}>
        <EntitySelectionProvider>
          <AppSidebar />
          <SidebarInset className="flex flex-col min-h-0 h-full overflow-hidden">
            {/* Pinned Header */}
            <header className="sticky top-0 z-20 flex items-center gap-2 px-2 py-1 border-b border-border bg-card shrink-0 min-h-[44px]">
              <SidebarTrigger className="shrink-0" />

              {/* Note Tabs */}
              <NoteTabs className="flex-1 min-w-0" />

              {/* Editable title - inline in header */}
              {currentNote && (
                <Input
                  value={currentNote.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Untitled"
                  className="text-sm font-medium border-0 bg-transparent px-2 h-8 py-0 focus-visible:ring-1 focus-visible:ring-ring max-w-[200px] shrink-0"
                />
              )}

              {/* 3-dots menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem>Duplicate</DropdownMenuItem>
                  <DropdownMenuItem>Move to folder</DropdownMenuItem>
                  <DropdownMenuItem>Export as Markdown</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleDeleteNote}
                    className="text-destructive focus:text-destructive"
                  >
                    Delete note
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Right Sidebar Toggle */}
              <RightSidebarTrigger />

              {/* Dark Mode Toggle */}
              <DarkModeToggle />
            </header>

            {/* Scrollable Note content area */}
            {currentNote ? (
              <div className="flex-1 min-h-0 overflow-auto">
                <RichTextEditor
                  key={currentNote.id}
                  noteId={currentNote.id}
                  initialMarkdown={currentNote.markdownContent || ''}
                  onMarkdownChange={handleMarkdownChange}
                />
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <h2 className="text-xl font-semibold text-muted-foreground">No note selected</h2>
                  <p className="text-sm text-muted-foreground mt-1">Select a note or create a new one</p>
                </div>
              </div>
            )}

            {/* Hub Panel */}
            <HubPanel
              entityStats={entityStats}
              notes={state.notes}
              onNavigate={handleNavigate}
              onCreate={handleCreateEntityNote}
              notesCount={state.notes.length}
              wordCount={wordCount}
              characterCount={characterCount}
            />
          </SidebarInset>

          {/* Right Sidebar */}
          <RightSidebar />

          <Toaster position="bottom-right" />
        </EntitySelectionProvider>
      </RightSidebarProvider>
    </SidebarProvider>
  );
};

export default Index;
