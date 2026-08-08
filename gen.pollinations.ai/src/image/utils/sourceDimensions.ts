/**
 * Derive an output size from the source image of an edit request.
 *
 * When a caller omits `size` on /v1/images/edits, defaulting to a square
 * (1024x1024) reshapes portrait/landscape inputs on every edit (#12583,
 * #10944). Instead we read the source image's intrinsic dimensions and turn
 * them into a "WIDTHxHEIGHT" string that flows through the exact same code
 * path as an explicit, user-supplied `size` — so all downstream
 * provider-specific constraints (gpt-image-2 pixel/ratio caps, gpt-image-1
 * fixed-size snapping, seedream-4 custom mode) keep applying unchanged.
 *
 * Detection is strictly best-effort: any failure (unsupported format,
 * unreachable URL, malformed data URI) returns undefined and the request
 * falls back to the previous model-default behavior. Errors are never
 * surfaced to the client from here — the actual generation pipeline already
 * reports its own, properly sanitized errors when a source image is unusable.
 */

import { detectImageMimeType } from "@shared/image-mime.ts";
import {
    base64ToBuffer,
    downloadUserImage,
    readImageDimensions,
} from "./imageDownload.ts";

/** Providers accept multiples of 16 on each edge (gpt-image-2 contract). */
const DIMENSION_STEP = 16;
/** Conservative cap shared by supported providers; larger inputs are scaled down. */
const MAX_EDGE = 4096;

function snapToStep(value: number): number {
    return Math.max(
        DIMENSION_STEP,
        Math.round(value / DIMENSION_STEP) * DIMENSION_STEP,
    );
}

/**
 * Scale raw source dimensions to a provider-friendly size string:
 * long edge clamped to MAX_EDGE, both edges snapped to 16px multiples,
 * aspect ratio preserved as closely as the grid allows.
 */
export function scaleToSupportedSize(
    width: number,
    height: number,
): string | undefined {
    if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0
    ) {
        return undefined;
    }
    const longEdge = Math.max(width, height);
    const scale = longEdge > MAX_EDGE ? MAX_EDGE / longEdge : 1;
    return `${snapToStep(width * scale)}x${snapToStep(height * scale)}`;
}

async function readSourceDimensions(
    source: string,
): Promise<{ width: number; height: number } | null> {
    let bytes: Uint8Array;
    if (source.startsWith("data:")) {
        bytes = new Uint8Array(base64ToBuffer(source));
    } else {
        const { buffer } = await downloadUserImage(source);
        bytes = new Uint8Array(buffer);
    }
    // Trust the actual bytes, not any caller-declared content type.
    const mimeType = detectImageMimeType(bytes);
    if (!mimeType) return null;
    return readImageDimensions(bytes, mimeType);
}

/**
 * Best-effort: infer a "WIDTHxHEIGHT" size string from the first source
 * image of an edit request. Returns undefined when dimensions cannot be
 * determined, letting the caller fall back to model defaults.
 */
export async function inferSizeFromSourceImage(
    imageUrls: string[],
): Promise<string | undefined> {
    const source = imageUrls[0];
    if (!source) return undefined;
    try {
        const dimensions = await readSourceDimensions(source);
        if (!dimensions) return undefined;
        return scaleToSupportedSize(dimensions.width, dimensions.height);
    } catch {
        // Aspect-ratio preservation must never break an otherwise valid
        // request; fall back to the pre-existing default behavior.
        return undefined;
    }
}
