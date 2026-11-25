import { z } from "zod";

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i;
const HSL =
    /^hsl\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*\)$/i;

function hslToRgb(hue, saturation, lightness) {
    const h = ((hue % 360) + 360) % 360;
    const s = saturation / 100;
    const l = lightness / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let channels;
    if (h < 60) channels = [c, x, 0];
    else if (h < 120) channels = [x, c, 0];
    else if (h < 180) channels = [0, c, x];
    else if (h < 240) channels = [0, x, c];
    else if (h < 300) channels = [x, 0, c];
    else channels = [c, 0, x];
    return {
        r: Math.round((channels[0] + m) * 255),
        g: Math.round((channels[1] + m) * 255),
        b: Math.round((channels[2] + m) * 255),
    };
}

function rgbToHsl(r, g, b) {
    const red = r / 255;
    const green = g / 255;
    const blue = b / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const lightness = (max + min) / 2;
    const delta = max - min;
    let hue = 0;
    let saturation = 0;
    if (delta !== 0) {
        saturation = delta / (1 - Math.abs(2 * lightness - 1));
        if (max === red) hue = 60 * (((green - blue) / delta) % 6);
        else if (max === green) hue = 60 * ((blue - red) / delta + 2);
        else hue = 60 * ((red - green) / delta + 4);
    }
    if (hue < 0) hue += 360;
    return {
        h: Math.round(hue),
        s: Math.round(saturation * 100),
        l: Math.round(lightness * 100),
    };
}

function relativeLuminance(r, g, b) {
    const linear = (channel) => {
        const value = channel / 255;
        return value <= 0.04045
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function parseColor(value) {
    const input = value.trim();
    const hex = HEX.exec(input);
    if (hex) {
        const digits =
            hex[1].length === 3
                ? [...hex[1]].map((digit) => digit + digit).join("")
                : hex[1];
        return {
            r: Number.parseInt(digits.slice(0, 2), 16),
            g: Number.parseInt(digits.slice(2, 4), 16),
            b: Number.parseInt(digits.slice(4, 6), 16),
        };
    }
    const rgb = RGB.exec(input);
    if (rgb) {
        const [r, g, b] = rgb.slice(1).map(Number);
        if ([r, g, b].some((channel) => channel > 255)) {
            throw new Error("RGB channels must be between 0 and 255");
        }
        return { r, g, b };
    }
    const hsl = HSL.exec(input);
    if (hsl) {
        const [h, s, l] = hsl.slice(1).map(Number);
        if (s > 100 || l > 100) {
            throw new Error(
                "HSL saturation and lightness must be between 0 and 100%",
            );
        }
        return hslToRgb(h, s, l);
    }
    throw new Error("color must be #RGB, #RRGGBB, rgb(r,g,b) or hsl(h,s%,l%)");
}

export const colorTools = [
    [
        "convert_color",
        "Convert a CSS color between hex, RGB and HSL, with relative luminance. Accepts #RGB, #RRGGBB, rgb(r,g,b) and hsl(h,s%,l%). Local arithmetic; no network.",
        {
            color: z
                .string()
                .min(4)
                .max(40)
                .describe(
                    "CSS color: #RGB, #RRGGBB, rgb(r,g,b) or hsl(h,s%,l%)",
                ),
        },
        ({ color }) => {
            const { r, g, b } = parseColor(color);
            const hex = `#${[r, g, b]
                .map((channel) => channel.toString(16).padStart(2, "0"))
                .join("")}`;
            return {
                input: color.trim(),
                hex,
                rgb: { r, g, b },
                hsl: rgbToHsl(r, g, b),
                luminance:
                    Math.round(relativeLuminance(r, g, b) * 10000) / 10000,
            };
        },
    ],
];
