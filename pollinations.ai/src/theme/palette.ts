// ╔══════════════════════════════════════════════════════════════════╗
// ║                   POLLINATIONS DESIGN PALETTE                    ║
// ║                                                                  ║
// ║  Every unique color in the product. No duplicates.               ║
// ║  Change a value here and it changes everywhere.                  ║
// ║                                                                  ║
// ║  PALETTE = the actual hex colors (21 total)                      ║
// ║  CSS_VARIABLES = 1:1 mapping to CSS custom properties            ║
// ╚══════════════════════════════════════════════════════════════════╝

export const PALETTE = {
    // ─────────────────────────────────────────────
    // NEUTRALS — from darkest to lightest
    // ─────────────────────────────────────────────
    dark: "#110518", // text, borders, buttons, shadows
    muted: "#4a3f5c", // secondary text, active overlays
    subtle: "#6b5f80", // tertiary text, captions, placeholders
    white: "#ffffff", // inverse text, input backgrounds
    cream: "#F3EBDE", // page background, faint borders
    tan: "#e8e2d8", // card backgrounds, disabled buttons, light borders
    border: "#cfc8b8", // standard borders, dividers, inputs

    // ─────────────────────────────────────────────
    // FOUR BRAND COLORS — light (pastel) + strong (saturated)
    //
    //   primary   = lavender   (currently: image indicator)
    //   secondary = periwinkle (currently: text indicator)
    //   tertiary  = mint       (currently: audio indicator)
    //   accent    = lime       (currently: video indicator + CTAs)
    // ─────────────────────────────────────────────
    primaryLight: "#E9D9EF", // lavender pastel
    primaryStrong: "#C9A9E4", // lavender saturated
    secondaryLight: "#D8DFF8", // periwinkle pastel
    secondaryStrong: "#A4B4DE", // periwinkle saturated
    tertiaryLight: "#D4F0D7", // mint pastel
    tertiaryStrong: "#A8E6A2", // mint saturated
    accentStrong: "#E8F372", // lime saturated
    accentLight: "#F5FABC", // lime pastel

    // ─────────────────────────────────────────────
    // TIER COLORS — used exclusively for tiers
    // ─────────────────────────────────────────────
    seed: "#dcfce7", // green
    seedAccent: "#4ade80", // green accent
    flower: "#fce7f3", // pink
    flowerAccent: "#f472b6", // pink accent
    nectar: "#fef3c7", // amber
    nectarAccent: "#fbbf24", // amber accent
} as const;

// Hex → RGB triplet for Tailwind opacity support
// e.g. "#110518" → "17 5 24" so Tailwind can do rgb(17 5 24 / 0.5)
const rgb = (hex: string) => {
    const h = hex.replace("#", "");
    return `${Number.parseInt(h.slice(0, 2), 16)} ${Number.parseInt(h.slice(2, 4), 16)} ${Number.parseInt(h.slice(4, 6), 16)}`;
};

// One CSS variable per palette color. That's it.
export const CSS_VARIABLES: Record<string, string> = Object.fromEntries(
    Object.entries(PALETTE).map(([key, hex]) => [
        `--${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`,
        rgb(hex),
    ]),
);
