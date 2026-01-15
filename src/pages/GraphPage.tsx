/**
 * GraphPage - Full-page knowledge graph visualization
 * 
 * Features:
 * - 3D/2D force-directed graph
 * - Navigation back to editor
 * - Stats overlay
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraphView } from '@/components/graph';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Maximize2, RotateCcw, Box, Grid2X2 } from 'lucide-react';
import type { GraphScope } from '@/lib/graph/types/graph-types';

export default function GraphPage() {
    const navigate = useNavigate();
    const [renderMode, setRenderMode] = useState<'2d' | '3d'>('3d');
    const [scope, setScope] = useState<GraphScope>({ type: 'global' });

    const handleBackToEditor = () => {
        navigate('/');
    };

    const toggleRenderMode = () => {
        setRenderMode(prev => prev === '3d' ? '2d' : '3d');
    };

    return (
        <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
            {/* Header Bar */}
            <header className="h-14 border-b border-border flex items-center justify-between px-4 shrink-0 bg-background/95 backdrop-blur z-10">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleBackToEditor}
                        className="gap-2"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Editor
                    </Button>
                    <div className="h-5 w-px bg-border" />
                    <h1 className="text-lg font-semibold">Knowledge Graph</h1>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={toggleRenderMode}
                        className="gap-2"
                    >
                        {renderMode === '3d' ? (
                            <>
                                <Grid2X2 className="h-4 w-4" />
                                Switch to 2D
                            </>
                        ) : (
                            <>
                                <Box className="h-4 w-4" />
                                Switch to 3D
                            </>
                        )}
                    </Button>
                </div>
            </header>

            {/* Graph Canvas */}
            <main className="flex-1 relative">
                <GraphView
                    scope={scope}
                    renderMode={renderMode}
                    className="w-full h-full"
                    onNodeClick={(nodeId, node) => {
                        console.log('[GraphPage] Node clicked:', nodeId, node);
                    }}
                />
            </main>
        </div>
    );
}
