/**
 * ByteDance Seedance 2.0 family video generation via Replicate.
 *
 * The full model remains 720p locked. All three use the existing
 * safeParams.image convention for T2V/I2V/frame modes. Reference media uses
 * Replicate's native multimodal input fields and remains URL-based.
 */

import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";
import debug from "debug";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import type { ImageParams } from "../params.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import { toDataUri } from "../utils/imageDownload.ts";
import {
    runReplicatePrediction,
    toReplicateUpstreamError,
} from "../utils/replicateClient.ts";

const logOps = debug("pollinations:seedance2:ops");
const logError = debug("pollinations:seedance2:error");

const MODELS = {
    "bytedance/seedance-2.0": {
        upstream: "bytedance/seedance-2.0",
        maxDuration: 15,
    },
    "bytedance/seedance-2.0-mini": {
        upstream: "bytedance/seedance-2.0-mini",
        maxDuration: 10,
    },
    "bytedance/seedance-2.0-fast": {
        upstream: "bytedance/seedance-2.0-fast",
        maxDuration: 5,
    },
} as const;
type SeedanceV2ModelName = keyof typeof MODELS;

interface SeedanceV2Input {
    prompt: string;
    duration: number;
    resolution: "480p" | "720p";
    aspect_ratio: string;
    generate_audio: boolean;
    seed?: number;
    image?: string;
    last_frame_image?: string;
    reference_images?: string[];
    reference_videos?: string[];
    reference_audios?: string[];
}

export async function callSeedanceV2API(
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> {
    const modelName = safeParams.model as SeedanceV2ModelName;
    const config = MODELS[modelName];
    const definition = IMAGE_SERVICES[modelName] as ModelDefinition;
    const resolution = (safeParams.resolution ??
        definition.resolutions?.[0] ??
        "720p") as SeedanceV2Input["resolution"];

    // Replicate accepts 4–15 seconds. Pollinations caps Mini and Fast at their
    // empirically verified synchronous latency limits.
    const duration = Math.max(
        4,
        Math.min(config.maxDuration, Math.floor(safeParams.duration ?? 5)),
    );

    const images = safeParams.image ?? [];

    const input: SeedanceV2Input = {
        prompt,
        duration,
        resolution,
        aspect_ratio: safeParams.aspectRatio ?? "16:9",
        generate_audio: safeParams.audio ?? true,
    };
    if (safeParams.seed !== undefined) {
        input.seed = safeParams.seed;
    }
    if (images.length >= 1) input.image = await toDataUri(images[0]);
    if (images.length >= 2) input.last_frame_image = await toDataUri(images[1]);
    if (safeParams.reference_images?.length) {
        input.reference_images = safeParams.reference_images;
    }
    if (safeParams.reference_videos?.length) {
        input.reference_videos = safeParams.reference_videos;
    }
    if (safeParams.reference_audios?.length) {
        input.reference_audios = safeParams.reference_audios;
    }

    logOps(`${definition.title} input:`, {
        prompt: prompt.slice(0, 80),
        duration: input.duration,
        resolution: input.resolution,
        aspect_ratio: input.aspect_ratio,
        generate_audio: input.generate_audio,
        seed: input.seed,
        image: input.image ? "[url]" : undefined,
        last_frame_image: input.last_frame_image ? "[url]" : undefined,
        reference_images: input.reference_images?.map(() => "[url]"),
        reference_videos: input.reference_videos?.map(() => "[url]"),
        reference_audios: input.reference_audios?.map(() => "[url]"),
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
        logOps(`${definition.title} prediction succeeded:`, {
            id: result.id,
            predict_time: result.predictTimeSeconds,
            video_output_duration: actualDurationSeconds,
        });
    } catch (err) {
        logError(`${definition.title} prediction call failed:`, err);
        throw toReplicateUpstreamError(
            err,
            `${definition.title} generation failed`,
        );
    }

    const videoResponse = await fetchUpstream(videoUrl, {
        errorLabel: `Failed to download ${definition.title} output video`,
    });
    const buffer = Buffer.from(await videoResponse.arrayBuffer());
    logOps(
        `${definition.title} video downloaded:`,
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
