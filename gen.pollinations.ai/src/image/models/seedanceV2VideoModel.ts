/**
 * ByteDance Seedance 2.0 video generation via Replicate.
 *
 * Multimodal: text→video, image→video (first frame), first+last frame
 * interpolation, native synchronized audio. 1080p blocked in v1 — flat 720p+audio
 * cost rate would lose ~40% margin at 1080p.
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
const SUPPORTED_ASPECT_RATIOS = ["16:9", "9:16"] as const;

interface SeedanceV2Input {
    prompt: string;
    duration: number;
    resolution: "480p" | "720p";
    aspect_ratio: "16:9" | "9:16";
    generate_audio: boolean;
    seed?: number;
    image?: string;
    last_frame_image?: string;
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

    const { aspectRatio, resolution: resolutionUpper } =
        calculateVideoResolution({
            width: safeParams.width,
            height: safeParams.height,
            aspectRatio: safeParams.aspectRatio,
            defaultResolution: "720P",
        });
    const resolution = resolutionUpper.toLowerCase() as
        | "480p"
        | "720p"
        | "1080p";

    if (resolution === "1080p") {
        throw new HttpError(
            "1080p is not yet enabled for seedance-2 (margin protection in v1). Use 480p or 720p.",
            400,
        );
    }

    const aspectRatioFinal = SUPPORTED_ASPECT_RATIOS.includes(
        aspectRatio as (typeof SUPPORTED_ASPECT_RATIOS)[number],
    )
        ? (aspectRatio as "16:9" | "9:16")
        : "16:9";

    // Seedance 2.0 requires duration in [4, 15] or -1 (intelligent duration).
    // Clamp shorter requests up to 4s; pass -1 through; cap at 15s.
    const requestedDuration = safeParams.duration ?? 5;
    const duration =
        requestedDuration === -1
            ? -1
            : Math.max(4, Math.min(15, Math.floor(requestedDuration)));
    const generateAudio = safeParams.audio;
    const firstImage =
        safeParams.image && safeParams.image.length > 0
            ? safeParams.image[0]
            : undefined;
    const lastFrameImage = safeParams.last_frame_image;

    if (lastFrameImage && !firstImage) {
        throw new HttpError(
            "last_frame_image requires image (first frame) to also be provided",
            400,
        );
    }

    const input: SeedanceV2Input = {
        prompt,
        duration,
        resolution: resolution as "480p" | "720p",
        aspect_ratio: aspectRatioFinal,
        generate_audio: generateAudio,
    };
    if (safeParams.seed !== undefined && safeParams.seed !== -1) {
        input.seed = safeParams.seed;
    }
    if (firstImage) input.image = firstImage;
    if (lastFrameImage) input.last_frame_image = lastFrameImage;

    logOps("Seedance 2.0 input:", {
        ...input,
        prompt: prompt.slice(0, 80),
        image: input.image ? "[url]" : undefined,
        last_frame_image: input.last_frame_image ? "[url]" : undefined,
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
                completionVideoSeconds: billedDuration,
                completionAudioSeconds: generateAudio ? billedDuration : 0,
            },
        },
    };
}
