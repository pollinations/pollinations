import { z } from "zod";

const RATIO = /^(\d{1,5}):(\d{1,5})$/;

function gcd(a, b) {
    while (b !== 0) [a, b] = [b, a % b];
    return a;
}

function simplify(width, height) {
    const divisor = gcd(width, height);
    return { width: width / divisor, height: height / divisor };
}

function dimensionsFor(width, height, maxSide) {
    const scale = maxSide / Math.max(width, height);
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
}

export const aspectTools = [
    [
        "aspect_ratio",
        "Simplify an image or video size to its aspect ratio, scale it so the longer side is max_side, and compute integer dimensions for a target ratio. Pure arithmetic; no network.",
        {
            width: z
                .number()
                .int()
                .min(1)
                .max(100000)
                .describe("Source width in pixels"),
            height: z
                .number()
                .int()
                .min(1)
                .max(100000)
                .describe("Source height in pixels"),
            max_side: z
                .number()
                .int()
                .min(16)
                .max(100000)
                .default(1024)
                .describe("Target length of the longer side"),
            target_ratio: z
                .string()
                .regex(RATIO, "Use W:H, for example 16:9")
                .optional()
                .describe("Optional ratio to size at max_side"),
        },
        ({ width, height, max_side, target_ratio }) => {
            const simplified = simplify(width, height);
            const result = {
                ratio: `${simplified.width}:${simplified.height}`,
                decimal: Math.round((width / height) * 10000) / 10000,
                orientation:
                    width === height
                        ? "square"
                        : width > height
                          ? "landscape"
                          : "portrait",
                scaled: dimensionsFor(width, height, max_side),
            };
            if (target_ratio !== undefined) {
                const match = RATIO.exec(target_ratio);
                if (!match) {
                    throw new Error("target_ratio must look like 16:9");
                }
                const ratioWidth = Number(match[1]);
                const ratioHeight = Number(match[2]);
                if (ratioWidth === 0 || ratioHeight === 0) {
                    throw new Error(
                        "target_ratio sides must be greater than zero",
                    );
                }
                const target = simplify(ratioWidth, ratioHeight);
                result.target = {
                    ratio: `${target.width}:${target.height}`,
                    ...dimensionsFor(ratioWidth, ratioHeight, max_side),
                };
            }
            return result;
        },
    ],
];
