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
