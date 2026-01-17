import React from 'react';
import { cn } from '@/lib/utils';

interface LogoProps {
    className?: string;
}

export const Logo: React.FC<LogoProps> = ({ className }) => {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 800 600"
            className={cn("w-full h-full", className)}
            style={{ fontFamily: 'sans-serif' }}
        >
            <defs>
                <style>
                    {`
                    /* Thinner, more transparent lines for high density */
                    .inkwell-logo-edge { stroke: #9e9e9e; stroke-width: 0.8px; stroke-opacity: 0.5; }
                    .inkwell-logo-edge-bridge { stroke: #b0bec5; stroke-width: 1px; stroke-opacity: 0.4; }
                    
                    /* Node Styles */
                    .inkwell-logo-node-teal { fill: #26C6DA; stroke: #006064; stroke-width: 1.5px; }
                    .inkwell-logo-node-grey { fill: #90A4AE; stroke: #37474F; stroke-width: 1.5px; }
                    
                    /* Hover effects */
                    .inkwell-logo-circle { transition: all 0.2s ease; }
                    .inkwell-logo-circle:hover { stroke-width: 3px; r: 12px; cursor: pointer; stroke: #000; }
                    `}
                </style>
            </defs>

            {/* EDGES LAYER */}
            <g id="edges">
                {/* CLUSTER A (Top-Left) MESH */}
                {/* Central dense web */}
                <path d="M220,180 L250,200 L280,190 L240,230 L200,220 L220,180 Z" fill="none" className="inkwell-logo-edge" />
                <line x1="250" y1="200" x2="300" y2="150" className="inkwell-logo-edge" />
                <line x1="250" y1="200" x2="280" y2="250" className="inkwell-logo-edge" />
                <line x1="250" y1="200" x2="180" y2="190" className="inkwell-logo-edge" />
                <line x1="240" y1="230" x2="280" y2="250" className="inkwell-logo-edge" />
                <line x1="240" y1="230" x2="210" y2="280" className="inkwell-logo-edge" />
                <line x1="280" y1="190" x2="330" y2="180" className="inkwell-logo-edge" />
                <line x1="280" y1="190" x2="310" y2="230" className="inkwell-logo-edge" />

                {/* Outer web Cluster A */}
                <line x1="150" y1="160" x2="220" y2="180" className="inkwell-logo-edge" />
                <line x1="150" y1="160" x2="180" y2="120" className="inkwell-logo-edge" />
                <line x1="180" y1="120" x2="250" y2="100" className="inkwell-logo-edge" />
                <line x1="250" y1="100" x2="300" y2="150" className="inkwell-logo-edge" />
                <line x1="330" y1="180" x2="380" y2="140" className="inkwell-logo-edge" />
                <line x1="380" y1="140" x2="350" y2="220" className="inkwell-logo-edge" />
                <line x1="350" y1="220" x2="310" y2="230" className="inkwell-logo-edge" />
                <line x1="310" y1="230" x2="280" y2="250" className="inkwell-logo-edge" />
                <line x1="210" y1="280" x2="160" y2="260" className="inkwell-logo-edge" />
                <line x1="160" y1="260" x2="200" y2="220" className="inkwell-logo-edge" />
                <line x1="100" y1="200" x2="150" y2="160" className="inkwell-logo-edge" />
                <line x1="100" y1="200" x2="160" y2="260" className="inkwell-logo-edge" />

                {/* Cross connections Cluster A */}
                <line x1="180" y1="120" x2="220" y2="180" className="inkwell-logo-edge" />
                <line x1="300" y1="150" x2="280" y2="190" className="inkwell-logo-edge" />
                <line x1="350" y1="220" x2="280" y2="250" className="inkwell-logo-edge" />
                <line x1="210" y1="280" x2="250" y2="200" className="inkwell-logo-edge" />
                <line x1="120" y1="140" x2="220" y2="180" className="inkwell-logo-edge" />

                {/* CLUSTER B (Bottom-Right) MESH */}
                {/* Central dense web */}
                <path d="M550,400 L580,420 L540,450 L500,430 L520,380 Z" fill="none" className="inkwell-logo-edge" />
                <line x1="550" y1="400" x2="600" y2="350" className="inkwell-logo-edge" />
                <line x1="550" y1="400" x2="480" y2="390" className="inkwell-logo-edge" />
                <line x1="580" y1="420" x2="620" y2="400" className="inkwell-logo-edge" />
                <line x1="580" y1="420" x2="600" y2="480" className="inkwell-logo-edge" />
                <line x1="540" y1="450" x2="560" y2="500" className="inkwell-logo-edge" />
                <line x1="540" y1="450" x2="480" y2="470" className="inkwell-logo-edge" />

                {/* Outer web Cluster B */}
                <line x1="600" y1="350" x2="650" y2="320" className="inkwell-logo-edge" />
                <line x1="650" y1="320" x2="680" y2="380" className="inkwell-logo-edge" />
                <line x1="680" y1="380" x2="620" y2="400" className="inkwell-logo-edge" />
                <line x1="620" y1="400" x2="670" y2="440" className="inkwell-logo-edge" />
                <line x1="670" y1="440" x2="600" y2="480" className="inkwell-logo-edge" />
                <line x1="600" y1="480" x2="630" y2="540" className="inkwell-logo-edge" />
                <line x1="630" y1="540" x2="560" y2="500" className="inkwell-logo-edge" />
                <line x1="560" y1="500" x2="510" y2="530" className="inkwell-logo-edge" />
                <line x1="510" y1="530" x2="480" y2="470" className="inkwell-logo-edge" />
                <line x1="480" y1="470" x2="440" y2="490" className="inkwell-logo-edge" />
                <line x1="440" y1="490" x2="420" y2="430" className="inkwell-logo-edge" />
                <line x1="420" y1="430" x2="450" y2="380" className="inkwell-logo-edge" />
                <line x1="450" y1="380" x2="520" y2="380" className="inkwell-logo-edge" />

                {/* Cross connections Cluster B */}
                <line x1="600" y1="350" x2="520" y2="380" className="inkwell-logo-edge" />
                <line x1="620" y1="400" x2="580" y2="360" className="inkwell-logo-edge" />
                <line x1="500" y1="430" x2="450" y2="450" className="inkwell-logo-edge" />
                <line x1="560" y1="500" x2="600" y2="480" className="inkwell-logo-edge" />
                <line x1="700" y1="350" x2="650" y2="320" className="inkwell-logo-edge" />

                {/* THE BRIDGE (Connecting the two clusters) */}
                <line x1="350" y1="220" x2="450" y2="380" className="inkwell-logo-edge-bridge" />
                <line x1="310" y1="230" x2="420" y2="430" className="inkwell-logo-edge-bridge" />
                <line x1="380" y1="140" x2="520" y2="380" className="inkwell-logo-edge-bridge" />
                <line x1="280" y1="250" x2="480" y2="390" className="inkwell-logo-edge-bridge" />
                <line x1="650" y1="320" x2="300" y2="150" className="inkwell-logo-edge-bridge" />
            </g>

            {/* NODES LAYER */}

            {/* CLUSTER A (Top Left - Predominantly Teal) */}
            <g id="cluster-a">
                {/* Center Density */}
                <circle cx="250" cy="200" r="10" className="inkwell-logo-node-teal inkwell-logo-circle" />
                <circle cx="220" cy="180" r="8" className="inkwell-logo-node-teal inkwell-logo-circle" />
                <circle cx="280" cy="190" r="8" className="inkwell-logo-node-teal inkwell-logo-circle" />
                <circle cx="240" cy="230" r="7" className="inkwell-logo-node-teal inkwell-logo-circle" />
                <circle cx="200" cy="220" r="8" className="inkwell-logo-node-teal inkwell-logo-circle" />
                <circle cx="260" cy="215" r="6" className="inkwell-logo-node-teal inkwell-logo-circle" />
                <circle cx="230" cy="195" r="6" className="inkwell-logo-node-teal inkwell-logo-circle" />
                {/* INFILTRATOR NODE (Grey inside Teal cluster) */}
                <circle cx="255" cy="185" r="7" className="inkwell-logo-node-grey inkwell-logo-circle" />

                {/* Mid Layer */}
                <circle cx="300" cy="150" r="9" className="inkwell-logo-node-teal inkwell-logo-circle" />
                <circle cx="330" cy="180" r="8" className="inkwell-logo-node-teal inkwell-logo-circle" />
                <circle cx="280" cy="250" r="9" className="inkwell-logo-node-teal inkwell-logo-circle" />
                <circle cx="210" cy="280" r="8" className="inkwell-logo-node-teal inkwell-logo-circle" />
                <circle cx="180" cy="190" r="8" className="inkwell-logo-node-teal inkwell-logo-circle" />
                <circle cx="150" cy="160" r="7" className="inkwell-logo-node-teal inkwell-logo-circle" />
                <circle cx="180" cy="120" r="8" className="inkwell-logo-node-teal inkwell-logo-circle" />
                <circle cx="310" cy="230" r="8" className="inkwell-logo-node-teal inkwell-logo-circle" />
                {/* INFILTRATOR NODE */}
                <circle cx="290" cy="210" r="8" className="inkwell-logo-node-grey inkwell-logo-circle" />

                {/* Outer Layer */}
                <circle cx="250" cy="100" r="7" className="inkwell-logo-node-teal inkwell-logo-circle" />
                <circle cx="380" cy="140" r="8" className="inkwell-logo-node-teal inkwell-logo-circle" />
                <circle cx="350" cy="220" r="8" className="inkwell-logo-node-teal inkwell-logo-circle" />
                <circle cx="160" cy="260" r="7" className="inkwell-logo-node-teal inkwell-logo-circle" />
                <circle cx="100" cy="200" r="8" className="inkwell-logo-node-teal inkwell-logo-circle" />
                <circle cx="120" cy="140" r="6" className="inkwell-logo-node-teal inkwell-logo-circle" />
                {/* INFILTRATOR NODES (Grey on the fringe of Teal) */}
                <circle cx="340" cy="190" r="7" className="inkwell-logo-node-grey inkwell-logo-circle" />
                <circle cx="190" cy="240" r="6" className="inkwell-logo-node-grey inkwell-logo-circle" />
            </g>

            {/* CLUSTER B (Bottom Right - Predominantly Grey) */}
            <g id="cluster-b">
                {/* Center Density */}
                <circle cx="550" cy="400" r="11" className="inkwell-logo-node-grey inkwell-logo-circle" />
                <circle cx="520" cy="380" r="8" className="inkwell-logo-node-grey inkwell-logo-circle" />
                <circle cx="580" cy="420" r="9" className="inkwell-logo-node-grey inkwell-logo-circle" />
                <circle cx="540" cy="450" r="8" className="inkwell-logo-node-grey inkwell-logo-circle" />
                <circle cx="500" cy="430" r="7" className="inkwell-logo-node-grey inkwell-logo-circle" />
                <circle cx="560" cy="390" r="6" className="inkwell-logo-node-grey inkwell-logo-circle" />
                {/* INFILTRATOR NODE (Teal inside Grey cluster) */}
                <circle cx="535" cy="415" r="7" className="inkwell-logo-node-teal inkwell-logo-circle" />

                {/* Mid Layer */}
                <circle cx="600" cy="350" r="8" className="inkwell-logo-node-grey inkwell-logo-circle" />
                <circle cx="620" cy="400" r="9" className="inkwell-logo-node-grey inkwell-logo-circle" />
                <circle cx="600" cy="480" r="8" className="inkwell-logo-node-grey inkwell-logo-circle" />
                <circle cx="560" cy="500" r="8" className="inkwell-logo-node-grey inkwell-logo-circle" />
                <circle cx="480" cy="470" r="7" className="inkwell-logo-node-grey inkwell-logo-circle" />
                <circle cx="480" cy="390" r="8" className="inkwell-logo-node-grey inkwell-logo-circle" />
                <circle cx="450" cy="380" r="9" className="inkwell-logo-node-grey inkwell-logo-circle" />
                <circle cx="650" cy="320" r="8" className="inkwell-logo-node-grey inkwell-logo-circle" />
                {/* INFILTRATOR NODE */}
                <circle cx="590" cy="450" r="8" className="inkwell-logo-node-teal inkwell-logo-circle" />

                {/* Outer Layer */}
                <circle cx="680" cy="380" r="7" className="inkwell-logo-node-grey inkwell-logo-circle" />
                <circle cx="670" cy="440" r="8" className="inkwell-logo-node-grey inkwell-logo-circle" />
                <circle cx="630" cy="540" r="7" className="inkwell-logo-node-grey inkwell-logo-circle" />
                <circle cx="510" cy="530" r="8" className="inkwell-logo-node-grey inkwell-logo-circle" />
                <circle cx="440" cy="490" r="8" className="inkwell-logo-node-grey inkwell-logo-circle" />
                <circle cx="420" cy="430" r="8" className="inkwell-logo-node-grey inkwell-logo-circle" />
                <circle cx="700" cy="350" r="7" className="inkwell-logo-node-grey inkwell-logo-circle" />
                {/* INFILTRATOR NODES (Teal on the fringe of Grey) */}
                <circle cx="460" cy="420" r="7" className="inkwell-logo-node-teal inkwell-logo-circle" />
                <circle cx="640" cy="370" r="6" className="inkwell-logo-node-teal inkwell-logo-circle" />
                <circle cx="530" cy="480" r="6" className="inkwell-logo-node-teal inkwell-logo-circle" />
            </g>
        </svg>
    );
};
