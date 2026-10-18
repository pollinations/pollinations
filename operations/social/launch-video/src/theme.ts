import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Dark-theme values of the website's `--polli-*` tokens (packages/ui).
export const C = {
    bg: "oklch(0.145 0.004 80)",
    block: "oklch(0.205 0.005 80)",
    surface: "oklch(0.255 0.006 80)",
    menu: "oklch(0.3 0.006 80)",
    divider: "oklch(0.35 0.005 80)",
    text: "oklch(0.93 0.004 80)",
    base: "oklch(0.85 0.007 80)",
    muted: "oklch(0.72 0.008 80)",
    accent: "#ffd76d",
    accentText: "oklch(0.83 0.135 85)",
    live: "oklch(0.68 0.18 140)",
    brandDark: "#110518",
};

export const F = {
    display: "LCT Mogi",
    serif: "Fraunces",
    body: "Uncut Sans",
    pixel: "Geist Pixel Square",
};

// Modality hues from --polli-color-modality-*.
export const hue = (h: number) => ({
    bg: `oklch(0.27 0.035 ${h})`,
    edge: `oklch(0.36 0.05 ${h})`,
    num: `oklch(0.82 0.11 ${h})`,
    label: `oklch(0.86 0.07 ${h})`,
});

for (const [family, file, weight] of [
    [F.display, "lct-mogi-a.woff2", "400"],
    [F.serif, "fraunces-soft-bold.woff2", "500"],
    [F.body, "uncut-sans-variable.woff2", "300 700"],
    [F.pixel, "geist-pixel-square.woff2", "400"],
] as const) {
    loadFont({ family, url: staticFile(`fonts/${file}`), weight });
}
