/**
 * Color utilities for DomNavigator peer overlays
 */

export interface PeerColors {
    stroke: string;
    fill: string;
    subtle: string;
}

/**
 * Generate deterministic colors from a string (e.g., user ID)
 * Returns HSL-based colors for consistent peer identification
 */
export function colorFromString(s: string): PeerColors {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h * 31 + s.charCodeAt(i)) % 360;
    }
    return {
        stroke: `hsl(${h} 70% 45% / 0.9)`,
        fill: `hsl(${h} 70% 45% / 0.10)`,
        subtle: `hsl(${h} 70% 45% / 0.05)`,
    };
}
