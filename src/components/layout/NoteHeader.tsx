import React from 'react';
import { Share2, History, MoreHorizontal, Star, StarOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Note, User } from '@/types/notes';

interface NoteHeaderProps {
  note: Note;
  onTitleChange: (title: string) => void;
  collaborators?: User[];
  onShare?: () => void;
  onViewHistory?: () => void;
  onToggleFavorite?: () => void;
  isFavorite?: boolean;
}

export const NoteHeader: React.FC<NoteHeaderProps> = ({
  note,
  onTitleChange,
  collaborators = [],
  onShare,
  onViewHistory,
  onToggleFavorite,
  isFavorite = false,
}) => {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border bg-card">
      {/* Title input */}
      <div className="flex-1 max-w-2xl">
        <Input
          value={note.title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Untitled"
          className="text-xl font-semibold border-0 bg-transparent px-0 h-auto py-1 focus-visible:ring-0 placeholder:text-muted-foreground/50"
        />
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-2">
        {/* Collaborators avatars */}
        {collaborators.length > 0 && (
          <div className="flex -space-x-2 mr-2">
            {collaborators.slice(0, 3).map((user) => (
              <Tooltip key={user.id}>
                <TooltipTrigger asChild>
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-medium text-primary-foreground ring-2 ring-background">
                    {user.displayName.charAt(0).toUpperCase()}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{user.displayName}</p>
                </TooltipContent>
              </Tooltip>
            ))}
            {collaborators.length > 3 && (
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground ring-2 ring-background">
                +{collaborators.length - 3}
              </div>
            )}
          </div>
        )}

        {/* Favorite button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleFavorite}
              className="h-9 w-9"
            >
              {isFavorite ? (
                <Star className="w-4 h-4 fill-warning text-warning" />
              ) : (
                <StarOff className="w-4 h-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isFavorite ? 'Remove from favorites' : 'Add to favorites'}</p>
          </TooltipContent>
        </Tooltip>

        {/* Share button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onShare}
              className="h-9 w-9"
            >
              <Share2 className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Share note</p>
          </TooltipContent>
        </Tooltip>

        {/* History button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onViewHistory}
              className="h-9 w-9"
            >
              <History className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Version history</p>
          </TooltipContent>
        </Tooltip>

        {/* More options */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem>Duplicate</DropdownMenuItem>
            <DropdownMenuItem>Move to folder</DropdownMenuItem>
            <DropdownMenuItem>Add tags</DropdownMenuItem>
            <DropdownMenuItem>Export as Markdown</DropdownMenuItem>
            <DropdownMenuItem>Export as PDF</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive">
              Delete note
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default NoteHeader;
