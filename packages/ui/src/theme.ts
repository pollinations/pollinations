import paletteData from "./theme-palette.json";

/**
 * The seven chrome themes exposed by the CSS-var cascade. Apply via
 * `data-theme="<name>"` on any ancestor — primitives and `--polli-*`
 * tokens in that subtree restyle accordingly.
 */
export const themes = [
    "amber",
    "blue",
    "pink",
    "coral",
    "teal",
    "violet",
    "emerald",
] as const;

export type ThemeName = (typeof themes)[number];

/**
 * Per-theme brand colors as sRGB hex, for non-CSS consumers (icon/asset
 * tooling, web manifests). `bgPale` mirrors each theme's
 * `--polli-color-bg-pale` token in `styles/tokens.css` — that CSS cascade
 * remains the source of truth for the running UI; this is the same value in
 * a form tools can read. `brandDark` is the shared splash/OG contrast color.
 */
export const themePalette: {
    bgPale: Record<ThemeName, string>;
    brandDark: string;
} = paletteData;
