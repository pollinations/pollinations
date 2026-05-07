/**
 * ByteDance Seedance 2.0 video generation via Replicate.
 *
 * Multimodal: text→video, image→video (first frame), first+last frame
 * interpolation, native synchronized audio.
 *
 * v1 scope: 720p only (480p and 1080p rejected). T2V + I2V only — we don't
 * expose `reference_videos` (which would trigger Replicate's "video_in" pricing
 * tier). Resolution + reference_videos are the only Replicate price multipliers;
 * audio and image input are free. Empirically verified via
 * metrics.model_variant=non_video_in for both T2V and I2V at 720p.
 */

import debug from "debug";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import {
    ReplicateAuthError,
    ReplicateModelError,
    ReplicateRateLimitError,
    ReplicateTimeoutError,
    runReplicatePrediction,
} from "../utils/replicateClient.ts";
import { calculateVideoResolution } from "../utils/videoResolution.ts";

const logOps = debug("pollinations:seedance2:ops");
const logError = debug("pollinations:seedance2:error");

const MODEL = "bytedance/seedance-2.0";
const TRACKING_LABEL = "seedance-2";
// Seedance 2.0 supports all 8 aspect ratios. We pass safeParams.aspectRatio
// straight through (params.ts validates the enum) and default to 16:9 when
// the user doesn't specify.
type SeedanceAspectRatio =
    | "16:9"
    | "4:3"
    | "1:1"
    | "3:4"
    | "9:16"
    | "21:9"
    | "9:21"
    | "adaptive";

const MAX_REFERENCE_IMAGES = 9;

interface SeedanceV2Input {
    prompt: string;
    duration: number;
    resolution: "720p";
    aspect_ratio: SeedanceAspectRatio;
    generate_audio: boolean;
    seed?: number;
    image?: string;
    last_frame_image?: string;
    reference_images?: string[];
}

export async function callSeedanceV2API(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<VideoGenerationResult> {
    progress.updateBar(
        requestId,
        35,
        "Processing",
        "Starting Seedance 2.0 video generation...",
    );

    // Resolution is locked to 720p in v1. Reject explicit 480p / 1080p requests.
    const { resolution: resolutionUpper } = calculateVideoResolution({
        width: safeParams.width,
        height: safeParams.height,
        aspectRatio: safeParams.aspectRatio,
        defaultResolution: "720P",
    });
    const resolution = resolutionUpper.toLowerCase();
    if (resolution !== "720p") {
        throw new HttpError(
            `seedance-2 only supports 720p in v1 (got ${resolution}). Set width=1280 height=720 (or use the default).`,
            400,
        );
    }

    // Aspect ratio: pass user's choice straight through (params.ts validates
    // the enum). Default to 16:9 when not specified.
    const aspectRatioFinal: SeedanceAspectRatio =
        safeParams.aspectRatio ?? "16:9";

    // Seedance 2.0 requires duration in [4, 15] or -1 (intelligent duration).
    // Clamp shorter requests up to 4s; pass -1 through; cap at 15s.
    const requestedDuration = safeParams.duration ?? 5;
    const duration =
        requestedDuration === -1
            ? -1
            : Math.max(4, Math.min(15, Math.floor(requestedDuration)));
    const generateAudio = safeParams.audio;
    const images = safeParams.image ?? [];
    const lastFrameImage = safeParams.last_frame_image;

    // Three mutually-exclusive modes (Replicate enforces this; we mirror it):
    //   1. T2V                 — no image, no last_frame_image
    //   2. Frame mode          — 1 image (first frame), optional last_frame_image
    //   3. Reference mode      — 2+ images used as reference_images (max 9)
    // last_frame_image cannot combine with reference_images.
    if (lastFrameImage && images.length === 0) {
        throw new HttpError(
            "last_frame_image requires image (first frame) to also be provided",
            400,
        );
    }
    if (lastFrameImage && images.length > 1) {
        throw new HttpError(
            "last_frame_image (frame mode) cannot combine with multiple images (reference mode). Pass exactly one image alongside last_frame_image, or omit last_frame_image to use multiple reference images.",
            400,
        );
    }

    const input: SeedanceV2Input = {
        prompt,
        duration,
        resolution: "720p",
        aspect_ratio: aspectRatioFinal,
        generate_audio: generateAudio,
    };
    if (safeParams.seed !== undefined && safeParams.seed !== -1) {
        input.seed = safeParams.seed;
    }

    if (images.length === 1) {
        // Frame mode (single first frame, optional last frame)
        input.image = images[0];
        if (lastFrameImage) input.last_frame_image = lastFrameImage;
    } else if (images.length > 1) {
        // Reference mode (character consistency / style guidance, 2-9 images)
        input.reference_images = images.slice(0, MAX_REFERENCE_IMAGES);
    }

    logOps("Seedance 2.0 input:", {
        ...input,
        prompt: prompt.slice(0, 80),
        image: input.image ? "[url]" : undefined,
        last_frame_image: input.last_frame_image ? "[url]" : undefined,
        reference_images: input.reference_images
            ? `[${input.reference_images.length} url(s)]`
            : undefined,
    });

    progress.updateBar(
        requestId,
        45,
        "Processing",
        "Submitting to Replicate (40-90s typical)...",
    );

    let videoUrl: string;
    try {
        const result = await runReplicatePrediction<SeedanceV2Input, string>({
            model: MODEL,
            input,
        });
        videoUrl = result.output;
        logOps("Seedance 2.0 prediction succeeded:", {
            id: result.id,
            predict_time: result.predictTimeSeconds,
        });
    } catch (err) {
        if (err instanceof ReplicateAuthError) {
            logError("Replicate auth failed:", err.message);
            throw new HttpError(`Replicate authentication failed`, 500);
        }
        if (err instanceof ReplicateRateLimitError) {
            logError("Replicate rate limit:", err.message);
            throw new HttpError(`Replicate rate limit exceeded`, 429);
        }
        if (err instanceof ReplicateTimeoutError) {
            logError("Replicate timeout:", err.message);
            throw new HttpError(`Seedance 2.0 generation timed out`, 504);
        }
        if (err instanceof ReplicateModelError) {
            logError("Replicate model error:", err.message);
            throw new HttpError(
                `Seedance 2.0 generation failed: ${err.message}`,
                500,
            );
        }
        throw err;
    }

    progress.updateBar(requestId, 90, "Processing", "Downloading video...");
    const videoResponse = await fetchUpstream(videoUrl, {
        errorLabel: "Failed to download Seedance 2.0 output video",
    });
    const buffer = Buffer.from(await videoResponse.arrayBuffer());
    logOps(
        "Seedance 2.0 video downloaded:",
        (buffer.length / 1024 / 1024).toFixed(2),
        "MB",
    );

    progress.updateBar(requestId, 95, "Success", "Video generation completed");

    // For tracking, use the actual duration the model produced. When intelligent
    // duration (-1) is requested, fall back to the default to avoid emitting
    // negative seconds (true output length will skew tracking but stays positive).
    const billedDuration = duration === -1 ? 5 : duration;

    return {
        buffer,
        mimeType: "video/mp4",
        durationSeconds: billedDuration,
        trackingData: {
            actualModel: TRACKING_LABEL,
            usage: {
                // Audio is free in Replicate's pricing (verified empirically),
                // so we only emit video seconds. T2V and I2V both fall in the
                // "non_video_in" tier at 720p.
                completionVideoSeconds: billedDuration,
            },
        },
    };
}
