// src/editor/plugins/toolbar/ColorPicker.tsx
// Enhanced color picker with preset grid, recently used, and custom color support

import { useState, useCallback, useRef, useEffect } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import { Paintbrush, X, Plus } from 'lucide-react';

// Preset color palette - matches Google Docs / Notion style
const PRESET_COLORS = {
    grays: [
        '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
    ],
    rainbow: [
        // Row 1 - Vivid
        '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#9900ff', '#ff00ff',
        // Row 2 - Light
        '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#cfe2f3', '#d9d2e9', '#ead1dc',
        // Row 3 - Medium Light
        '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#9fc5e8', '#b4a7d6', '#d5a6bd',
        // Row 4 - Medium
        '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6fa8dc', '#8e7cc3', '#c27ba0',
        // Row 5 - Medium Dark
        '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3d85c6', '#674ea7', '#a64d79',
        // Row 6 - Dark
        '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#0b5394', '#351c75', '#741b47',
    ],
};

interface ColorPickerProps {
    type: 'text-color' | 'highlight';
    icon: React.ReactNode;
    label: string;
    onColorSelect: (color: string | null) => void;
}

export function ColorPicker({ type, icon, label, onColorSelect }: ColorPickerProps) {
    const [showCustomPicker, setShowCustomPicker] = useState(false);
    const [customColor, setCustomColor] = useState('#000000');
    const [recentColors, setRecentColors] = useState<string[]>(() => {
        try {
            const stored = localStorage.getItem(`toolbar_recent_${type}`);
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    });

    const addToRecent = useCallback((color: string) => {
        if (color === 'currentColor' || !color) return;
        setRecentColors(prev => {
            const filtered = prev.filter(c => c !== color);
            const updated = [color, ...filtered].slice(0, 8);
            localStorage.setItem(`toolbar_recent_${type}`, JSON.stringify(updated));
            return updated;
        });
    }, [type]);

    const handleSelect = (color: string | null) => {
        if (color && color !== 'currentColor') {
            addToRecent(color);
        }
        onColorSelect(color);
    };

    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
                <button
                    type="button"
                    className="toolbar-button toolbar-dropdown-trigger"
                    onMouseDown={(e) => e.preventDefault()}
                >
                    {icon}
                    <svg width="10" height="10" viewBox="0 0 10 10" className="ml-0.5 opacity-60">
                        <path d="M2 4L5 7L8 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    className="color-picker-dropdown"
                    sideOffset={8}
                    onCloseAutoFocus={(e) => e.preventDefault()}
                >
                    {/* Default/Remove option */}
                    <DropdownMenu.Item
                        className="color-picker-default-row"
                        onSelect={() => handleSelect(null)}
                    >
                        <Paintbrush size={14} />
                        <span>Default</span>
                    </DropdownMenu.Item>

                    <div className="color-picker-divider" />

                    {/* Gray row */}
                    <div className="color-picker-grid" style={{ gridTemplateColumns: 'repeat(10, 1fr)' }}>
                        {PRESET_COLORS.grays.map((color) => (
                            <DropdownMenu.Item
                                key={color}
                                className="color-swatch"
                                style={{ backgroundColor: color }}
                                onSelect={() => handleSelect(color)}
                                title={color}
                            />
                        ))}
                    </div>

                    {/* Rainbow rows */}
                    <div className="color-picker-grid" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}>
                        {PRESET_COLORS.rainbow.map((color, i) => (
                            <DropdownMenu.Item
                                key={`${color}-${i}`}
                                className="color-swatch"
                                style={{ backgroundColor: color }}
                                onSelect={() => handleSelect(color)}
                                title={color}
                            />
                        ))}
                    </div>

                    {/* Recently Used */}
                    {recentColors.length > 0 && (
                        <>
                            <div className="color-picker-divider" />
                            <div className="color-picker-section-label">Recently Used</div>
                            <div className="color-picker-grid" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}>
                                {recentColors.map((color) => (
                                    <DropdownMenu.Item
                                        key={color}
                                        className="color-swatch"
                                        style={{ backgroundColor: color }}
                                        onSelect={() => handleSelect(color)}
                                        title={color}
                                    />
                                ))}
                            </div>
                        </>
                    )}

                    <div className="color-picker-divider" />

                    {/* More Colors - opens custom picker */}
                    <Popover.Root open={showCustomPicker} onOpenChange={setShowCustomPicker}>
                        <Popover.Trigger asChild>
                            <button
                                className="color-picker-more-btn"
                                onMouseDown={(e) => e.preventDefault()}
                            >
                                More Colors...
                            </button>
                        </Popover.Trigger>
                        <Popover.Portal>
                            <Popover.Content
                                className="color-picker-custom"
                                side="right"
                                sideOffset={10}
                                align="start"
                            >
                                <CustomColorPicker
                                    value={customColor}
                                    onChange={setCustomColor}
                                    onApply={() => {
                                        handleSelect(customColor);
                                        setShowCustomPicker(false);
                                    }}
                                />
                                <Popover.Arrow className="color-picker-arrow" />
                            </Popover.Content>
                        </Popover.Portal>
                    </Popover.Root>
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
}

