import paletteData from "./theme-palette.json";

/**
 * Per-theme brand colors as sRGB hex, for non-CSS consumers (icon/asset
 * tooling, web manifests). `bgPale` mirrors each theme's
 * `--polli-color-bg-pale` token in `styles/tokens.css` — that CSS cascade
 * remains the source of truth for the running UI; this is the same value in
 * a form tools can read. `brandDark` is the shared splash/OG contrast color.
 */
export const themePalette: {
    bgPale: Record<string, string>;
    brandDark: string;
} = paletteData;
