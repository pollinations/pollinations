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

interface SeedanceV2Input {
    prompt: string;
    duration: number;
    resolution: "720p";
    aspect_ratio: NonNullable<ImageParams["aspectRatio"]>;
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

    // Seedance 2.0 requires duration in [4, 15] or -1 (intelligent duration).
    const requestedDuration = safeParams.duration ?? 5;
    const duration =
        requestedDuration === -1
            ? -1
            : Math.max(4, Math.min(15, Math.floor(requestedDuration)));

    const images = safeParams.image ?? [];
    const lastFrameImage = safeParams.last_frame_image;

    if (lastFrameImage && images.length === 0) {
        throw new HttpError(
            "last_frame_image requires image (first frame) to also be provided",
            400,
        );
    }
    if (lastFrameImage && images.length > 1) {
        throw new HttpError(
            "last_frame_image cannot combine with multiple images. Pass exactly one image alongside last_frame_image, or omit last_frame_image to use multiple reference images.",
            400,
        );
    }

    const input: SeedanceV2Input = {
        prompt,
        duration,
        resolution: "720p",
        aspect_ratio: safeParams.aspectRatio ?? "16:9",
        generate_audio: safeParams.audio,
    };
    if (safeParams.seed !== undefined && safeParams.seed !== -1) {
        input.seed = safeParams.seed;
    }
    if (images.length === 1) {
        input.image = images[0];
        if (lastFrameImage) input.last_frame_image = lastFrameImage;
    } else if (images.length > 1) {
        input.reference_images = images.slice(0, 9);
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
        if (err instanceof ReplicateError) {
            logError("Replicate error:", err.message);
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

    // Bill on the actual output length Replicate reports. Falls back to
    // requested duration if the metric is missing; for intelligent mode (-1),
    // the actual length is the only valid source.
    const billedDuration =
        actualDurationSeconds ?? (duration === -1 ? 5 : duration);

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
