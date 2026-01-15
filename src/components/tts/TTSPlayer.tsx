/**
 * TTS Player Component
 * 
 * Floating player for text-to-speech controls.
 */

import React from 'react';
import {
    Play,
    Pause,
    Square,
    Loader2,
    Volume2,
    AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTTS } from '@/lib/tts';
import { cn } from '@/lib/utils';

interface TTSPlayerProps {
    /** Text to read (usually from editor) */
    text?: string;
    /** Compact mode for toolbar */
    compact?: boolean;
    className?: string;
}

export function TTSPlayer({ text, compact = false, className }: TTSPlayerProps) {
    const { state, play, pause, resume, stop, initModel } = useTTS();

    const handlePlayPause = async () => {
        if (state.status === 'idle' || state.status === 'error') {
            if (text) {
                await play(text);
            }
        } else if (state.status === 'paused') {
            await resume();
        } else if (state.status === 'playing' || state.status === 'synthesizing') {
            await pause();
        }
    };

    const handleStop = async () => {
        await stop();
    };

    // Render loading state
    if (state.status === 'loading-model') {
        return (
            <div className={cn('flex items-center gap-2', className)}>
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                    Initializing... {Math.round(state.progress)}%
                </span>
            </div>
        );
    }

    // Render error state
    if (state.status === 'error') {
        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className={cn('text-destructive', className)}
                            onClick={() => text && play(text)}
                        >
                            <AlertCircle className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>TTS Error: {state.errorMessage}</p>
                        <p className="text-xs text-muted-foreground">Click to retry</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    // Compact mode (just a button)
    if (compact) {
        const isActive = state.status !== 'idle';
        const isPaused = state.status === 'paused';
        const isPlaying = state.status === 'playing' || state.status === 'synthesizing';

        return (
            <TooltipProvider>
                <div className={cn('flex items-center gap-1', className)}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handlePlayPause}
                                disabled={!text && !isActive}
                                className="h-8 w-8"
                            >
                                {isPlaying ? (
                                    <Pause className="h-4 w-4" />
                                ) : isPaused ? (
                                    <Play className="h-4 w-4 text-primary" />
                                ) : (
                                    <Volume2 className="h-4 w-4" />
                                )}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            {isPlaying ? 'Pause' : isPaused ? 'Resume' : 'Read Aloud'}
                        </TooltipContent>
                    </Tooltip>

                    {isActive && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleStop}
                                    className="h-8 w-8"
                                >
                                    <Square className="h-3 w-3" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Stop</TooltipContent>
                        </Tooltip>
                    )}
                </div>
            </TooltipProvider>
        );
    }

    // Full player
    const isActive = state.status !== 'idle';
    const isPlaying = state.status === 'playing' || state.status === 'synthesizing';
    const isPaused = state.status === 'paused';
    const progressPercent = state.totalChunks > 0
        ? (state.currentChunkIndex / state.totalChunks) * 100
        : 0;

    return (
        <div className={cn(
            'flex items-center gap-3 p-3 rounded-lg bg-card border border-border',
            className
        )}>
            {/* Play/Pause button */}
            <Button
                variant={isActive ? 'default' : 'outline'}
                size="icon"
                onClick={handlePlayPause}
                disabled={!text && !isActive}
            >
                {isPlaying ? (
                    <Pause className="h-4 w-4" />
                ) : isPaused ? (
                    <Play className="h-4 w-4" />
                ) : (
                    <Volume2 className="h-4 w-4" />
                )}
            </Button>

            {/* Progress */}
            {isActive && (
                <>
                    <div className="flex-1 min-w-[100px]">
                        <Progress value={progressPercent} className="h-2" />
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {state.currentChunkIndex + 1}/{state.totalChunks}
                    </span>
                </>
            )}

            {/* Stop button */}
            {isActive && (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleStop}
                >
                    <Square className="h-4 w-4" />
                </Button>
            )}
        </div>
    );
}

export default TTSPlayer;
