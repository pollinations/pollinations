/**
 * ByteDance Seedance Pro-Fast video generation via Replicate.
 *
 * Replaces the BytePlus ARK path for seedance-pro. The `seedance` (Lite)
 * model has been retired from the registry — Replicate's
 * bytedance/seedance-1-lite endpoint is reproducibly broken (E004 incident
 * 1cah9wlWR9 at all resolutions, May 2026) and BytePlus is being deprecated.
 *
 * v1: 720p locked, matching seedance-2.0. Replicate prices 480p / 720p / 1080p
 * differently ($0.015 / $0.025 / $0.06 per sec for pro-fast); the registry
 * only carries a single per-second rate, so we ship 720p and revisit tiered
 * pricing as a follow-up rather than under-bill 1080p or over-bill 480p.
 */

import debug from "debug";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import { closestRatioLogSpace } from "../utils/aspectRatio.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import { toDataUri } from "../utils/imageDownload.ts";
import {
    ReplicateError,
    runReplicatePrediction,
} from "../utils/replicateClient.ts";

const logOps = debug("pollinations:seedance:ops");
const logError = debug("pollinations:seedance:error");

// Replicate's seedance-1-lite/pro-fast accept these aspect ratios. Validate at
// the boundary so users get 400 instead of a Replicate 422 round-trip.
const SEEDANCE_ASPECT_RATIOS = [
    "16:9",
    "4:3",
    "1:1",
    "3:4",
    "9:16",
    "21:9",
    "9:21",
] as const;
type SeedanceAspectRatio = (typeof SEEDANCE_ASPECT_RATIOS)[number];

function resolveSeedanceAspectRatio(
    safeParams: ImageParams,
): SeedanceAspectRatio {
    const requested = safeParams.aspectRatio;
    if (requested) {
        if ((SEEDANCE_ASPECT_RATIOS as readonly string[]).includes(requested)) {
            return requested as SeedanceAspectRatio;
        }
        throw new HttpError(
            `aspectRatio "${requested}" is not supported by Seedance. Supported: ${SEEDANCE_ASPECT_RATIOS.join(", ")}.`,
            400,
        );
    }
    if (safeParams.width && safeParams.height) {
        // Derive a supported ratio from width/height (documented schema
        // contract: "If not set, determined by width/height").
        return closestRatioLogSpace(
            safeParams.width,
            safeParams.height,
            SEEDANCE_ASPECT_RATIOS,
        );
    }
    return "16:9";
}

interface SeedanceInput {
    prompt: string;
    duration: number;
    resolution: "720p";
    aspect_ratio: SeedanceAspectRatio;
    fps: 24;
    camera_fixed: boolean;
    seed?: number;
    image?: string;
    last_frame_image?: string;
}

interface SeedanceModelConfig {
    /** Replicate model owner/name (no version pin — pinned by Replicate's "latest"). */
    model: string;
    /** Tracking label for usage metrics + analytics. */
    trackingLabel: string;
    /** Display name for error context. */
    displayName: string;
    /** Whether the model accepts last_frame_image. Pro-Fast does not. */
    supportsEndFrame: boolean;
    /** Default duration in seconds when the request omits it. */
    defaultDuration: number;
    /** Max duration accepted by the upstream (Replicate caps at 12). */
    maxDuration: number;
}

const SEEDANCE_PRO_FAST_CONFIG: SeedanceModelConfig = {
    model: "bytedance/seedance-1-pro-fast",
    trackingLabel: "seedance-pro",
    displayName: "Seedance Pro-Fast",
    supportsEndFrame: false,
    defaultDuration: 5,
    maxDuration: 10,
};

async function generateSeedanceVideo(
    config: SeedanceModelConfig,
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> {
    // Replicate's duration range is [2, 12]. Clamp to upstream + our config max.
    const requestedDuration = Math.floor(
        safeParams.duration ?? config.defaultDuration,
    );
    const duration = Math.max(
        2,
        Math.min(config.maxDuration, requestedDuration),
    );

    // Positional image[] contract:
    //   length=1 → first frame only (I2V)
    //   length=2 → image[0] first frame, image[1] last frame (Lite only)
    const images = safeParams.image ?? [];
    if (images.length > 2) {
        throw new HttpError(
            `${config.displayName} supports at most two images: image[0] as first frame${config.supportsEndFrame ? " and image[1] as last frame" : ""}.`,
            400,
        );
    }
    if (images.length === 2 && !config.supportsEndFrame) {
        throw new HttpError(
            `${config.displayName} does not support last_frame_image. Provide only image[0] as the first frame.`,
            400,
        );
    }

    const input: SeedanceInput = {
        prompt,
        duration,
        resolution: "720p",
        aspect_ratio: resolveSeedanceAspectRatio(safeParams),
        fps: 24,
        camera_fixed: false,
    };
    if (safeParams.seed !== undefined && safeParams.seed !== -1) {
        input.seed = safeParams.seed;
    }

    if (images.length >= 1) input.image = await toDataUri(images[0]);
    if (images.length >= 2) input.last_frame_image = await toDataUri(images[1]);

    logOps(`${config.displayName} input:`, {
        ...input,
        prompt: prompt.slice(0, 80),
        image: input.image ? "[data uri]" : undefined,
        last_frame_image: input.last_frame_image ? "[data uri]" : undefined,
    });

    let videoUrl: string;
    let actualDurationSeconds: number | undefined;
    try {
        const result = await runReplicatePrediction<SeedanceInput, string>({
            model: config.model,
            input,
        });
        videoUrl = result.output;
        actualDurationSeconds = result.videoOutputDurationSeconds;
        logOps(`${config.displayName} prediction succeeded:`, {
            id: result.id,
            predict_time: result.predictTimeSeconds,
            video_output_duration: actualDurationSeconds,
        });
    } catch (err) {
        logError(`${config.displayName} prediction call failed:`, err);
        if (err instanceof ReplicateError) {
            logError("Replicate raw error details:", {
                message: err.message,
                status: err.status,
            });
            throw new HttpError(
                `${config.displayName} generation failed: ${err.message}`,
                err.status ?? 500,
            );
        }
        throw err;
    }

    const videoResponse = await fetchUpstream(videoUrl, {
        errorLabel: `Failed to download ${config.displayName} output video`,
    });
    const buffer = Buffer.from(await videoResponse.arrayBuffer());
    logOps(
        `${config.displayName} video downloaded:`,
        (buffer.length / 1024 / 1024).toFixed(2),
        "MB",
    );

    // Bill on the actual output length Replicate reports; fall back to the
    // requested duration if the metric is missing.
    const billedDuration = actualDurationSeconds ?? duration;

    return {
        buffer,
        mimeType: "video/mp4",
        durationSeconds: billedDuration,
        trackingData: {
            actualModel: config.trackingLabel,
            usage: {
                completionVideoSeconds: billedDuration,
            },
        },
    };
}

/**
 * Seedance Pro-Fast via Replicate — T2V and I2V (first frame only).
 */
export const callSeedanceProAPI = (
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> =>
    generateSeedanceVideo(SEEDANCE_PRO_FAST_CONFIG, prompt, safeParams);
