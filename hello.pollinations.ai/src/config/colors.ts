// Color Palette - Verified Nov 2025
export const Palette = {
    // === ACCENT COLORS ===
    yellow: "#ecf874", // 50 uses - Primary CTA buttons (bg-yellow), active toggles, borders (border-yellow), text accents
    lime: "#bef264", // 6 uses - Brutalist shadows ONLY (shadow-lime-sm/md/lg on primary buttons)
    pink: "#ff69b4", // 61 uses - Brand accent: section borders (border-pink), button shadows (shadow-pink-*), headings (text-pink), image model indicators
    cyan: "#74f8ec", // 4 uses - Audio model indicator ONLY (bg-cyan on audio buttons/generate)

    // === MONOCHROME SCALE ===
    charcoal: "#110518", // 80 uses - Primary text (text-charcoal): all headings/body/labels, button backgrounds (bg-charcoal), borders
    grayDark: "#4a5557", // 27 uses - Secondary text (text-gray-dark): feature lists, helper text
    gray: "#6e7a7c", // 104 uses - Tertiary text (text-gray), borders (border-gray), placeholders
    grayMedium: "#BFCACC", // 10 uses - Large containers (bg-gray-medium): SubCards, API key cards, response boxes, dividers (border-gray-medium)
    grayLight: "#c7d4d6", // 16 uses - Button backgrounds (bg-gray-light): header icons, nav buttons (inactive)
    grayUltraLight: "#dce4e6", // 31 uses - Input backgrounds (bg-gray-ultra-light): textareas, toggle inactive, small UI containers
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
};

/**
 * COLOR USAGE BREAKDOWN (Verified Nov 2025)
 *
 * BACKGROUNDS:
 * - Pages: bg-gray-light (PageCard main background)
 * - Large Containers: bg-gray-medium (SubCard, API key cards, response boxes, prompt viewer)
 * - Small Containers: bg-gray-ultra-light (textareas, inactive toggles, input fields)
 * - Buttons: bg-charcoal (primary CTA), bg-yellow (secondary CTA, active states), bg-gray-light (header icons)
 * - Model Indicators: bg-pink (image), bg-yellow (text), bg-cyan (audio)
 *
 * TEXT:
 * - Primary: text-charcoal (all headings, body text, labels - 80 uses)
 * - Secondary: text-gray-dark (feature lists, helper text - 27 uses)
 * - Tertiary: text-gray (small text, placeholders - 104 uses)
 * - Accents: text-yellow (lime heading variant), text-pink (rose heading variant, links)
 * - Button Text: text-white (on dark backgrounds), text-charcoal (on light backgrounds)
 *
 * BORDERS:
 * - Accent: border-pink (section headings, page cards, buttons)
 * - Accent: border-yellow (primary buttons, feature lists)
 * - Neutral: border-gray (default buttons, inputs)
 * - Dividers: border-gray-medium (horizontal rules)
 *
 * SHADOWS (Brutalist):
 * - Pink: shadow-pink-sm/md/lg (page cards, buttons, hovers)
 * - Black: shadow-black-sm/md/lg/xl (used as shadow-charcoal-* in code)
 * - Lime: shadow-lime-sm/md (primary CTA buttons only)
 */