// ============================================================================
// Custom Color Picker (Gradient + Hue Slider + Hex Input)
// ============================================================================

interface CustomColorPickerProps {
    value: string;
    onChange: (color: string) => void;
    onApply: () => void;
}

function CustomColorPicker({ value, onChange, onApply }: CustomColorPickerProps) {
    const [hue, setHue] = useState(0);
    const [saturation, setSaturation] = useState(100);
    const [lightness, setLightness] = useState(50);
    const gradientRef = useRef<HTMLDivElement>(null);
    const hueRef = useRef<HTMLDivElement>(null);
    const isDraggingGradient = useRef(false);
    const isDraggingHue = useRef(false);

    // Parse initial color to HSL
    useEffect(() => {
        const { h, s, l } = hexToHsl(value);
        setHue(h);
        setSaturation(s);
        setLightness(l);
    }, []);

    // Update hex when HSL changes
    useEffect(() => {
        const hex = hslToHex(hue, saturation, lightness);
        onChange(hex);
    }, [hue, saturation, lightness, onChange]);

    const handleGradientInteraction = (e: React.MouseEvent | MouseEvent) => {
        if (!gradientRef.current) return;
        const rect = gradientRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

        // x = saturation (0-100), y = lightness (100-0)
        setSaturation(Math.round(x * 100));
        setLightness(Math.round((1 - y) * 50 + (1 - x) * (50 - y * 50)));
    };

    const handleHueInteraction = (e: React.MouseEvent | MouseEvent) => {
        if (!hueRef.current) return;
        const rect = hueRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        setHue(Math.round(x * 360));
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDraggingGradient.current) handleGradientInteraction(e);
            if (isDraggingHue.current) handleHueInteraction(e);
        };
        const handleMouseUp = () => {
            isDraggingGradient.current = false;
            isDraggingHue.current = false;
        };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    return (
        <div className="custom-color-picker">
            {/* Saturation/Lightness gradient */}
            <div
                ref={gradientRef}
                className="color-gradient"
                style={{ backgroundColor: `hsl(${hue}, 100%, 50%)` }}
                onMouseDown={(e) => {
                    isDraggingGradient.current = true;
                    handleGradientInteraction(e);
                }}
            >
                <div className="color-gradient-white" />
                <div className="color-gradient-black" />
                <div
                    className="color-gradient-cursor"
                    style={{
                        left: `${saturation}%`,
                        top: `${100 - lightness * 2}%`,
                        backgroundColor: value,
                    }}
                />
            </div>

            {/* Hue slider */}
            <div
                ref={hueRef}
                className="color-hue-slider"
                onMouseDown={(e) => {
                    isDraggingHue.current = true;
                    handleHueInteraction(e);
                }}
            >
                <div
                    className="color-hue-cursor"
                    style={{ left: `${(hue / 360) * 100}%`, backgroundColor: `hsl(${hue}, 100%, 50%)` }}
                />
            </div>

            {/* Hex input */}
            <input
                type="text"
                className="color-hex-input"
                value={value.replace('#', '')}
                onChange={(e) => {
                    const hex = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
                    if (hex.length === 6) {
                        onChange(`#${hex}`);
                    }
                }}
                maxLength={6}
            />

            {/* Apply button */}
            <button className="color-apply-btn" onClick={onApply}>
                <Plus size={16} />
            </button>
        </div>
    );
}

// ============================================================================
// Color Conversion Utilities
// ============================================================================

function hexToHsl(hex: string): { h: number; s: number; l: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return { h: 0, s: 100, l: 50 };

    let r = parseInt(result[1], 16) / 255;
    let g = parseInt(result[2], 16) / 255;
    let b = parseInt(result[3], 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }

    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h: number, s: number, l: number): string {
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}
