// src/components/theme/DarkModeToggle.tsx
// Sleek dark mode toggle with circle animation using View Transition API

import { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DarkModeToggleProps {
    className?: string;
}

export function DarkModeToggle({ className }: DarkModeToggleProps) {
    const [isDarkMode, setIsDarkMode] = useState(() => {
        if (typeof document !== 'undefined') {
            return document.documentElement.classList.contains('dark');
        }
        return true;
    });
    const ref = useRef<HTMLButtonElement>(null);

    const toggleDarkMode = async (checked: boolean) => {
        /**
         * Return early if View Transition API is not supported
         * or user prefers reduced motion
         */
        if (
            !ref.current ||
            !document.startViewTransition ||
            window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ) {
            setIsDarkMode(checked);
            return;
        }

        await document.startViewTransition(() => {
            flushSync(() => {
                setIsDarkMode(checked);
            });
        }).ready;

        const { top, left, width, height } = ref.current.getBoundingClientRect();
        const x = left + width / 2;
        const y = top + height / 2;
        const right = window.innerWidth - left;
        const bottom = window.innerHeight - top;
        const maxRadius = Math.hypot(
            Math.max(left, right),
            Math.max(top, bottom),
        );

        document.documentElement.animate(
            {
                clipPath: [
                    `circle(0px at ${x}px ${y}px)`,
                    `circle(${maxRadius}px at ${x}px ${y}px)`,
                ],
            },
            {
                duration: 500,
                easing: 'ease-in-out',
                pseudoElement: '::view-transition-new(root)',
            }
        );
    };

    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }, [isDarkMode]);

    // Sync with stored preference on mount
    useEffect(() => {
        const stored = localStorage.getItem('theme');
        if (stored === 'light') {
            setIsDarkMode(false);
        } else if (stored === 'dark') {
            setIsDarkMode(true);
        }
    }, []);

    return (
        <button
            ref={ref}
            onClick={() => toggleDarkMode(!isDarkMode)}
            className={cn(
                "relative flex items-center justify-center h-8 w-8 rounded-full",
                "bg-secondary/50 hover:bg-secondary transition-colors duration-200",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                className
            )}
            aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
            <div className="relative w-4 h-4">
                <Sun
                    className={cn(
                        "absolute inset-0 w-4 h-4 text-amber-400 transition-all duration-300",
                        isDarkMode ? "opacity-0 rotate-90 scale-0" : "opacity-100 rotate-0 scale-100"
                    )}
                />
                <Moon
                    className={cn(
                        "absolute inset-0 w-4 h-4 text-teal-400 transition-all duration-300",
                        isDarkMode ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-0"
                    )}
                />
            </div>
        </button>
    );
}
