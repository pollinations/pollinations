/**
 * The six chrome themes exposed by the CSS-var cascade. Apply via
 * `data-theme="<name>"` on any ancestor — primitives and `--polli-*`
 * tokens in that subtree restyle accordingly.
 */
export const themes = [
    "amber",
    "blue",
    "pink",
    "teal",
    "violet",
    "green",
] as const;

export type ThemeName = (typeof themes)[number];

/**
 * Representative brand color per theme — the pale `--polli-color-bg-pale`
 * token expressed as hex — for non-CSS consumers (build tools that tint the
 * logo, `theme-color` meta, manifests). Only verified values are listed;
 * extend as more themes are adopted by apps.
 */
export const themeColors: Partial<Record<ThemeName, string>> = {
    amber: "#FEF3C7",
};
