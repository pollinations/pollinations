import { UpstreamError } from "@shared/error.ts";
import { FalError, runFalJob } from "../../model3d/models/falClient.ts";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { closestRatioLogSpace } from "../utils/aspectRatio.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import type { VideoGenerationResult } from "./veoVideoModel.ts";

const RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"] as const;
const WAN_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"] as const;
const WAN_TURBO_RATIOS = ["16:9", "9:16", "1:1"] as const;
const SEEDANCE_RATIOS = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"] as const;
const MEDIA_POLL_MAX_ATTEMPTS = 60;

type FalFile = { url?: string; content_type?: string };

function requireFalKey(): string {
    const key = getImageEnv("FAL_KEY");
    if (!key)
        throw UpstreamError.fromProvider(500, {
            message: "FAL_KEY is not configured",
        });
    return key;
}

function toUpstreamError(error: unknown, label: string): UpstreamError {
    if (error instanceof UpstreamError) return error;
    if (error instanceof FalError) {
        return UpstreamError.fromProvider(error.status ?? 502, {
            message: error.message,
            responseBody: error.responseBody,
        });
    }
    return UpstreamError.fromProvider(502, {
        message: error instanceof Error ? error.message : `${label} failed`,
    });
}

async function download(file: FalFile | undefined, label: string) {
    if (!file?.url)
        throw UpstreamError.fromProvider(502, {
            message: `${label} returned no output`,
        });
    const response = await fetchUpstream(file.url, {
        errorLabel: `Failed to download ${label} output`,
    });
    return {
        buffer: Buffer.from(await response.arrayBuffer()),
        mimeType:
            file.content_type ||
            response.headers.get("content-type") ||
            undefined,
    };
}

function aspectRatio(
    params: ImageParams,
    ratios: readonly string[] = RATIOS,
): string {
    return closestRatioLogSpace(params.width, params.height, ratios);
}

function withSeed(
    input: Record<string, unknown>,
    params: ImageParams,
): Record<string, unknown> {
    return params.seed === undefined ? input : { ...input, seed: params.seed };
}

export async function callFalFallbackImage(
    prompt: string,
    params: ImageParams,
): Promise<ImageGenerationResult> {
    if (params.model !== "seedream5-fal") {
        throw UpstreamError.fromProvider(400, {
            message: `Unsupported Fal image fallback: ${params.model}`,
        });
    }
    const editing = params.image.length > 0;
    try {
        const result = await runFalJob(
            {
                endpoint: editing
                    ? "bytedance/seedream/v5/lite/edit"
                    : "bytedance/seedream/v5/lite/text-to-image",
                input: withSeed(
                    {
                        prompt,
                        ...(editing ? { image_urls: params.image } : {}),
                        image_size: {
                            width: params.width,
                            height: params.height,
                        },
                        num_images: 1,
                    },
                    params,
                ),
                pollMaxAttempts: MEDIA_POLL_MAX_ATTEMPTS,
            },
            requireFalKey(),
        );
        const { buffer, mimeType } = await download(
            (result.images as FalFile[] | undefined)?.[0],
            "Seedream 5 Lite",
        );
        return {
            buffer,
            mimeType,
            isMature: false,
            isChild: false,
            trackingData: {
                actualModel: params.model,
                usage: {
                    ...(editing
                        ? { promptImageTokens: params.image.length }
                        : {}),
                    completionImageTokens: 1,
                },
            },
        };
    } catch (error) {
        throw toUpstreamError(error, "Seedream 5 Lite");
    }
}

function snapDuration(
    duration: number | undefined,
    allowed: readonly number[],
) {
    const requested = duration ?? allowed[0];
    return allowed.reduce((best, value) =>
        Math.abs(value - requested) < Math.abs(best - requested) ? value : best,
    );
}

type FalVideoConfig = {
    textEndpoint: string;
    imageEndpoint: string;
    duration: (params: ImageParams) => number;
    input: (
        params: ImageParams,
        duration: number,
        hasImage: boolean,
    ) => Record<string, unknown>;
};

