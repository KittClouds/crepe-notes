import React, { useEffect, useState } from 'react';
import { Commet } from 'react-loading-indicators';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/icons/Logo';

interface LoadingScreenProps {
    isVisible: boolean;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ isVisible }) => {
    // We keep it mounted for exit animation
    const [shouldRender, setShouldRender] = useState(isVisible);

    useEffect(() => {
        if (isVisible) setShouldRender(true);
        else {
            const timer = setTimeout(() => setShouldRender(false), 500); // Fade out duration
            return () => clearTimeout(timer);
        }
    }, [isVisible]);

    if (!shouldRender) return null;

    return (
        <div
            className={cn(
                "fixed inset-0 z-50 flex flex-col items-center justify-center bg-black transition-opacity duration-500",
                isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
            )}
        >
            <div className="flex flex-col items-center gap-8">
                {/* Logo with pulse effect */}
                <div className="w-24 h-24 mb-4 animate-pulse">
                    <Logo className="w-full h-full" />
                </div>

                {/* The requested indicators */}
                <Commet
                    color={["#7c2dc1", "#c1322d", "#72c12d", "#2dbcc1"]}
                    size="medium"
                    text=""
                    textColor=""
                />

                <p className="text-zinc-500 text-sm font-medium animate-pulse mt-4">
                    Initializing System...
                </p>
            </div>
        </div>
    );
};
