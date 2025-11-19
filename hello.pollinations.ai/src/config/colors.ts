// Raw color palette
export const Palette = {
    lime: "#ecf874",
    limeShadow: "#bef264",
    rose: "#ff69b4",
    cyan: "#74f8ec",
    offwhite: "#c7d4d6",
    offblack: "#110518",
    black: "#000000",
    white: "#ffffff",
};

// Semantic theme tokens
export const Theme = {
    primary: Palette.lime,
    secondary: Palette.rose,
    tertiary: Palette.cyan,
    
    background: Palette.offwhite,
    surface: Palette.offwhite, // Cards, panels
    
    foreground: Palette.offblack, // Main text
    foregroundMuted: Palette.offblack, // Secondary text (opacity handled in tailwind)
    
    shadow: Palette.black,
    shadowHighlight: Palette.limeShadow,
};

// Legacy export for backwards compatibility during migration
export const Colors = Palette;

export const Fonts = {
    title: "Maven Pro",
    headline: "Mako",
    body: "Duru Sans",
};

// Helper function to convert hex to rgba
function hexToRgba(color: string, alpha = 1) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

// Brutalist shadow utilities
export const Shadows = {
    // Rose/pink shadows
    roseSm: `2px 2px 0px 0px ${hexToRgba(Palette.rose, 1)}`,
    rose3: `3px 3px 0px 0px ${hexToRgba(Palette.rose, 1)}`,
    roseMd: `4px 4px 0px 0px ${hexToRgba(Palette.rose, 1)}`,
    roseLg: `6px 6px 0px 0px ${hexToRgba(Palette.rose, 1)}`,

    // Black shadows
    blackSm: `2px 2px 0px 0px ${hexToRgba(Palette.black, 1)}`,
    blackMd: `4px 4px 0px 0px ${hexToRgba(Palette.black, 1)}`,
    blackLg: `8px 8px 0px 0px ${hexToRgba(Palette.black, 1)}`,
    blackXl: `12px 12px 0px 0px ${hexToRgba(Palette.black, 1)}`,

    // Lime shadows (using original shadow lime color)
    limeSm: `2px 2px 0px 0px ${hexToRgba(Palette.limeShadow, 1)}`,
    lime3: `3px 3px 0px 0px ${hexToRgba(Palette.limeShadow, 1)}`,
    limeMd: `4px 4px 0px 0px ${hexToRgba(Palette.limeShadow, 1)}`,

    // Offblack with transparency
    offblackMuted: `4px 4px 0px 0px ${hexToRgba(Palette.offblack, 0.3)}`,
};
