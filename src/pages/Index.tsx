import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { MoreHorizontal, Undo2, Redo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { AppSidebar } from '@/components/sidebar/AppSidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { RichTextEditor, type RichTextEditorRef } from '@/components/editor/RichTextEditor';
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
import { useBacklinks } from '@/hooks/useBacklinks';
import { setCurrentNoteId } from '@/lib/storage';
import { getNavigationApi } from '@/api';
import { scanForPatternsSync, scanForPatterns } from '@/lib/Scanner/pattern-scanner';
import { smartGraphRegistry } from '@/lib/registry';
import type { EntityKind } from '@/lib/types/entityTypes';
import { BacklinksDrawer } from '@/components/backlinks/BacklinksDrawer';
import { Logo } from '@/components/icons/Logo';

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

  // Editor ref for undo/redo
  const editorRef = useRef<RichTextEditorRef>(null);

  // Backlinks drawer state
  const [backlinksOpen, setBacklinksOpen] = useState(false);

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

  // Backlinks for current note
  const backlinksResult = useBacklinks(currentNote, state.notes);

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

  const handleContentChange = (content: { json: object; markdown: string }) => {
    if (!currentNote) return;
    // Store both JSON (as stringified) and markdown for compatibility
    updateNote(currentNote.id, {
      content: JSON.stringify(content.json),
      markdownContent: content.markdown
    });
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

              {/* Undo/Redo buttons */}
              <div className="flex items-center gap-0.5 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => editorRef.current?.undo()}
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => editorRef.current?.redo()}
                  title="Redo (Ctrl+Y)"
                >
                  <Redo2 className="w-4 h-4" />
                </Button>
              </div>

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
                  ref={editorRef}
                  noteId={currentNote.id}
                  initialContent={(() => {
                    // Try to parse content as JSON doc first
                    if (currentNote.content) {
                      try {
                        const parsed = JSON.parse(currentNote.content);
                        if (parsed && typeof parsed === 'object' && parsed.type === 'doc') {
                          return { type: 'json' as const, value: parsed };
                        }
                      } catch { }
                    }
                    // Fallback to markdown
                    return { type: 'markdown' as const, value: currentNote.markdownContent || currentNote.content || '' };
                  })()}
                  markdownContent={currentNote.markdownContent || currentNote.content || ''}
                  onContentChange={handleContentChange}
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground animate-in fade-in-50 duration-500">
                <div className="w-80 h-80 mb-6 opacity-80">
                  <Logo className="w-full h-full filter grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-700" />
                </div>
                <h2 className="text-2xl font-semibold tracking-tight">No note selected</h2>
                <p className="text-sm mt-2 max-w-sm">Select a note from the sidebar or create a new one to get started.</p>
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
              backlinksCount={backlinksResult.count}
              onBacklinksClick={() => setBacklinksOpen(true)}
              currentNoteText={currentNote?.markdownContent || currentNote?.content || ''}
            />

            {/* Backlinks Drawer */}
            <BacklinksDrawer
              open={backlinksOpen}
              onOpenChange={setBacklinksOpen}
              backlinks={backlinksResult.backlinks}
              grouped={backlinksResult.grouped}
              onNavigate={handleNavigate}
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