const VIDEO_CONFIGS: Record<string, FalVideoConfig> = {
    "grok-video-pro-fal": {
        textEndpoint: "xai/grok-imagine-video/text-to-video",
        imageEndpoint: "xai/grok-imagine-video/image-to-video",
        duration: (params) =>
            Math.min(15, Math.max(1, Math.floor(params.duration ?? 5))),
        input: (params, duration) => ({
            duration,
            resolution: "720p",
            aspect_ratio: aspectRatio(params),
        }),
    },
    "grok-imagine-video-1.5-fal": {
        textEndpoint: "xai/grok-imagine-video/v1.5/text-to-video",
        imageEndpoint: "xai/grok-imagine-video/v1.5/image-to-video",
        duration: (params) =>
            Math.min(15, Math.max(1, Math.floor(params.duration ?? 5))),
        input: (params, duration, hasImage) => ({
            duration,
            resolution: params.resolution ?? "720p",
            ...(!hasImage ? { aspect_ratio: aspectRatio(params) } : {}),
        }),
    },
    "wan-fal": {
        textEndpoint: "wan/v2.6/text-to-video",
        imageEndpoint: "wan/v2.6/image-to-video",
        duration: (params) => snapDuration(params.duration, [5, 10, 15]),
        input: (params, duration, hasImage) => ({
            duration,
            resolution: "720p",
            ...(!hasImage
                ? { aspect_ratio: aspectRatio(params, WAN_RATIOS) }
                : {}),
        }),
    },
    "wan-fast-fal": {
        textEndpoint: "fal-ai/wan/v2.2-a14b/text-to-video/turbo",
        imageEndpoint: "fal-ai/wan/v2.2-a14b/image-to-video/turbo",
        duration: () => 5,
        input: (params, _duration, hasImage) => ({
            resolution: "480p",
            ...(!hasImage
                ? { aspect_ratio: aspectRatio(params, WAN_TURBO_RATIOS) }
                : {}),
            ...(params.image[1] ? { end_image_url: params.image[1] } : {}),
        }),
    },
    "seedance-pro-fal": {
        textEndpoint: "fal-ai/bytedance/seedance/v1/pro/fast/text-to-video",
        imageEndpoint: "fal-ai/bytedance/seedance/v1/pro/fast/image-to-video",
        duration: (params) =>
            Math.min(10, Math.max(2, Math.floor(params.duration ?? 5))),
        input: (params, duration) => ({
            duration,
            resolution: params.resolution ?? "720p",
            aspect_ratio: aspectRatio(params, SEEDANCE_RATIOS),
            camera_fixed: false,
        }),
    },
};

export async function callFalFallbackVideo(
    prompt: string,
    params: ImageParams,
): Promise<VideoGenerationResult> {
    const config = VIDEO_CONFIGS[params.model];
    if (!config) {
        throw UpstreamError.fromProvider(400, {
            message: `Unsupported Fal video fallback: ${params.model}`,
        });
    }
    const image = params.image[0];
    const duration = config.duration(params);
    try {
        const result = await runFalJob(
            {
                endpoint: image ? config.imageEndpoint : config.textEndpoint,
                input: withSeed(
                    {
                        prompt,
                        ...config.input(params, duration, Boolean(image)),
                        ...(image ? { image_url: image } : {}),
                    },
                    params,
                ),
                pollMaxAttempts: MEDIA_POLL_MAX_ATTEMPTS,
            },
            requireFalKey(),
        );
        const { buffer, mimeType } = await download(
            result.video as FalFile | undefined,
            params.model,
        );
        return {
            buffer,
            mimeType: mimeType || "video/mp4",
            durationSeconds: duration,
            trackingData: {
                actualModel: params.model,
                usage: {
                    ...(image
                        ? { promptImageTokens: params.image.length }
                        : {}),
                    completionVideoSeconds: duration,
                },
            },
        };
    } catch (error) {
        throw toUpstreamError(error, params.model);
    }
}
