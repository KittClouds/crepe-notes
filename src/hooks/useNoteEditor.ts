// src/hooks/useNoteEditor.ts
// React hook for binding RichTextEditor to EditorApi
// Handles debounced autosave, loading states, error handling

import { useState, useEffect, useCallback, useRef } from 'react';
import { getEditorApi, type Note, type NoteUpdateParams, type SaveStatus } from '../api';

const DEBOUNCE_MS = 1000;

interface UseNoteEditorOptions {
    worldId: string;
    noteId: string;
    /** Called when note is successfully saved */
    onSave?: (note: Note) => void;
    /** Called when an error occurs */
    onError?: (error: Error) => void;
}

interface UseNoteEditorResult {
    /** Current note data (null while loading) */
    note: Note | null;
    /** Loading state for initial fetch */
    isLoading: boolean;
    /** Current save status */
    saveStatus: SaveStatus;
    /** Error message if any */
    error: string | null;
    /** Handler for markdown changes (debounced save) */
    handleMarkdownChange: (markdown: string) => void;
    /** Force immediate save (bypass debounce) */
    saveNow: () => Promise<void>;
}

/**
 * Hook for managing note editing with debounced autosave.
 * 
 * Usage:
 * ```tsx
 * const { note, isLoading, saveStatus, handleMarkdownChange } = useNoteEditor({
 *   worldId: 'world-1',
 *   noteId: 'note-123',
 * });
 * 
 * if (isLoading) return <Spinner />;
 * if (!note) return <NotFound />;
 * 
 * return (
 *   <RichTextEditor
 *     noteId={note.id}
 *     initialMarkdown={note.content}
 *     onMarkdownChange={handleMarkdownChange}
 *     saveStatus={saveStatus}
 *   />
 * );
 * ```
 */
export function useNoteEditor(options: UseNoteEditorOptions): UseNoteEditorResult {
    const { worldId, noteId, onSave, onError } = options;

    const [note, setNote] = useState<Note | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
    const [error, setError] = useState<string | null>(null);

    // Refs for debouncing
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const pendingContentRef = useRef<string | null>(null);
    const isSavingRef = useRef(false);

    const api = getEditorApi();

    // Load note on mount or when noteId changes
    useEffect(() => {
        let cancelled = false;

        async function loadNote() {
            setIsLoading(true);
            setError(null);

            try {
                const loadedNote = await api.getNote(worldId, noteId);
                if (!cancelled) {
                    setNote(loadedNote);
                    setSaveStatus('saved');
                }
            } catch (err) {
                if (!cancelled) {
                    const message = err instanceof Error ? err.message : 'Failed to load note';
                    setError(message);
                    onError?.(err instanceof Error ? err : new Error(message));
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        }

        loadNote();

        return () => {
            cancelled = true;
        };
    }, [worldId, noteId, api, onError]);

    // Save function
    const performSave = useCallback(async (content: string) => {
        if (isSavingRef.current) {
            // Queue this content for after current save
            pendingContentRef.current = content;
            return;
        }

        isSavingRef.current = true;
        setSaveStatus('saving');

        try {
            const params: NoteUpdateParams = {
                worldId,
                id: noteId,
                content,
            };

            const updated = await api.updateNote(params);
            setNote(updated);
            setSaveStatus('saved');
            setError(null);
            onSave?.(updated);

            // Check if there's pending content to save
            if (pendingContentRef.current && pendingContentRef.current !== content) {
                const pending = pendingContentRef.current;
                pendingContentRef.current = null;
                // Save the pending content
                isSavingRef.current = false;
                await performSave(pending);
                return;
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to save note';
            setError(message);
            setSaveStatus('error');
            onError?.(err instanceof Error ? err : new Error(message));
        } finally {
            isSavingRef.current = false;
        }
    }, [worldId, noteId, api, onSave, onError]);

    // Debounced change handler
    const handleMarkdownChange = useCallback((markdown: string) => {
        setSaveStatus('unsaved');

        // Update local state immediately (optimistic)
        setNote(prev => prev ? { ...prev, content: markdown } : null);

        // Clear existing timer
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        // Set new timer
        debounceTimerRef.current = setTimeout(() => {
            performSave(markdown);
        }, DEBOUNCE_MS);
    }, [performSave]);

    // Force immediate save
    const saveNow = useCallback(async () => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }

        if (note && saveStatus === 'unsaved') {
            await performSave(note.content);
        }
    }, [note, saveStatus, performSave]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, []);

    return {
        note,
        isLoading,
        saveStatus,
        error,
        handleMarkdownChange,
        saveNow,
    };
}
