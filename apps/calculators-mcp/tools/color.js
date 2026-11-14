import { z } from "zod";

// Exact color conversion, computed locally — no network or model calls.
// A color is carried as integer sRGB channels and converted with the
// standard formulas, so a conversion is exact for colors whose values are
// representable in the target format; HSL/HSV values are rounded to two
// decimals.
const hexPattern = /^#(?:[\da-f]{3}|[\da-f]{6})$/i;
const rgbPattern = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i;
const hslPattern =
    /^hsl\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*\)$/i;
const hsvPattern =
    /^hsv\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*\)$/i;

function round2(value) {
    return Math.round(value * 100) / 100;
}

function parseHex(value) {
    const digits = value.slice(1);
    const full =
        digits.length === 3
            ? [...digits].map((d) => d.repeat(2)).join("")
            : digits;
    return [
        Number.parseInt(full.slice(0, 2), 16),
        Number.parseInt(full.slice(2, 4), 16),
        Number.parseInt(full.slice(4, 6), 16),
    ];
}

function parseRgb(value) {
    const match = rgbPattern.exec(value);
    if (match === null) return null;
    const channels = match.slice(1).map(Number);
    return channels.every((c) => c <= 255) ? channels : null;
}

function parseHslOrHsv(value, pattern) {
    const match = pattern.exec(value);
    if (match === null) return null;
    const [h, s, l] = match.slice(1).map(Number);
    return h <= 360 && s <= 100 && l <= 100 ? [h, s, l] : null;
}

function parseColor(value) {
    const input = value.trim();
    if (hexPattern.test(input)) return parseHex(input);
    const rgb = parseRgb(input);
    if (rgb !== null) return rgb;
    const hsl = parseHslOrHsv(input, hslPattern);
    if (hsl !== null) return hslToRgb(hsl[0], hsl[1], hsl[2]);
    const hsv = parseHslOrHsv(input, hsvPattern);
    if (hsv !== null) return hsvToRgb(hsv[0], hsv[1], hsv[2]);
    throw new Error(
        `Not a color: ${JSON.stringify(value)} — expected #RGB, #RRGGBB, rgb(r, g, b), hsl(h, s%, l%) or hsv(h, s%, v%).`,
    );
}

function rgbToHex([r, g, b]) {
    return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function hue(r, g, b, max, delta) {
    if (delta === 0) return 0;
    if (max === r) return 60 * (((g - b) / delta + (g < b ? 6 : 0)) % 6);
    if (max === g) return 60 * ((b - r) / delta + 2);
    return 60 * ((r - g) / delta + 4);
}

function rgbToHsl(r, g, b) {
    const [rn, gn, bn] = [r, g, b].map((c) => c / 255);
    const max = Math.max(rn, gn, bn),
        min = Math.min(rn, gn, bn),
        l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: round2(l * 100) };
    const delta = max - min;
    const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    return {
        h: round2(hue(rn, gn, bn, max, delta)),
        s: round2(s * 100),
        l: round2(l * 100),
    };
}

function rgbToHsv(r, g, b) {
    const [rn, gn, bn] = [r, g, b].map((c) => c / 255);
    const max = Math.max(rn, gn, bn),
        min = Math.min(rn, gn, bn),
        delta = max - min;
    return {
        h: round2(hue(rn, gn, bn, max, delta)),
        s: round2(max === 0 ? 0 : (delta / max) * 100),
        v: round2(max * 100),
    };
}

function hslToRgb(h, s, l) {
    const hn = ((h % 360) + 360) % 360,
        sn = s / 100,
        ln = l / 100;
    const c = (1 - Math.abs(2 * ln - 1)) * sn,
        x = c * (1 - Math.abs(((hn / 60) % 2) - 1)),
        m = ln - c / 2;
    const [r, g, b] =
        hn < 60
            ? [c, x, 0]
            : hn < 120
              ? [x, c, 0]
              : hn < 180
                ? [0, c, x]
                : hn < 240
                  ? [0, x, c]
                  : hn < 300
                    ? [x, 0, c]
                    : [c, 0, x];
    return [r, g, b].map((c) => Math.round((c + m) * 255));
}

function hsvToRgb(h, s, v) {
    const hn = ((h % 360) + 360) % 360,
        sn = s / 100,
        vn = v / 100;
    const c = vn * sn,
        x = c * (1 - Math.abs(((hn / 60) % 2) - 1)),
        m = vn - c;
    const [r, g, b] =
        hn < 60
            ? [c, x, 0]
            : hn < 120
              ? [x, c, 0]
              : hn < 180
                ? [0, c, x]
                : hn < 240
                  ? [0, x, c]
                  : hn < 300
                    ? [x, 0, c]
                    : [c, 0, x];
    return [r, g, b].map((c) => Math.round((c + m) * 255));
}

export const colorTools = [
    [
        "color_convert",
        "Convert a color exactly between hex, RGB, HSL and HSV, computed locally. Accepts #RGB, #RRGGBB, rgb(r, g, b), hsl(h, s%, l%) or hsv(h, s%, v%) and returns all four formats; no network or model calls.",
        {
            color: z
                .string()
                .min(1)
                .max(64)
                .describe(
                    "A color in any supported format: '#ff8000', 'rgb(255, 128, 0)', 'hsl(30, 100%, 50%)' or 'hsv(30, 100%, 100%)'.",
                ),
        },
        ({ color }) => {
            const [r, g, b] = parseColor(color);
            return {
                hex: rgbToHex([r, g, b]),
                rgb: { r, g, b },
                hsl: rgbToHsl(r, g, b),
                hsv: rgbToHsv(r, g, b),
            };
        },
    ],
];
