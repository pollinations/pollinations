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
import { closestByRatio, closestRatioLogSpace } from "../utils/aspectRatio.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import { toDataUri } from "../utils/imageDownload.ts";
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
const SUPPORTED_DIMENSIONS = [
    [1024, 1024],
    [1184, 896],
    [896, 1184],
    [1376, 768],
    [768, 1376],
    [1248, 832],
    [832, 1248],
].map(([width, height]) => ({ width, height, ratio: width / height }));

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
): Promise<ImageGenerationResult> {
    const dims = closestByRatio(
        safeParams.width || 1024,
        safeParams.height || 1024,
        SUPPORTED_DIMENSIONS,
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

    const buffer = await downloadOutput(output, "Pruna p-image");
    logOps("Downloaded image, buffer size:", buffer.length);

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

    const resolvedImages = await Promise.all(images.map(toDataUri));

    const input: PImageEditInput = { prompt, images: resolvedImages };
    if (safeParams.seed !== undefined) input.seed = safeParams.seed;

    logOps("p-image-edit input:", {
        prompt: prompt.slice(0, 80),
        images: `[${resolvedImages.length} data uris]`,
    });

    const { output } = await runPrunaPrediction<PImageEditInput>(
        "prunaai/p-image-edit",
        input,
        "Pruna p-image-edit",
    );

    const buffer = await downloadOutput(output, "Pruna p-image-edit");
    logOps("Downloaded edited image, buffer size:", buffer.length);

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
): Promise<VideoGenerationResult> {
    const displayName = `Pruna p-video ${resolution}`;

    const duration = Math.max(
        1,
        Math.min(10, Math.floor(safeParams.duration || 5)),
    );

    const input: PVideoInput = { prompt, resolution, duration };

    const images = safeParams.image ?? [];
    if (images.length > 0) {
        // Image-to-video: the input image drives dimensions; aspect_ratio is
        // ignored by the upstream in this mode.
        input.image = await toDataUri(images[0]);
    } else {
        // Text-to-video: pick the closest supported aspect ratio.
        input.aspect_ratio = closestRatioLogSpace(
            safeParams.width || 1024,
            safeParams.height || 1024,
            PVIDEO_ASPECT_RATIOS,
        );
    }

    if (safeParams.fps) input.fps = safeParams.fps >= 36 ? 48 : 24;
    if (safeParams.seed !== undefined) input.seed = safeParams.seed;

    logOps(`${displayName} input:`, {
        ...input,
        prompt: prompt.slice(0, 80),
        image: input.image ? "[data uri]" : undefined,
    });

    const { output, videoOutputDurationSeconds } =
        await runPrunaPrediction<PVideoInput>(
            "prunaai/p-video",
            input,
            displayName,
        );

    const buffer = await downloadOutput(output, displayName);
    logOps(
        `Video downloaded, size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`,
    );

    // Bill on the actual output length Replicate reports; fall back to the
    // requested duration if the metric is missing.
    const billedDuration = videoOutputDurationSeconds ?? duration;

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
): Promise<VideoGenerationResult> =>
    generatePrunaVideo("720p", prompt, safeParams);

/** Pruna p-video at 1080p ($0.04/s). */
export const callPrunaVideo1080API = (
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> =>
    generatePrunaVideo("1080p", prompt, safeParams);
