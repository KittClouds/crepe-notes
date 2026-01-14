// src/components/hub/tabs/ThemeTab.tsx
// Entity Theme tab - customize entity highlighting colors
// Uses entityColorStore for live CSS variable updates

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RotateCcw } from 'lucide-react';
import { ENTITY_KINDS, type EntityKind } from '@/lib/types/entityTypes';
import { entityColorStore, useEntityColors, DEFAULT_ENTITY_COLORS } from '@/lib/store/entityColorStore';
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
    const { colors, setColor, reset } = useEntityColors();

    // Convert HSL to hex for the color picker display
    const getHexColor = useCallback((kind: EntityKind) => {
        return hslToHex(colors[kind] || DEFAULT_ENTITY_COLORS[kind] || '220 10% 50%');
    }, [colors]);

    // Update color - convert hex to HSL and update store
    const updateColor = useCallback((kind: EntityKind, hexColor: string) => {
        const hsl = hexToHsl(hexColor);
        setColor(kind, hsl);
    }, [setColor]);

    const sortedKinds = [...ENTITY_KINDS].sort();

    return (
        <div className="space-y-6 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold">Entity Theme</h3>
                    <p className="text-sm text-muted-foreground">
                        Customize the colors used for entity highlighting and icons across the application.
                        Changes apply instantly everywhere.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <HighlightingModeToggle />
                    <Button variant="outline" size="sm" onClick={reset}>
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Reset to Defaults
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedKinds.map((kind) => {
                    const hexColor = getHexColor(kind);
                    return (
                        <div
                            key={kind}
                            className="flex items-center gap-3 p-3 border rounded-lg bg-card hover:bg-muted/50 transition-colors"
                        >
                            <div
                                className="w-10 h-10 rounded-md shadow-sm border shrink-0"
                                style={{ backgroundColor: hexColor }}
                            />

                            <div className="flex-1 min-w-0">
                                <Label
                                    htmlFor={`color-${kind}`}
                                    className="text-sm font-medium mb-1 block truncate"
                                    title={kind}
                                >
                                    {kind}
                                </Label>
                                <div className="flex gap-2">
                                    <div className="relative w-8 h-8 overflow-hidden rounded border cursor-pointer">
                                        <Input
                                            id={`color-${kind}`}
                                            type="color"
                                            value={hexColor}
                                            onChange={(e) => updateColor(kind, e.target.value)}
                                            className="absolute -top-2 -left-2 w-16 h-16 p-0 border-0 cursor-pointer"
                                        />
                                    </div>
                                    <Input
                                        value={hexColor}
                                        onChange={(e) => updateColor(kind, e.target.value)}
                                        className="h-8 font-mono text-xs"
                                        maxLength={7}
                                    />
                                </div>
                            </div>

                            {/* Preview Badge - uses CSS variables for live update */}
                            <div
                                className="px-2 py-1 rounded text-xs font-medium border"
                                style={{
                                    backgroundColor: `hsl(var(--entity-${kind.toLowerCase().replace(/_/g, '-')}) / 0.2)`,
                                    color: `hsl(var(--entity-${kind.toLowerCase().replace(/_/g, '-')}))`,
                                    borderColor: `hsl(var(--entity-${kind.toLowerCase().replace(/_/g, '-')}) / 0.4)`,
                                }}
                            >
                                Preview
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-lg text-sm text-emerald-600 dark:text-emerald-400 mt-8">
                <p>
                    <strong>✓ Live Updates:</strong> Colors are now applied instantly across the entire app -
                    sidebar, editor, entity pills, and all UI components.
                </p>
            </div>
        </div>
    );
}

export default ThemeTab;
