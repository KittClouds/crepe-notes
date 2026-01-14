// src/hooks/useNoteEditor.ts
// React hook for binding RichTextEditor to EditorApi
// Handles debounced autosave, loading states, error handling

import { useState, useEffect, useCallback, useRef } from 'react';
import { getEditorApi, type Note, type NoteUpdateParams, type SaveStatus } from '../api';
import type { EditorContent } from '../components/editor/RichTextEditor';

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
    /** Initial content for the editor (JSON preferred, markdown fallback) */
    initialContent: EditorContent | null;
    /** Handler for content changes (debounced save) */
    handleContentChange: (content: { json: object; markdown: string }) => void;
    /** Force immediate save (bypass debounce) */
    saveNow: () => Promise<void>;
}

/**
 * Hook for managing note editing with debounced autosave.
 * Now uses JSON serialization for rich formatting support.
 * 
 * Usage:
 * ```tsx
 * const { note, isLoading, saveStatus, initialContent, handleContentChange } = useNoteEditor({
 *   worldId: 'world-1',
 *   noteId: 'note-123',
 * });
 * 
 * if (isLoading || !initialContent) return <Spinner />;
 * if (!note) return <NotFound />;
 * 
 * return (
 *   <RichTextEditor
 *     noteId={note.id}
 *     initialContent={initialContent}
 *     onContentChange={handleContentChange}
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
    const [initialContent, setInitialContent] = useState<EditorContent | null>(null);

    // Refs for debouncing
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const pendingContentRef = useRef<{ json: object; markdown: string } | null>(null);
    const isSavingRef = useRef(false);

    const api = getEditorApi();

    // Load note on mount or when noteId changes
    useEffect(() => {
        let cancelled = false;

        async function loadNote() {
            setIsLoading(true);
            setError(null);
            setInitialContent(null);

            try {
                const loadedNote = await api.getNote(worldId, noteId);
                if (!cancelled) {
                    setNote(loadedNote);
                    setSaveStatus('saved');

                    // Determine initial content: prefer JSON, fallback to markdown
                    // The backend stores JSON in content field as stringified JSON
                    let content: EditorContent;

                    // Try to parse content as JSON first
                    if (loadedNote.content) {
                        try {
                            const parsed = JSON.parse(loadedNote.content);
                            // Check if it's a valid ProseMirror doc
                            if (parsed && typeof parsed === 'object' && parsed.type === 'doc') {
                                content = { type: 'json', value: parsed };
                            } else {
                                // Not a PM doc, treat as markdown
                                content = { type: 'markdown', value: loadedNote.content };
                            }
                        } catch {
                            // Not valid JSON, treat as markdown
                            content = { type: 'markdown', value: loadedNote.content };
                        }
                    } else {
                        content = { type: 'markdown', value: '' };
                    }

                    setInitialContent(content);
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

    // Save function - now saves JSON doc stringified in content field
    const performSave = useCallback(async (content: { json: object; markdown: string }) => {
        if (isSavingRef.current) {
            // Queue this content for after current save
            pendingContentRef.current = content;
            return;
        }

        isSavingRef.current = true;
        setSaveStatus('saving');

        try {
            // Store the JSON doc as stringified content
            const params: NoteUpdateParams = {
                worldId,
                id: noteId,
                content: JSON.stringify(content.json), // Store JSON doc
                // Could also store markdown separately if needed for search
            };

            const updated = await api.updateNote(params);
            setNote(updated);
            setSaveStatus('saved');
            setError(null);
            onSave?.(updated);

            // Check if there's pending content to save
            if (pendingContentRef.current && JSON.stringify(pendingContentRef.current.json) !== JSON.stringify(content.json)) {
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
    const handleContentChange = useCallback((content: { json: object; markdown: string }) => {
        setSaveStatus('unsaved');

        // Update local state immediately (optimistic) - store JSON in content
        setNote(prev => prev ? { ...prev, content: JSON.stringify(content.json) } : null);

        // Clear existing timer
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        // Set new timer
        debounceTimerRef.current = setTimeout(() => {
            performSave(content);
        }, DEBOUNCE_MS);
    }, [performSave]);

    // Force immediate save
    const saveNow = useCallback(async () => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }

        if (note && saveStatus === 'unsaved' && note.content) {
            try {
                const json = JSON.parse(note.content);
                await performSave({ json, markdown: '' }); // markdown not needed for immediate save
            } catch {
                // Content isn't JSON, skip
            }
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
        initialContent,
        handleContentChange,
        saveNow,
    };
}
