// src/components/hub/tabs/ThemeTab.tsx
// Entity Theme tab - "Pro" Redesign with Dual Color System
// Dense Grid Layout with Dual Color Pickers

import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RotateCcw } from 'lucide-react';
import { ENTITY_KINDS, type EntityKind } from '@/lib/types/entityTypes';
import { useEntityColors, DEFAULT_ENTITY_COLORS, DEFAULT_ENTITY_TEXT_COLORS } from '@/lib/store/entityColorStore';
import { HighlightingModeToggle } from '@/components/ui/HighlightingModeToggle';

/**
 * Convert HSL string "280 70% 60%" to hex "#RRGGBB"
 */
function hslToHex(hslString: string): string {
    try {
        const [h, s, l] = hslString.split(' ').map((v, i) =>
            i === 0 ? parseFloat(v) : parseFloat(v.replace('%', ''))
        );

        const sNorm = s / 100;
        const lNorm = l / 100;

        const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = lNorm - c / 2;

        let r = 0, g = 0, b = 0;

        if (h < 60) { r = c; g = x; b = 0; }
        else if (h < 120) { r = x; g = c; b = 0; }
        else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; }
        else if (h < 300) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }

        const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    } catch {
        return '#888888';
    }
}

/**
 * Convert hex "#RRGGBB" to HSL string "280 70% 60%"
 */
function hexToHsl(hex: string): string {
    try {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!result) return '220 10% 50%';

        const r = parseInt(result[1], 16) / 255;
        const g = parseInt(result[2], 16) / 255;
        const b = parseInt(result[3], 16) / 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h = 0, s = 0;
        const l = (max + min) / 2;

        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
                case g: h = ((b - r) / d + 2) * 60; break;
                case b: h = ((r - g) / d + 4) * 60; break;
            }
        }

        return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
    } catch {
        return '220 10% 50%';
    }
}

export function ThemeTab() {
    const { colors, textColors, setColor, setTextColor, reset } = useEntityColors();

    const getHexColor = useCallback((kind: EntityKind) => {
        return hslToHex(colors[kind] || DEFAULT_ENTITY_COLORS[kind] || '220 10% 50%');
    }, [colors]);

    const getHexTextColor = useCallback((kind: EntityKind) => {
        return hslToHex(textColors[kind] || DEFAULT_ENTITY_TEXT_COLORS[kind] || '220 10% 50%');
    }, [textColors]);

    const updateColor = useCallback((kind: EntityKind, hexColor: string) => {
        const hsl = hexToHsl(hexColor);
        setColor(kind, hsl);
    }, [setColor]);

    const updateTextColor = useCallback((kind: EntityKind, hexColor: string) => {
        const hsl = hexToHsl(hexColor);
        setTextColor(kind, hsl);
    }, [setTextColor]);

    const sortedKinds = [...ENTITY_KINDS].sort();

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
                <div>
                    <h2 className="text-xl font-semibold tracking-tight">Entity Theme</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Define the visual language of your story bible.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <HighlightingModeToggle />
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={reset}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                        <RotateCcw className="w-3.5 h-3.5 mr-2" />
                        Reset
                    </Button>
                </div>
            </div>

            {/* Main Grid - Professional Palette Layout */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {sortedKinds.map((kind) => {
                    const hexColor = getHexColor(kind);
                    const hexTextColor = getHexTextColor(kind);

                    return (
                        <div
                            key={kind}
                            className="group flex items-center justify-between p-3 rounded-lg bg-card/50 hover:bg-muted/50 transition-all border border-transparent hover:border-border/50"
                        >
                            {/* Entity Info */}
                            <div className="flex flex-col gap-1 min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium truncate text-foreground/90 group-hover:text-foreground">
                                        {kind}
                                    </span>

                                    {/* Preview Badge */}
                                    <div
                                        className="hidden sm:inline-flex px-1.5 py-0.5 rounded-[3px] text-[9px] font-semibold border uppercase tracking-wider opacity-60 group-hover:opacity-100 transition-opacity"
                                        style={{
                                            backgroundColor: `hsl(var(--entity-${kind.toLowerCase().replace(/_/g, '-')}) / 0.15)`,
                                            color: `hsl(var(--entity-${kind.toLowerCase().replace(/_/g, '-')}-text))`,
                                            borderColor: `hsl(var(--entity-${kind.toLowerCase().replace(/_/g, '-')}) / 0.3)`,
                                        }}
                                    >
                                        PREVIEW
                                    </div>
                                </div>

                                {/* Hex Codes (Subtle) */}
                                <div className="flex gap-3 text-[10px] font-mono text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span>P: {hexColor}</span>
                                    <span>T: {hexTextColor}</span>
                                </div>
                            </div>

                            {/* Controls */}
                            <div className="flex items-center gap-2">
                                {/* Pill Color Picker */}
                                <div className="relative shrink-0 group/picker">
                                    <div
                                        className="w-8 h-8 rounded-md shadow-sm ring-1 ring-inset ring-black/10 dark:ring-white/10 transition-transform group-hover/picker:scale-110 cursor-pointer"
                                        style={{ backgroundColor: hexColor }}
                                        title="Pill/Badge color"
                                    />
                                    <Input
                                        type="color"
                                        value={hexColor}
                                        onChange={(e) => updateColor(kind, e.target.value)}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                </div>

                                {/* Text Color Picker */}
                                <div className="relative shrink-0 group/picker">
                                    <div
                                        className="w-8 h-8 rounded-full shadow-sm ring-1 ring-inset ring-black/10 dark:ring-white/10 transition-transform group-hover/picker:scale-110 flex items-center justify-center text-xs font-bold cursor-pointer bg-background"
                                        style={{
                                            color: hexTextColor,
                                            border: `2px solid ${hexTextColor}`,
                                        }}
                                        title="Text/Character color"
                                    >
                                        Aa
                                    </div>
                                    <Input
                                        type="color"
                                        value={hexTextColor}
                                        onChange={(e) => updateTextColor(kind, e.target.value)}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Note about live updates */}
            <p className="text-xs text-center text-muted-foreground/50 pt-8">
                Changes apply instantly across the entire workspace.
            </p>
        </div>
    );
}

export default ThemeTab;
