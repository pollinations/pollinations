/**
 * ByteDance Seedance 2.0 video generation via Replicate.
 *
 * v1: 720p locked, T2V/I2V/reference modes via the existing safeParams.image
 * convention. Audio + image input are free; only resolution + reference_videos
 * are price multipliers, and we don't expose reference_videos (would trigger
 * "video_in" tier).
 */

import debug from "debug";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import {
    ReplicateError,
    runReplicatePrediction,
} from "../utils/replicateClient.ts";

const logOps = debug("pollinations:seedance2:ops");
const logError = debug("pollinations:seedance2:error");

const MODEL = "bytedance/seedance-2.0";
const TRACKING_LABEL = "seedance-2.0";

// Replicate's Seedance 2.0 accepts a narrower set than our shared aspectRatio
// enum (which also allows 9:21). Validate at the boundary so users get a clear
// 400 instead of a Replicate 422 round-trip.
const SEEDANCE_V2_ASPECT_RATIOS = [
    "16:9",
    "4:3",
    "1:1",
    "3:4",
    "9:16",
    "21:9",
    "adaptive",
] as const;
type SeedanceV2AspectRatio = (typeof SEEDANCE_V2_ASPECT_RATIOS)[number];

export function resolveSeedanceV2AspectRatio(
    requested: ImageParams["aspectRatio"] | undefined,
): SeedanceV2AspectRatio {
    if (!requested) return "16:9";
    if ((SEEDANCE_V2_ASPECT_RATIOS as readonly string[]).includes(requested)) {
        return requested as SeedanceV2AspectRatio;
    }
    throw new HttpError(
        `aspectRatio "${requested}" is not supported by Seedance 2.0. Supported: ${SEEDANCE_V2_ASPECT_RATIOS.join(", ")}.`,
        400,
    );
}

interface SeedanceV2Input {
    prompt: string;
    duration: number;
    resolution: "720p";
    aspect_ratio: SeedanceV2AspectRatio;
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

    // Seedance 2.0 requires duration in [4, 15]. The schema enforces min=1
    // so we only need to clamp into the upstream's accepted range.
    const duration = Math.max(
        4,
        Math.min(15, Math.floor(safeParams.duration ?? 5)),
    );

    // Positional image[] contract:
    //   length=1 → first-frame only (I2V)
    //   length=2 → image[0] first frame, image[1] last frame
    //   length>2 → image[0] first frame, image[1] last frame, image[2..] reference images
    const images = safeParams.image ?? [];

    const input: SeedanceV2Input = {
        prompt,
        duration,
        resolution: "720p",
        aspect_ratio: resolveSeedanceV2AspectRatio(safeParams.aspectRatio),
        generate_audio: safeParams.audio,
    };
    if (safeParams.seed !== undefined && safeParams.seed !== -1) {
        input.seed = safeParams.seed;
    }
    if (images.length >= 1) input.image = images[0];
    if (images.length >= 2) input.last_frame_image = images[1];
    if (images.length > 2) {
        input.reference_images = images.slice(2, 11); // up to 9 refs
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
    let actualDurationSeconds: number | undefined;
    try {
        const result = await runReplicatePrediction<SeedanceV2Input, string>({
            model: MODEL,
            input,
        });
        videoUrl = result.output;
        actualDurationSeconds = result.videoOutputDurationSeconds;
        logOps("Seedance 2.0 prediction succeeded:", {
            id: result.id,
            predict_time: result.predictTimeSeconds,
            video_output_duration: actualDurationSeconds,
        });
    } catch (err) {
        logError("Seedance 2.0 prediction call failed:", err);
        if (err instanceof ReplicateError) {
            logError("Replicate raw error details:", {
                message: err.message,
                status: err.status,
            });
            throw new HttpError(
                `Seedance 2.0 generation failed: ${err.message}`,
                err.status ?? 500,
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

    // Bill on the actual output length Replicate reports; fall back to the
    // requested duration if the metric is missing.
    const billedDuration = actualDurationSeconds ?? duration;

    return {
        buffer,
        mimeType: "video/mp4",
        durationSeconds: billedDuration,
        trackingData: {
            actualModel: TRACKING_LABEL,
            usage: {
                completionVideoSeconds: billedDuration,
            },
        },
    };
}
