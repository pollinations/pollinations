/**
 * ByteDance Seedance 2.0 family video generation via Replicate.
 *
 * The full model remains 720p locked. All three use the existing
 * safeParams.image convention for T2V/I2V/reference modes. We don't expose
 * reference_videos, which would trigger Replicate's "video_in" price tier.
 */

import debug from "debug";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import { toDataUri } from "../utils/imageDownload.ts";
import {
    ReplicateError,
    runReplicatePrediction,
    toReplicateHttpError,
} from "../utils/replicateClient.ts";

const logOps = debug("pollinations:seedance2:ops");
const logError = debug("pollinations:seedance2:error");

const MODELS = {
    "seedance-2.0": {
        upstream: "bytedance/seedance-2.0",
        title: "Seedance 2.0",
        resolutions: ["720p"],
        defaultResolution: "720p",
        maxDuration: 15,
    },
    "seedance-2.0-mini": {
        upstream: "bytedance/seedance-2.0-mini",
        title: "Seedance 2.0 Mini",
        resolutions: ["480p", "720p"],
        defaultResolution: "720p",
        maxDuration: 10,
    },
    "seedance-2.0-fast": {
        upstream: "bytedance/seedance-2.0-fast",
        title: "Seedance 2.0 Fast",
        resolutions: ["480p"],
        defaultResolution: "480p",
        maxDuration: 5,
    },
} as const;
type SeedanceV2ModelName = keyof typeof MODELS;

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
    resolution: "480p" | "720p";
    aspect_ratio: SeedanceV2AspectRatio;
    generate_audio: boolean;
    seed?: number;
    image?: string;
    last_frame_image?: string;
}

export async function callSeedanceV2API(
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> {
    const modelName = safeParams.model as SeedanceV2ModelName;
    const config = MODELS[modelName];
    const requestedResolution =
        safeParams.resolution ?? config.defaultResolution;
    if (
        !(config.resolutions as readonly string[]).includes(requestedResolution)
    ) {
        throw new HttpError(
            `${config.title} supports ${config.resolutions.join(" or ")} resolution`,
            400,
        );
    }
    const resolution = requestedResolution as SeedanceV2Input["resolution"];

    // Seedance 2.0 requires duration in [4, 15]. The schema enforces min=1
    // so we only need to clamp into the upstream's accepted range.
    const duration = Math.max(
        4,
        Math.min(config.maxDuration, Math.floor(safeParams.duration ?? 5)),
    );

    // Positional image[] contract:
    //   length=1 → first-frame only (I2V)
    //   length=2 → image[0] first frame, image[1] last frame
    const images = safeParams.image ?? [];
    if (images.length > 2) {
        throw new HttpError(
            `${config.title} supports at most two images: image[0] as first frame and image[1] as last frame.`,
            400,
        );
    }

    const input: SeedanceV2Input = {
        prompt,
        duration,
        resolution,
        aspect_ratio: resolveSeedanceV2AspectRatio(safeParams.aspectRatio),
        generate_audio: safeParams.audio,
    };
    if (safeParams.seed !== undefined) {
        input.seed = safeParams.seed;
    }
    if (images.length >= 1) input.image = await toDataUri(images[0]);
    if (images.length >= 2) input.last_frame_image = await toDataUri(images[1]);

    logOps(`${config.title} input:`, {
        ...input,
        prompt: prompt.slice(0, 80),
        image: input.image ? "[url]" : undefined,
        last_frame_image: input.last_frame_image ? "[url]" : undefined,
    });

    let videoUrl: string;
    let actualDurationSeconds: number | undefined;
    try {
        const result = await runReplicatePrediction<SeedanceV2Input, string>({
            model: config.upstream,
            input,
        });
        videoUrl = result.output;
        actualDurationSeconds = result.videoOutputDurationSeconds;
        logOps(`${config.title} prediction succeeded:`, {
            id: result.id,
            predict_time: result.predictTimeSeconds,
            video_output_duration: actualDurationSeconds,
        });
    } catch (err) {
        logError(`${config.title} prediction call failed:`, err);
        if (err instanceof ReplicateError) {
            logError("Replicate raw error details:", {
                message: err.message,
                status: err.status,
            });
        }
        throw toReplicateHttpError(err, `${config.title} generation failed`);
    }

    const videoResponse = await fetchUpstream(videoUrl, {
        errorLabel: `Failed to download ${config.title} output video`,
    });
    const buffer = Buffer.from(await videoResponse.arrayBuffer());
    logOps(
        `${config.title} video downloaded:`,
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
            actualModel: modelName,
            usage: {
                completionVideoSeconds: billedDuration,
            },
        },
    };
}
