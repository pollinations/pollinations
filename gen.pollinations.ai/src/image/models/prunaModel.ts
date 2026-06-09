/**
 * Pruna p-image, p-image-edit, and p-video via Replicate (prunaai/*).
 *
 * Migrated off the direct api.pruna.ai predictions API to Replicate, which
 * hosts the identical Pruna-optimised models under the `prunaai` account:
 *   - p-image      → prunaai/p-image       (text-to-image)
 *   - p-image-edit → prunaai/p-image-edit  (multi-image editing, $0.01/img)
 *   - p-video      → prunaai/p-video       (text/image-to-video)
 *
 * Same engines, so output is unchanged. The move also drops the standalone
 * PRUNA_API_KEY (auth is now REPLICATE_API_TOKEN via runReplicatePrediction)
 * and inherits the shared Replicate client's reliability properties:
 *   - bounded polling → a stuck prediction surfaces as a controlled 504
 *     instead of the old 10-minute hang
 *   - error classification → 429/400/422 are passed through to the caller
 *     instead of the old blanket 500
 */

import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import { downloadUserImage } from "../utils/imageDownload.ts";
import {
    ReplicateError,
    runReplicatePrediction,
} from "../utils/replicateClient.ts";

import type { VideoGenerationResult } from "./veoVideoModel.ts";

const logOps = debug("pollinations:pruna:ops");
const logError = debug("pollinations:pruna:error");

// p-image-edit / p-video accept up to this many reference images.
const MAX_EDIT_IMAGES = 5;

// Supported dimensions for prunaai/p-image (custom aspect_ratio mode).
const SUPPORTED_DIMENSIONS: Array<[number, number]> = [
    [1024, 1024],
    [1184, 896],
    [896, 1184],
    [1376, 768],
    [768, 1376],
    [1248, 832],
    [832, 1248],
];

// prunaai/p-video aspect_ratio enum (verified against the live Replicate schema).
const PVIDEO_ASPECT_RATIOS = [
    "16:9",
    "9:16",
    "4:3",
    "3:4",
    "3:2",
    "2:3",
    "1:1",
] as const;
type PVideoAspectRatio = (typeof PVIDEO_ASPECT_RATIOS)[number];

interface PImageInput {
    prompt: string;
    aspect_ratio: "custom";
    width: number;
    height: number;
    seed?: number;
}

interface PImageEditInput {
    prompt: string;
    images: string[];
    seed?: number;
}

interface PVideoInput {
    prompt: string;
    resolution: "720p" | "1080p";
    duration: number;
    image?: string;
    aspect_ratio?: PVideoAspectRatio;
    fps?: 24 | 48;
    seed?: number;
}

/**
 * Find the closest supported dimension pair for prunaai/p-image by aspect ratio.
 */
function findClosestDimensions(
    width: number,
    height: number,
): { width: number; height: number } {
    const targetRatio = width / height;
    let bestMatch = SUPPORTED_DIMENSIONS[0];
    let bestDiff = Infinity;

    for (const [w, h] of SUPPORTED_DIMENSIONS) {
        const ratio = w / h;
        const diff = Math.abs(ratio - targetRatio);
        if (diff < bestDiff) {
            bestDiff = diff;
            bestMatch = [w, h];
        }
    }

    return { width: bestMatch[0], height: bestMatch[1] };
}

/**
 * Map requested dimensions to the closest supported p-video aspect ratio by
 * minimum distance in log space (1920×1080 → 16:9, 720×1280 → 9:16, …).
 */
function deriveVideoAspectRatio(
    width: number,
    height: number,
): PVideoAspectRatio {
    const target = Math.log(width / height);
    let best: PVideoAspectRatio = "16:9";
    let bestDist = Number.POSITIVE_INFINITY;
    for (const ar of PVIDEO_ASPECT_RATIOS) {
        const [w, h] = ar.split(":").map(Number);
        const dist = Math.abs(Math.log(w / h) - target);
        if (dist < bestDist) {
            bestDist = dist;
            best = ar;
        }
    }
    return best;
}

/**
 * Download a user-supplied image and return it as a data URI. Replicate's
 * server-side URL fetcher chokes on query strings and missing extensions, so
 * we fetch here and inline the bytes (matches seedream/seedance handlers).
 */
