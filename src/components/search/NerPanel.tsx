/**
 * NER Panel - Simplified for web-only version
 * 
 * Native NER (GLiNER) requires the Tauri desktop app.
 * This panel shows the FST scanner toggle and entity list.
 */

import React, { useState, useEffect } from 'react';
import {
    Brain,
    AlertTriangle,
    CheckCircle2,
    XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNER, type NerSuggestion } from '@/contexts/NERContext';
import { useNotesStore } from '@/hooks/useNotesStore';
import { Switch } from '@/components/ui/switch';

export function NerPanel() {
    // Context
    const {
        suggestions,
        acceptSuggestion,
        rejectSuggestion,
        fstNerEnabled,
        setFstNerEnabled,
        setCurrentNoteId
    } = useNER();

    // Notes Store
    const { state } = useNotesStore();

    // Sync selected note to NER context
    useEffect(() => {
        setCurrentNoteId(state.selectedNoteId);
    }, [state.selectedNoteId, setCurrentNoteId]);

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-4 border-b border-border">
                <div className="flex items-center gap-2 mb-2">
                    <Brain className="h-5 w-5 text-purple-500" />
                    <span className="font-semibold">Entity Detection</span>
                </div>
                <p className="text-xs text-muted-foreground">
                    Detect and manage entities in your notes
                </p>
            </div>

            {/* FST Scanner Toggle */}
            <div className="p-4 border-b border-border">
                <div className="flex items-center justify-between">
                    <div className="flex-1">
                        <span className="text-sm font-medium">FST Scanner</span>
                        <p className="text-xs text-muted-foreground">
                            Instant entity detection (WASM)
                        </p>
                    </div>
                    <Switch
                        checked={fstNerEnabled}
                        onCheckedChange={setFstNerEnabled}
                        className="data-[state=checked]:bg-purple-500"
                    />
                </div>
            </div>

            {/* Native NER Notice */}
            <div className="p-4 border-b border-border bg-muted/30">
                <div className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-medium text-muted-foreground">AI NER Available in Desktop App</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            The GLiNER AI model for advanced entity extraction requires the native desktop application.
                        </p>
                    </div>
                </div>
            </div>

            {/* Suggestions Section */}
            <div className="p-4 border-b border-border">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Pending Suggestions</span>
                    <span className="text-xs bg-muted px-2 py-0.5 rounded">
                        {suggestions.length}
                    </span>
                </div>

                {suggestions.length > 0 ? (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                        {suggestions.map((s) => (
                            <SuggestionCard
                                key={s.id}
                                suggestion={s}
                                onAccept={acceptSuggestion}
                                onReject={rejectSuggestion}
                            />
                        ))}
                    </div>
                ) : (
                    <p className="text-xs text-muted-foreground">
                        No pending suggestions
                    </p>
                )}
            </div>

            {/* Empty state / help */}
            <div className="flex-1 flex items-center justify-center p-4">
                <div className="text-center text-muted-foreground">
                    <Brain className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">
                        Use bracket syntax like <code className="bg-muted px-1 rounded">[CHARACTER|Name]</code> to create entities
                    </p>
                </div>
            </div>
        </div>
    );
}

// Suggestion card component
interface SuggestionCardProps {
    suggestion: NerSuggestion;
    onAccept: (id: string) => Promise<boolean>;
    onReject: (id: string) => Promise<boolean>;
}

function SuggestionCard({ suggestion, onAccept, onReject }: SuggestionCardProps) {
    const [isProcessing, setIsProcessing] = useState(false);

    const handleAccept = async () => {
        setIsProcessing(true);
        await onAccept(suggestion.id);
        setIsProcessing(false);
    };

    const handleReject = async () => {
        setIsProcessing(true);
        await onReject(suggestion.id);
        setIsProcessing(false);
    };

    const confidencePercent = Math.round(suggestion.confidence * 100);

    return (
        <div className="flex items-center justify-between p-2 bg-muted/50 rounded text-xs">
            <div className="flex-1 min-w-0">
                <span className="font-medium truncate block">{suggestion.label}</span>
                <span className="text-muted-foreground">
                    {suggestion.kind} • {confidencePercent}%
                </span>
            </div>
            <div className="flex gap-1 shrink-0 ml-2">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-green-500 hover:text-green-600"
                    onClick={handleAccept}
                    disabled={isProcessing}
                >
                    <CheckCircle2 className="h-3 w-3" />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-red-500 hover:text-red-600"
                    onClick={handleReject}
                    disabled={isProcessing}
                >
                    <XCircle className="h-3 w-3" />
                </Button>
            </div>
        </div>
    );
}
