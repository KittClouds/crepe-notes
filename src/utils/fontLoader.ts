/**
 * Load Google Fonts dynamically
 */
export function loadGoogleFonts(fonts: string[]) {
    const id = 'google-fonts-loader';
    if (document.getElementById(id)) return;

    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?${fonts
        .map((font) => `family=${font.replace(' ', '+')}:wght@400;500;600;700`)
        .join('&')}&display=swap`;

    document.head.appendChild(link);
}

// Load all fonts used in presets
export function loadEditorFonts() {
    const googleFonts = [
        'Inter',
        'Roboto',
        'Open Sans',
        'Lato',
        'Montserrat',
        'Poppins',
        'Nunito',
        'Work Sans',
        'Merriweather',
        'Playfair Display',
        'Lora',
        'Crimson Text',
        'JetBrains Mono',
        'Fira Code',
        'Source Code Pro',
        'Inconsolata',
        'Ubuntu Mono',
        'Pacifico',
        'Dancing Script',
        'Lobster',
    ];

    loadGoogleFonts(googleFonts);
}
