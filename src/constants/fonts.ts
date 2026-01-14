/**
 * Font Family Presets
 * Organized by category for better UX
 */

export const FONT_FAMILIES = [
    // System Defaults
    { value: 'default', label: 'Default', family: 'inherit', category: 'system' },
    { value: 'system', label: 'System UI', family: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', category: 'system' },

    // Sans-Serif (Modern)
    { value: 'inter', label: 'Inter', family: 'Inter, sans-serif', category: 'sans-serif' },
    { value: 'roboto', label: 'Roboto', family: 'Roboto, sans-serif', category: 'sans-serif' },
    { value: 'opensans', label: 'Open Sans', family: '"Open Sans", sans-serif', category: 'sans-serif' },
    { value: 'lato', label: 'Lato', family: 'Lato, sans-serif', category: 'sans-serif' },
    { value: 'montserrat', label: 'Montserrat', family: 'Montserrat, sans-serif', category: 'sans-serif' },
    { value: 'poppins', label: 'Poppins', family: 'Poppins, sans-serif', category: 'sans-serif' },
    { value: 'nunito', label: 'Nunito', family: 'Nunito, sans-serif', category: 'sans-serif' },
    { value: 'worksans', label: 'Work Sans', family: '"Work Sans", sans-serif', category: 'sans-serif' },

    // Serif (Classic)
    { value: 'georgia', label: 'Georgia', family: 'Georgia, serif', category: 'serif' },
    { value: 'timesnewroman', label: 'Times New Roman', family: '"Times New Roman", Times, serif', category: 'serif' },
    { value: 'merriweather', label: 'Merriweather', family: 'Merriweather, serif', category: 'serif' },
    { value: 'playfair', label: 'Playfair Display', family: '"Playfair Display", serif', category: 'serif' },
    { value: 'lora', label: 'Lora', family: 'Lora, serif', category: 'serif' },
    { value: 'crimson', label: 'Crimson Text', family: '"Crimson Text", serif', category: 'serif' },

    // Monospace (Code)
    { value: 'mono', label: 'Monospace', family: 'ui-monospace, monospace', category: 'monospace' },
    { value: 'jetbrains', label: 'JetBrains Mono', family: '"JetBrains Mono", monospace', category: 'monospace' },
    { value: 'firacode', label: 'Fira Code', family: '"Fira Code", monospace', category: 'monospace' },
    { value: 'sourcecodepro', label: 'Source Code Pro', family: '"Source Code Pro", monospace', category: 'monospace' },
    { value: 'inconsolata', label: 'Inconsolata', family: 'Inconsolata, monospace', category: 'monospace' },
    { value: 'ubuntumono', label: 'Ubuntu Mono', family: '"Ubuntu Mono", monospace', category: 'monospace' },

    // Display/Decorative
    { value: 'comicsans', label: 'Comic Sans', family: '"Comic Sans MS", cursive', category: 'display' },
    { value: 'impact', label: 'Impact', family: 'Impact, fantasy', category: 'display' },
    { value: 'pacifico', label: 'Pacifico', family: 'Pacifico, cursive', category: 'display' },
    { value: 'dancingscript', label: 'Dancing Script', family: '"Dancing Script", cursive', category: 'display' },
    { value: 'lobster', label: 'Lobster', family: 'Lobster, cursive', category: 'display' },
] as const;

/**
 * Font Size Presets
 * Standard pixel sizes like Word/Google Docs
 */
export const FONT_SIZES = [
    { value: 'default', label: 'Default', size: 'inherit', category: 'default' },
    { value: '8px', label: '8', size: '8px', category: 'size' },
    { value: '9px', label: '9', size: '9px', category: 'size' },
    { value: '10px', label: '10', size: '10px', category: 'size' },
    { value: '11px', label: '11', size: '11px', category: 'size' },
    { value: '12px', label: '12', size: '12px', category: 'size' },
    { value: '14px', label: '14', size: '14px', category: 'size' },
    { value: '16px', label: '16', size: '16px', category: 'size' },
    { value: '18px', label: '18', size: '18px', category: 'size' },
    { value: '20px', label: '20', size: '20px', category: 'size' },
    { value: '24px', label: '24', size: '24px', category: 'size' },
    { value: '28px', label: '28', size: '28px', category: 'size' },
    { value: '32px', label: '32', size: '32px', category: 'size' },
    { value: '36px', label: '36', size: '36px', category: 'size' },
    { value: '48px', label: '48', size: '48px', category: 'size' },
    { value: '72px', label: '72', size: '72px', category: 'size' },
] as const;

// Type exports
export type FontFamily = typeof FONT_FAMILIES[number];
export type FontSize = typeof FONT_SIZES[number];

// Helper to get font by value
export const getFontFamily = (value: string) =>
    FONT_FAMILIES.find(f => f.value === value);

export const getFontSize = (value: string) =>
    FONT_SIZES.find(s => s.value === value);

// Helper to group fonts by category
export const groupFontsByCategory = () => {
    const groups = new Map<string, FontFamily[]>();

    FONT_FAMILIES.forEach(font => {
        if (!groups.has(font.category)) {
            groups.set(font.category, []);
        }
        groups.get(font.category)!.push(font);
    });

    return groups;
};

// Helper to group sizes by category
export const groupSizesByCategory = () => {
    const groups = new Map<string, FontSize[]>();

    FONT_SIZES.forEach(size => {
        if (!groups.has(size.category)) {
            groups.set(size.category, []);
        }
        groups.get(size.category)!.push(size);
    });

    return groups;
};
