import React, { useState, useCallback } from 'react';
import { Plus, Search, FileText, ChevronDown, FolderIcon, Tag, Settings, MoreHorizontal, PanelLeftClose, PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Note } from '@/types/notes';
import { cn } from '@/lib/utils';

interface AppSidebarProps {
  notes: Note[];
  currentNoteId: string | null;
  onNoteSelect: (noteId: string) => void;
  onNewNote: () => void;
  onDeleteNote: (noteId: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  notes,
  currentNoteId,
  onNoteSelect,
  onNewNote,
  onDeleteNote,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredNotes = searchQuery
    ? notes.filter(
        (note) =>
          note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          note.markdownContent.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : notes;

  const formatDate = useCallback((date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }, []);

  const getPreview = useCallback((content: string) => {
    const stripped = content
      .replace(/^#+ /gm, '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/`/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim();
    
    const firstLine = stripped.split('\n').find((line) => line.trim().length > 0) || '';
    return firstLine.slice(0, 60) + (firstLine.length > 60 ? '...' : '');
  }, []);

  if (isCollapsed) {
    return (
      <div className="w-14 h-full bg-sidebar border-r border-sidebar-border flex flex-col items-center py-4 gap-4">
        {onToggleCollapse && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="w-10 h-10"
          >
            <PanelLeft className="w-5 h-5" />
          </Button>
        )}
        <Separator className="w-8" />
        <Button
          variant="ghost"
          size="icon"
          onClick={onNewNote}
          className="w-10 h-10"
        >
          <Plus className="w-5 h-5" />
        </Button>
        <ScrollArea className="flex-1">
          <div className="flex flex-col items-center gap-2">
            {notes.slice(0, 10).map((note) => (
              <Button
                key={note.id}
                variant="ghost"
                size="icon"
                onClick={() => onNoteSelect(note.id)}
                className={cn(
                  'w-10 h-10',
                  currentNoteId === note.id && 'bg-sidebar-accent'
                )}
              >
                <FileText className="w-4 h-4" />
              </Button>
            ))}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="w-72 h-full bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Header */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-sidebar-foreground tracking-tight">
            Inkwell
          </h1>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Settings className="w-4 h-4" />
            </Button>
            {onToggleCollapse && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleCollapse}
                className="h-8 w-8"
              >
                <PanelLeftClose className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-sidebar-accent border-0 focus-visible:ring-1 focus-visible:ring-sidebar-ring"
          />
        </div>

        {/* New Note Button */}
        <Button
          onClick={onNewNote}
          className="w-full justify-start gap-2"
          variant="outline"
        >
          <Plus className="w-4 h-4" />
          New Note
        </Button>
      </div>

      <Separator />

      {/* Navigation */}
      <div className="p-2">
        <div className="space-y-1">
          <SidebarSection icon={FileText} label="All Notes" count={notes.length} />
          <SidebarSection icon={FolderIcon} label="Folders" expandable />
          <SidebarSection icon={Tag} label="Tags" expandable />
        </div>
      </div>

      <Separator />

      {/* Notes List */}
      <ScrollArea className="flex-1 px-2">
        <div className="space-y-1 py-2">
          {filteredNotes.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              {searchQuery ? 'No notes found' : 'No notes yet'}
            </div>
          ) : (
            filteredNotes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                isActive={currentNoteId === note.id}
                onClick={() => onNoteSelect(note.id)}
                onDelete={() => onDeleteNote(note.id)}
                formatDate={formatDate}
                getPreview={getPreview}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

interface SidebarSectionProps {
  icon: React.ElementType;
  label: string;
  count?: number;
  expandable?: boolean;
}

const SidebarSection: React.FC<SidebarSectionProps> = ({
  icon: Icon,
  label,
  count,
  expandable,
}) => {
  return (
    <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <span className="flex-1 text-left">{label}</span>
      {count !== undefined && (
        <span className="text-xs text-muted-foreground">{count}</span>
      )}
      {expandable && (
        <ChevronDown className="w-4 h-4 text-muted-foreground" />
      )}
    </button>
  );
};

interface NoteCardProps {
  note: Note;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
  formatDate: (date: Date) => string;
  getPreview: (content: string) => string;
}

const NoteCard: React.FC<NoteCardProps> = ({
  note,
  isActive,
  onClick,
  onDelete,
  formatDate,
  getPreview,
}) => {
  return (
    <div
      onClick={onClick}
      className={cn(
        'note-card group relative',
        isActive && 'active'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-sm text-sidebar-foreground truncate">
          {note.title}
        </h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="text-destructive focus:text-destructive"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="text-xs text-muted-foreground truncate mt-1">
        {getPreview(note.markdownContent)}
      </p>
      <p className="text-xs text-muted-foreground mt-1.5">
        {formatDate(note.updatedAt)}
      </p>
    </div>
  );
};

export default AppSidebar;
