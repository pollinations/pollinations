/**
 * Video resolution calculation utility
 *
 * Standardizes dimension handling across video models:
 * - If width/height provided: calculates closest aspect ratio and resolution tier
 * - If only aspectRatio provided: uses default resolution
 *
 * This allows users to specify either:
 * - Exact dimensions (width/height) → we find best match
 * - Aspect ratio preset (16:9, 9:16) → we use reasonable defaults
 */

import debug from "debug";

const log = debug("pollinations:video:resolution");

export interface VideoResolutionInput {
    width?: number;
    height?: number;
    aspectRatio?: "16:9" | "9:16";
    defaultResolution?: "480P" | "720P" | "1080P";
}

export interface VideoResolutionOutput {
    aspectRatio: "16:9" | "9:16";
    resolution: "480P" | "720P" | "1080P";
}

// Resolution tier breakpoints based on total pixel count
const RESOLUTION_TIERS = [
    { label: "480P" as const, pixels: 640 * 480 }, // 307,200
    { label: "720P" as const, pixels: 1280 * 720 }, // 921,600
    { label: "1080P" as const, pixels: 1920 * 1080 }, // 2,073,600
];

/**
 * Calculate the best aspect ratio and resolution for video generation
 *
 * Logic:
 * 1. If width/height provided:
 *    - Calculate aspect ratio (wide vs tall)
 *    - Map to closest supported (16:9 or 9:16)
 *    - Determine resolution tier from total pixels
 * 2. If only aspectRatio provided:
 *    - Use provided aspectRatio
 *    - Use default resolution (typically 720P)
 *
 * @example
 * // From dimensions
 * calculateVideoResolution({ width: 1920, height: 1080 })
 * // → { aspectRatio: "16:9", resolution: "1080P" }
 *
 * @example
 * // From aspect ratio
 * calculateVideoResolution({ aspectRatio: "9:16" })
 * // → { aspectRatio: "9:16", resolution: "720P" }
 */
export function calculateVideoResolution(
    input: VideoResolutionInput,
): VideoResolutionOutput {
    const defaultRes = input.defaultResolution || "720P";

    // Case 1: Width and height provided - calculate everything
    if (input.width && input.height) {
        const totalPixels = input.width * input.height;
        const ratio = input.width / input.height;

        // Determine aspect ratio (16:9 = 1.778, 9:16 = 0.5625)
        // Threshold at 1.0 (square) - wider than square → 16:9, taller → 9:16
        const aspectRatio = ratio > 1.0 ? "16:9" : "9:16";

        // Determine resolution tier from pixel count
        let resolution = RESOLUTION_TIERS[0].label; // Default to lowest
        for (const tier of RESOLUTION_TIERS) {
            if (totalPixels >= tier.pixels * 0.7) {
                // 0.7 threshold for fuzzy matching
                resolution = tier.label;
            }
        }

        log(
            `Calculated from ${input.width}×${input.height} (${totalPixels.toLocaleString()} px): ${aspectRatio} @ ${resolution}`,
        );

        return { aspectRatio, resolution };
    }

    // Case 2: Only aspect ratio provided - use defaults
    const aspectRatio = input.aspectRatio || "16:9";

    log(`Using aspect ratio preset: ${aspectRatio} @ ${defaultRes} (default)`);

    return { aspectRatio, resolution: defaultRes };
}

/**
 * Lowercase format for APIs that use lowercase (e.g., "720p" instead of "720P")
 */
export function resolutionToLowercase(
    resolution: "480P" | "720P" | "1080P",
): "480p" | "720p" | "1080p" {
    return resolution.toLowerCase() as "480p" | "720p" | "1080p";
}
