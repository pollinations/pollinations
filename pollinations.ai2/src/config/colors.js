// Color system from original pollinations.ai
export const Colors = {
    lime: "#ecf874",
    limeShadow: "rgb(190, 242, 100)", // Original lime used in shadows (different from main lime)
    rose: "#ff69b4",
    offwhite: "#c7d4d6",
    offblack: "#110518",
    offblack2: "#181A2C",
    black: "#000000",
    gray1: "#B3B3B3",
    gray2: "#8A8A8A",
    special: "rgb(191, 64, 64)",
};

export const Fonts = {
    title: "Maven Pro",
    headline: "Mako",
    body: "Duru Sans",
};

// Helper function to convert hex/rgb to rgba
function hexToRgba(color, alpha = 1) {
    // Handle rgb() format
    if (color.startsWith("rgb(")) {
        const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
            return `rgba(${match[1]},${match[2]},${match[3]},${alpha})`;
        }
    }
    // Handle hex format
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

// Brutalist shadow utilities
export const Shadows = {
    // Rose/pink shadows
    roseSm: `2px 2px 0px 0px ${hexToRgba(Colors.rose, 1)}`,
    roseMd: `4px 4px 0px 0px ${hexToRgba(Colors.rose, 1)}`,
    roseLg: `6px 6px 0px 0px ${hexToRgba(Colors.rose, 1)}`,

    // Black shadows
    blackSm: `2px 2px 0px 0px ${hexToRgba(Colors.black, 1)}`,
    blackMd: `4px 4px 0px 0px ${hexToRgba(Colors.black, 1)}`,
    blackLg: `8px 8px 0px 0px ${hexToRgba(Colors.black, 1)}`,

    // Lime shadows (using original shadow lime color)
    limeSm: `2px 2px 0px 0px ${hexToRgba(Colors.limeShadow, 1)}`,
    limeMd: `4px 4px 0px 0px ${hexToRgba(Colors.limeShadow, 1)}`,

    // Offblack with transparency
    offblackMuted: `4px 4px 0px 0px ${hexToRgba(Colors.offblack, 0.3)}`,
};
