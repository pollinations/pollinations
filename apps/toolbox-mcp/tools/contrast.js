import { z } from "zod";

// Adapted from ismailbanouigu's contrast tools (#17786).
const hex = z
    .string()
    .regex(/^#(?:[\da-f]{3}|[\da-f]{6})$/i)
    .describe("sRGB #RGB or #RRGGBB color");
function parseHex(value) {
    const digits = value.slice(1);
    return `#${(digits.length === 3 ? [...digits].map((d) => d.repeat(2)).join("") : digits).toLowerCase()}`;
}
function luminance(color) {
    const [r, g, b] = [1, 3, 5].map((i) => {
        const channel = Number.parseInt(color.slice(i, i + 2), 16) / 255;
        return channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
    const first = luminance(a),
        second = luminance(b);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
export const contrastTools = [
    [
        "check_contrast",
        "Check sRGB colors against WCAG 2.2 contrast thresholds. Thresholds use the unrounded ratio.",
        { foreground: hex, background: hex },
        ({ foreground, background }) => {
            const a = parseHex(foreground),
                b = parseHex(background),
                value = ratio(a, b);
            return {
                foreground: a,
                background: b,
                ratio: Math.round(value * 100) / 100,
                wcag_2_2: {
                    normal_text: { aa: value >= 4.5, aaa: value >= 7 },
                    large_text: { aa: value >= 3, aaa: value >= 4.5 },
                    non_text: { aa: value >= 3 },
                },
            };
        },
    ],
    [
        "rank_palette",
        "Rank sRGB foreground colors by contrast with one background.",
        {
            background: hex,
            colors: z.array(hex).min(1).max(20),
            minimum_ratio: z.number().min(1).max(21).default(4.5),
        },
        ({ background, colors, minimum_ratio }) => {
            const bg = parseHex(background);
            return {
                background: bg,
                minimum_ratio,
                colors: colors
                    .map(parseHex)
                    .map((color) => ({ color, value: ratio(color, bg) }))
                    .sort((a, b) => b.value - a.value)
                    .map(({ color, value }) => ({
                        color,
                        ratio: Math.round(value * 100) / 100,
                        passes: value >= minimum_ratio,
                    })),
            };
        },
    ],
];