async function toDataUri(url: string): Promise<string> {
    const { buffer, mimeType } = await downloadUserImage(url);
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

/**
 * Run a prunaai/* prediction on Replicate and return the output URL plus
 * metrics. The output schema for all three models is a single URI string.
 * ReplicateError (already status-classified) is remapped to HttpError so the
 * caller surfaces the right code (429/400/422/502) instead of a blanket 500.
 */
async function runPrunaPrediction<TInput>(
    model: string,
    input: TInput,
    displayName: string,
): Promise<{ output: string; videoOutputDurationSeconds?: number }> {
    try {
        const result = await runReplicatePrediction<TInput, string>({
            model,
            input,
        });
        logOps(`${displayName} prediction succeeded:`, {
            id: result.id,
            predict_time: result.predictTimeSeconds,
        });
        if (typeof result.output !== "string" || result.output.length === 0) {
            throw new HttpError(`${displayName} returned no output`, 500);
        }
        return {
            output: result.output,
            videoOutputDurationSeconds: result.videoOutputDurationSeconds,
        };
    } catch (err) {
        logError(`${displayName} prediction failed:`, err);
        if (err instanceof HttpError) throw err;
        if (err instanceof ReplicateError) {
            throw new HttpError(
                `${displayName} generation failed: ${err.message}`,
                err.status ?? 500,
            );
        }
        throw err;
    }
}

/** Download a Replicate output URL to a Buffer. */
async function downloadOutput(
    url: string,
    displayName: string,
): Promise<Buffer> {
    const response = await fetchUpstream(url, {
        errorLabel: `Failed to download ${displayName} output`,
    });
    return Buffer.from(await response.arrayBuffer());
}

// =============================================================================
// p-image: Text-to-Image
// =============================================================================

export async function callPrunaImageAPI(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<ImageGenerationResult> {
    progress.updateBar(
        requestId,
        35,
        "Processing",
        "Generating with Pruna p-image...",
    );

    const dims = findClosestDimensions(
        safeParams.width || 1024,
        safeParams.height || 1024,
    );

    const input: PImageInput = {
        prompt,
        aspect_ratio: "custom",
        width: dims.width,
        height: dims.height,
    };
    if (safeParams.seed !== undefined) input.seed = safeParams.seed;

    logOps("p-image input:", { ...input, prompt: prompt.slice(0, 80) });

    const { output } = await runPrunaPrediction<PImageInput>(
        "prunaai/p-image",
        input,
        "Pruna p-image",
    );

    progress.updateBar(requestId, 90, "Processing", "Downloading image...");
    const buffer = await downloadOutput(output, "Pruna p-image");
    logOps("Downloaded image, buffer size:", buffer.length);

    progress.updateBar(requestId, 95, "Success", "Pruna p-image completed");

    return {
        buffer,
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel: "p-image",
            usage: {
                completionImageTokens: 1,
                totalTokenCount: 1,
            },
        },
    };
}

// =============================================================================
// p-image-edit: Image-to-Image Editing
// =============================================================================

export async function callPrunaImageEditAPI(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<ImageGenerationResult> {
    // p-image-edit is an image-to-image model: at least one input image is
    // required. Validate at the boundary so a missing image is a clean 400
    // instead of a wasted prediction the upstream rejects ("No images
    // provided") and we'd report as a 500.
    const images = safeParams.image ?? [];
    if (images.length === 0) {
        throw new HttpError(
            "p-image-edit requires at least one input image. Provide one via the image parameter.",
            400,
        );
    }
    if (images.length > MAX_EDIT_IMAGES) {
        throw new HttpError(
            `p-image-edit supports at most ${MAX_EDIT_IMAGES} input images (received ${images.length}).`,
            400,
        );
    }

    progress.updateBar(
        requestId,
        30,
        "Processing",
        "Preparing image for editing...",
    );

    const resolvedImages = await Promise.all(images.map(toDataUri));

    progress.updateBar(
        requestId,
        45,
        "Processing",
        `Processed ${resolvedImages.length} image(s)`,
    );

    const input: PImageEditInput = { prompt, images: resolvedImages };
    if (safeParams.seed !== undefined) input.seed = safeParams.seed;

    logOps("p-image-edit input:", {
        prompt: prompt.slice(0, 80),
        images: `[${resolvedImages.length} data uris]`,
    });

    progress.updateBar(
        requestId,
        55,
        "Processing",
        "Generating with Pruna p-image-edit...",
    );

    const { output } = await runPrunaPrediction<PImageEditInput>(
        "prunaai/p-image-edit",
        input,
        "Pruna p-image-edit",
    );

    progress.updateBar(requestId, 90, "Processing", "Downloading image...");
    const buffer = await downloadOutput(output, "Pruna p-image-edit");
    logOps("Downloaded edited image, buffer size:", buffer.length);

    progress.updateBar(
        requestId,
        95,
        "Success",
        "Pruna p-image-edit completed",
    );

    return {
        buffer,
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel: "p-image-edit",
            usage: {
                completionImageTokens: 1,
                totalTokenCount: 1,
            },
        },
    };
}

// =============================================================================
// p-video: Text/Image-to-Video
// =============================================================================

// prunaai/p-video is one Replicate model priced per second by resolution
// (720p $0.02/s, 1080p $0.04/s). The registry carries one flat rate per model,
// so each tier is its own model (p-video-720p / p-video-1080p) and the
// resolution is locked here rather than inferred from the requested height —
// this keeps recorded cost exact and lets the user opt into the 1080p rate
// explicitly by model name.
async function generatePrunaVideo(
    resolution: "720p" | "1080p",
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<VideoGenerationResult> {
    const displayName = `Pruna p-video ${resolution}`;

    progress.updateBar(
        requestId,
        35,
        "Processing",
        `Starting video generation with ${displayName}...`,
    );

    const duration = Math.max(
        1,
        Math.min(10, Math.floor(safeParams.duration || 5)),
    );

    const input: PVideoInput = { prompt, resolution, duration };

    const images = safeParams.image ?? [];
    if (images.length > 0) {
        // Image-to-video: the input image drives dimensions; aspect_ratio is
        // ignored by the upstream in this mode.
        progress.updateBar(
            requestId,
            30,
            "Processing",
            "Preparing reference image...",
        );
        input.image = await toDataUri(images[0]);
    } else {
        // Text-to-video: pick the closest supported aspect ratio.
        input.aspect_ratio = deriveVideoAspectRatio(
            safeParams.width || 1024,
            safeParams.height || 1024,
        );
    }

    if (safeParams.fps) input.fps = safeParams.fps >= 36 ? 48 : 24;
    if (safeParams.seed !== undefined) input.seed = safeParams.seed;

    logOps(`${displayName} input:`, {
        ...input,
        prompt: prompt.slice(0, 80),
        image: input.image ? "[data uri]" : undefined,
    });

    progress.updateBar(
        requestId,
        45,
        "Processing",
        "Submitting to Replicate (this may take 1-3 minutes)...",
    );

    const { output, videoOutputDurationSeconds } =
        await runPrunaPrediction<PVideoInput>(
            "prunaai/p-video",
            input,
            displayName,
        );

    progress.updateBar(requestId, 90, "Processing", "Downloading video...");
    const buffer = await downloadOutput(output, displayName);
    logOps(
        `Video downloaded, size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`,
    );

    // Bill on the actual output length Replicate reports; fall back to the
    // requested duration if the metric is missing.
    const billedDuration = videoOutputDurationSeconds ?? duration;

    progress.updateBar(requestId, 95, "Success", `${displayName} completed`);

    return {
        buffer,
        mimeType: "video/mp4",
        durationSeconds: billedDuration,
        trackingData: {
            actualModel: `p-video-${resolution}`,
            usage: {
                completionVideoSeconds: billedDuration,
            },
        },
    };
}

/** Pruna p-video at 720p ($0.02/s). */
export const callPrunaVideo720API = (
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<VideoGenerationResult> =>
    generatePrunaVideo("720p", prompt, safeParams, progress, requestId);

/** Pruna p-video at 1080p ($0.04/s). */
export const callPrunaVideo1080API = (
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<VideoGenerationResult> =>
    generatePrunaVideo("1080p", prompt, safeParams, progress, requestId);
