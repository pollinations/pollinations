// Raw color palette
export const Palette = {
    // Accent Colors
    yellow: "#ecf874", // 50 uses: Primary CTA buttons, active states, borders, accent text
    lime: "#bef264", // 11 uses: Brutalist shadows only (shadow-lime-sm/md/lg)
    pink: "#ff69b4", // 69 uses: Brand accent - borders, shadows, headings, links, model indicators
    cyan: "#74f8ec", // 4 uses: Audio model indicator only

    // Monochrome Scale
    charcoal: "#110518", // 76 uses: Primary text, button backgrounds, borders, brand dark
    charcoalMuted: "#352F3E", // UNUSED: Defined but not implemented (consider removal)
    grayDark: "#4a5557", // 36 uses: Body text exclusively (all paragraphs, descriptions)
    gray: "#6e7a7c", // 33 uses: Secondary text, borders, labels, placeholders
    grayMedium: "#BFCACC", // Large container backgrounds (SubCard, feature boxes)
    grayLight: "#c7d4d6", // 18 uses: Header button backgrounds, subtle UI elements
    grayUltraLight: "#dce4e6", // 38 uses: Inputs, disabled states, small containers
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
    // Pink shadows
    pinkSm: `2px 2px 0px 0px ${hexToRgba(Palette.pink, 1)}`,
    pink3: `3px 3px 0px 0px ${hexToRgba(Palette.pink, 1)}`,
    pinkMd: `4px 4px 0px 0px ${hexToRgba(Palette.pink, 1)}`,
    pinkLg: `6px 6px 0px 0px ${hexToRgba(Palette.pink, 1)}`,

    // Black shadows (Mapped to Charcoal)
    blackSm: `2px 2px 0px 0px ${hexToRgba(Palette.charcoal, 1)}`,
    blackMd: `4px 4px 0px 0px ${hexToRgba(Palette.charcoal, 1)}`,
    blackLg: `8px 8px 0px 0px ${hexToRgba(Palette.charcoal, 1)}`,
    blackXl: `12px 12px 0px 0px ${hexToRgba(Palette.charcoal, 1)}`,

    // Lime shadows
    limeSm: `2px 2px 0px 0px ${hexToRgba(Palette.lime, 1)}`,
    lime3: `3px 3px 0px 0px ${hexToRgba(Palette.lime, 1)}`,
    limeMd: `4px 4px 0px 0px ${hexToRgba(Palette.lime, 1)}`,

    // Charcoal with transparency
    charcoalMuted: `4px 4px 0px 0px ${hexToRgba(Palette.charcoal, 0.3)}`,
};
