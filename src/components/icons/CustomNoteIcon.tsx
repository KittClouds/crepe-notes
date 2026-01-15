import * as React from 'react';

interface CustomNoteIconProps extends React.SVGProps<SVGSVGElement> {
    /** If true, uses currentColor (inheritable). If false, uses original teal colors. */
    useCurrentColor?: boolean;
}

/**
 * Custom Notebook Icon designed by the user.
 * 
 * @param useCurrentColor - When true, the icon uses `currentColor` and can inherit
 *                          colors from parent (useful for entity notes).
 *                          When false (default), uses the original teal (#378497) design.
 */
export function CustomNoteIcon({ useCurrentColor = false, ...props }: CustomNoteIconProps) {
    const mainColor = useCurrentColor ? 'currentColor' : '#378497';
    const accentColor = useCurrentColor ? 'currentColor' : '#d8b6ad';
    const lineColor = '#f6f6f6';

    return (
        <svg viewBox="0 0 640 640" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
            {/* Notebook Body */}
            <rect x="153" y="160" width="268" height="360" rx="10" fill={mainColor} />

            {/* Spiral Binding */}
            <g fill={accentColor} opacity={useCurrentColor ? 0.6 : 1}>
                <rect x="183" y="135" width="12" height="60" rx="6" />
                <rect x="223" y="135" width="12" height="60" rx="6" />
                <rect x="263" y="135" width="12" height="60" rx="6" />
                <rect x="303" y="135" width="12" height="60" rx="6" />
                <rect x="343" y="135" width="12" height="60" rx="6" />
                <rect x="383" y="135" width="12" height="60" rx="6" />
            </g>

            {/* Notebook Lines */}
            <g fill={lineColor} opacity={0.9}>
                <rect x="190" y="230" width="194" height="10" rx="5" />
                <rect x="190" y="270" width="194" height="10" rx="5" />
                <rect x="190" y="310" width="194" height="10" rx="5" />
                <rect x="190" y="350" width="194" height="10" rx="5" />
                <rect x="260" y="400" width="124" height="10" rx="5" />
                <rect x="260" y="440" width="124" height="10" rx="5" />
                <rect x="260" y="480" width="124" height="10" rx="5" />
            </g>

            {/* Page Fold */}
            <path d="M153 450 L153 510 A 10 10 0 0 0 163 520 L223 520 L223 460 A 10 10 0 0 0 213 450 Z" fill={mainColor} stroke={lineColor} strokeWidth="4" />
            <path d="M153 450 L223 520 L223 450 Z" fill={mainColor} opacity={0.3} />
            <path d="M153 520 L153 440 L233 440 L233 520" fill="none" stroke={lineColor} strokeWidth="5" />

            {/* Pencil */}
            <rect x="442" y="190" width="52" height="280" rx="4" fill={mainColor} />
            <rect x="442" y="190" width="52" height="60" rx="4" fill={mainColor} />
            <rect x="442" y="250" width="52" height="10" fill={lineColor} />
            <path d="M442 470 L468 520 L494 470 Z" fill={mainColor} />
        </svg>
    );
}

export default CustomNoteIcon;
