/**
 * Pruna image generation via DeepInfra and video generation via Replicate.
 *
 * DeepInfra hosts the exact PrunaAI/p-image and PrunaAI/p-image-Edit
 * checkpoints at the same prices as Replicate. p-video stays on Replicate and
 * uses one canonical model with request-selected resolution pricing.
 */

import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import { closestByRatio, closestRatioLogSpace } from "../utils/aspectRatio.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import { base64ToBuffer, toDataUri } from "../utils/imageDownload.ts";
import {
    runReplicatePrediction,
    toReplicateHttpError,
} from "../utils/replicateClient.ts";

import type { VideoGenerationResult } from "./veoVideoModel.ts";

const logOps = debug("pollinations:pruna:ops");
const logError = debug("pollinations:pruna:error");
const DEEPINFRA_INFERENCE_BASE = "https://api.deepinfra.com/v1/inference";
const DEEPINFRA_TIMEOUT_MS = 120_000;
const DEEPINFRA_IMAGE_MODELS = {
    "PrunaAI/p-image": "PrunaAI/p-image",
    "PrunaAI/p-image-Edit": "PrunaAI/p-image-Edit",
} as const;

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

interface DeepInfraInferenceStatus {
    cost?: number;
    runtime_ms?: number;
}

interface DeepInfraImageOutput {
    images?: string[];
    inference_status?: DeepInfraInferenceStatus;
}

async function generatePrunaImage(
    actualModel: keyof typeof DEEPINFRA_IMAGE_MODELS,
    input: PImageInput | PImageEditInput,
): Promise<ImageGenerationResult> {
    const displayName = `Pruna ${actualModel}`;
    const apiKey = getImageEnv("DEEPINFRA_API_KEY");
    if (!apiKey) {
        throw new HttpError(
            "DEEPINFRA_API_KEY environment variable is required",
            500,
        );
    }

    const url = `${DEEPINFRA_INFERENCE_BASE}/${DEEPINFRA_IMAGE_MODELS[actualModel]}`;
    const response = await fetchUpstream(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(DEEPINFRA_TIMEOUT_MS),
        errorLabel: `${displayName} generation failed`,
    });

    let result: DeepInfraImageOutput;
    try {
        result = (await response.json()) as DeepInfraImageOutput;
    } catch {
        throw new HttpError(
            `${displayName} returned invalid JSON`,
            502,
            undefined,
            url,
        );
    }
    const image = result.images?.[0];
    if (!image) throw new HttpError(`${displayName} returned no image`, 502);

    const buffer = base64ToBuffer(image);
    logOps(`Generated ${actualModel}:`, {
        bytes: buffer.length,
        providerCost: result.inference_status?.cost,
        runtimeMs: result.inference_status?.runtime_ms,
    });
    return {
        buffer,
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel,
            usage: {
                completionImageTokens: 1,
                totalTokenCount: 1,
            },
        },
    };
}

/**
 * Run a Pruna video prediction on Replicate.
 * Replicate failures are remapped to HttpError so the
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
        throw toReplicateHttpError(err, `${displayName} generation failed`);
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

    return generatePrunaImage("PrunaAI/p-image", input);
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

    const input: PImageEditInput = { prompt, images };
    if (safeParams.seed !== undefined) input.seed = safeParams.seed;

    logOps("p-image-edit input:", {
        prompt: prompt.slice(0, 80),
        images: `[${images.length} image references]`,
    });

    return generatePrunaImage("PrunaAI/p-image-Edit", input);
}

// =============================================================================
// p-video: Text/Image-to-Video
// =============================================================================

// prunaai/p-video is priced per second by resolution (720p $0.02/s, 1080p
// $0.04/s in standard mode). Resolution is explicit and never inferred from
// width/height, so provider routing and registry billing use the same fact.
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
            actualModel: "prunaai/p-video",
            usage: {
                completionVideoSeconds: billedDuration,
            },
        },
    };
}

/** Pruna p-video; request resolution defaults to the 720p base tier. */
export const callPrunaVideoAPI = (
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> =>
    generatePrunaVideo(
        safeParams.resolution === "1080p" ? "1080p" : "720p",
        prompt,
        safeParams,
    );
