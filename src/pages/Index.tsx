import React, { useState, useEffect, useCallback } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { NoteHeader } from '@/components/layout/NoteHeader';
import { RichTextEditor } from '@/components/editor/RichTextEditor';
import { Note } from '@/types/notes';
import {
  getAllNotes,
  getNoteById,
  createNote,
  updateNote,
  deleteNote,
  getCurrentNoteId,
  setCurrentNoteId,
  initializeStorage,
} from '@/lib/storage';

const Index: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [currentNote, setCurrentNote] = useState<Note | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  // Initialize on mount
  useEffect(() => {
    const storedNotes = getAllNotes();
    
    if (storedNotes.length === 0) {
      const defaultNote = initializeStorage();
      setNotes([defaultNote]);
      setCurrentNote(defaultNote);
      setCurrentNoteId(defaultNote.id);
    } else {
      setNotes(storedNotes);
      
      const lastNoteId = getCurrentNoteId();
      if (lastNoteId) {
        const note = getNoteById(lastNoteId);
        setCurrentNote(note || storedNotes[0]);
      } else {
        setCurrentNote(storedNotes[0]);
        setCurrentNoteId(storedNotes[0].id);
      }
    }
  }, []);

  // Check for mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setShowMobileSidebar(false);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleNoteSelect = useCallback((noteId: string) => {
    const note = getNoteById(noteId);
    if (note) {
      setCurrentNote(note);
      setCurrentNoteId(noteId);
      setShowMobileSidebar(false);
    }
  }, []);

  const handleNewNote = useCallback(() => {
    const newNote = createNote({
      title: 'Untitled Note',
      markdownContent: '# Untitled Note\n\nStart writing...',
    });
    
    setNotes((prev) => [newNote, ...prev]);
    setCurrentNote(newNote);
    setCurrentNoteId(newNote.id);
    setShowMobileSidebar(false);
    
    toast.success('New note created');
  }, []);

  const handleDeleteNote = useCallback((noteId: string) => {
    const success = deleteNote(noteId);
    
    if (success) {
      setNotes((prev) => {
        const updated = prev.filter((n) => n.id !== noteId);
        
        // If we deleted the current note, select another
        if (currentNote?.id === noteId) {
          if (updated.length > 0) {
            setCurrentNote(updated[0]);
            setCurrentNoteId(updated[0].id);
          } else {
            // Create a new note if none left
            const newNote = createNote();
            updated.push(newNote);
            setCurrentNote(newNote);
            setCurrentNoteId(newNote.id);
          }
        }
        
        return updated;
      });
      
      toast.success('Note deleted');
    }
  }, [currentNote?.id]);

  const handleTitleChange = useCallback((title: string) => {
    if (!currentNote) return;
    
    const updated = updateNote(currentNote.id, { title });
    if (updated) {
      setCurrentNote(updated);
      setNotes((prev) =>
        prev.map((n) => (n.id === updated.id ? updated : n))
      );
    }
  }, [currentNote]);

  const handleMarkdownChange = useCallback((markdown: string) => {
    if (!currentNote) return;
    
    const updated = updateNote(currentNote.id, { markdownContent: markdown });
    if (updated) {
      setCurrentNote(updated);
      setNotes((prev) =>
        prev.map((n) => (n.id === updated.id ? updated : n))
      );
    }
  }, [currentNote]);

  const handleShare = useCallback(() => {
    toast.info('Share functionality coming soon');
  }, []);

  const handleViewHistory = useCallback(() => {
    toast.info('Version history coming soon');
  }, []);

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Mobile sidebar overlay */}
      {isMobile && showMobileSidebar && (
        <div 
          className="fixed inset-0 bg-foreground/20 z-40"
          onClick={() => setShowMobileSidebar(false)}
        />
      )}

      {/* Sidebar */}
      <div 
        className={`
          ${isMobile 
            ? `fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ${showMobileSidebar ? 'translate-x-0' : '-translate-x-full'}`
            : sidebarCollapsed ? 'w-14' : 'w-72'
          }
          ${!isMobile && 'transition-all duration-300'}
        `}
      >
        <AppSidebar
          notes={notes}
          currentNoteId={currentNote?.id || null}
          onNoteSelect={handleNoteSelect}
          onNewNote={handleNewNote}
          onDeleteNote={handleDeleteNote}
          isCollapsed={!isMobile && sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar for mobile */}
        {isMobile && (
          <div className="flex items-center gap-2 p-4 border-b border-border bg-card">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowMobileSidebar(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>
            <span className="font-medium truncate">{currentNote?.title || 'Inkwell'}</span>
          </div>
        )}


        {/* Note content */}
        {currentNote ? (
          <div className="flex-1 flex flex-col min-h-0">
            {!isMobile && (
              <NoteHeader
                note={currentNote}
                onTitleChange={handleTitleChange}
                onShare={handleShare}
                onViewHistory={handleViewHistory}
              />
            )}
            
            <div className="flex-1 min-h-0 overflow-hidden">
              <RichTextEditor
                key={currentNote.id}
                noteId={currentNote.id}
                initialMarkdown={currentNote.markdownContent}
                onMarkdownChange={handleMarkdownChange}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-muted-foreground">No note selected</h2>
              <p className="text-sm text-muted-foreground mt-1">Select a note or create a new one</p>
            </div>
          </div>
        )}
      </div>

      <Toaster position="bottom-right" />
    </div>
  );
};

export default Index;
