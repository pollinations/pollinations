import { UpstreamError } from "@shared/error.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import {
    FalError,
    runFalJob,
    runFalJobResponse,
} from "../../model3d/models/falClient.ts";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { closestRatioLogSpace } from "../utils/aspectRatio.ts";
import { falBillableUnits, falUnitPrice } from "../utils/falBillableUnits.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import {
    resolveGrokAspectRatio,
    resolveGrokDuration,
} from "./openRouterVideoModel.ts";
import type { VideoGenerationResult } from "./veoVideoModel.ts";

const RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"] as const;
const WAN_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"] as const;
const WAN_TURBO_RATIOS = ["16:9", "9:16", "1:1"] as const;
const SEEDANCE_RATIOS = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"] as const;

type FalFile = { url?: string; content_type?: string; duration?: number };

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

// A supported aspectRatio wins unless the caller set width or height.
function aspectRatio(
    params: ImageParams,
    ratios: readonly string[] = RATIOS,
): string {
    const requested = params.aspectRatio;
    if (!params.dimensionsExplicit && requested && ratios.includes(requested)) {
        return requested;
    }
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
    if (params.model !== "bytedance/seedream-5.0-lite:fal") {
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
    // fal bills a video that xAI's moderation rejects after generating it.
    billsRejectedVideos?: boolean;
    // Charge fal's reported units at the endpoint's live price.
    providerPriced?: boolean;
};

const VIDEO_CONFIGS: Record<string, FalVideoConfig> = {
    "x-ai/grok-imagine-video:fal": {
        textEndpoint: "xai/grok-imagine-video/text-to-video",
        imageEndpoint: "xai/grok-imagine-video/image-to-video",
        duration: (params) => resolveGrokDuration(params.duration),
        input: (params, duration) => ({
            duration,
            resolution: "720p",
            aspect_ratio: resolveGrokAspectRatio(params),
        }),
        billsRejectedVideos: true,
        providerPriced: true,
    },
    "x-ai/grok-imagine-video-1.5:fal": {
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
    "alibaba/wan-2.6:fal": {
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
    // Primary route for alibaba/wan-2.2-fast (moved off Replicate, 2026-10-21).
    // Fal Turbo endpoints; tracking keeps the requested (base) model id.
    "alibaba/wan-2.2-fast": {
        textEndpoint: "fal-ai/wan/v2.2-a14b/text-to-video/turbo",
        imageEndpoint: "fal-ai/wan/v2.2-a14b/image-to-video/turbo",
        duration: () => 5,
        input: (params, _duration, hasImage) => ({
            resolution: "480p",
            ...(!hasImage
                ? {
                      // Keep Replicate's 16:9 default when the caller sets
                      // neither a ratio nor dimensions.
                      aspect_ratio:
                          params.aspectRatio || params.dimensionsExplicit
                              ? aspectRatio(params, WAN_TURBO_RATIOS)
                              : "16:9",
                  }
                : {}),
            ...(params.image[1] ? { end_image_url: params.image[1] } : {}),
        }),
    },
    "bytedance/seedance-1-pro-fast": {
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
        providerPriced: true,
    },
    // Same aspect ratios as Seedance; image-to-video follows the first frame.
    "heygen/heygen-video-1": {
        textEndpoint: "heygen/heygen-video/text-to-video",
        imageEndpoint: "heygen/heygen-video/image-to-video",
        duration: (params) => {
            const duration = params.duration ?? 5;
            if (!Number.isInteger(duration) || duration < 5 || duration > 15) {
                throw UpstreamError.fromProvider(400, {
                    message:
                        "HeyGen Video 1 duration must be an integer from 5 to 15 seconds",
                });
            }
            return duration;
        },
        input: (params, duration, hasImage) => ({
            duration,
            resolution: params.resolution ?? "480p",
            ...(!hasImage
                ? { aspect_ratio: aspectRatio(params, SEEDANCE_RATIOS) }
                : {}),
        }),
        providerPriced: true,
    },
    // Renders 5 seconds only; image-to-video follows the source ratio.
    "kandinskylab/kandinsky-6.0-lite": {
        textEndpoint: "fal-ai/kandinsky6-lite/text-to-video",
        imageEndpoint: "fal-ai/kandinsky6-lite/image-to-video",
        duration: () => 5,
        input: (params, _duration, hasImage) => ({
            generate_audio: params.audio ?? true,
            ...(!hasImage
                ? {
                      aspect_ratio:
                          !params.dimensionsExplicit &&
                          WAN_RATIOS.some(
                              (ratio) => ratio === params.aspectRatio,
                          )
                              ? params.aspectRatio
                              : aspectRatio(params, WAN_RATIOS),
                  }
                : {}),
        }),
        providerPriced: true,
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
    const usage = {
        ...(image ? { promptImageTokens: params.image.length } : {}),
        completionVideoSeconds: duration,
    };
    try {
        const endpoint = image ? config.imageEndpoint : config.textEndpoint;
        const apiKey = requireFalKey();
        const unitCost = config.providerPriced
            ? await falUnitPrice(endpoint, apiKey)
            : undefined;
        const response = await runFalJobResponse(
            {
                endpoint,
                input: withSeed(
                    {
                        prompt,
                        ...config.input(params, duration, Boolean(image)),
                        ...(image ? { image_url: image } : {}),
                    },
                    params,
                ),
            },
            apiKey,
        );
        const providerBilling =
            unitCost === undefined
                ? undefined
                : { units: falBillableUnits(response), unitCost };
        const result = (await response.json()) as { video?: FalFile };
        if (params.model === "x-ai/grok-imagine-video:fal") {
            const seconds = result.video?.duration;
            if (
                typeof seconds !== "number" ||
                !Number.isFinite(seconds) ||
                seconds <= 0
            ) {
                throw UpstreamError.fromProvider(502, {
                    message:
                        "Fal Grok response is missing output video duration",
                });
            }
            // Weighted fal billing units are not video seconds.
            usage.completionVideoSeconds = seconds;
        }
        const { buffer, mimeType } = await download(result.video, params.model);
        return {
            buffer,
            mimeType: mimeType || "video/mp4",
            durationSeconds: usage.completionVideoSeconds,
            trackingData: {
                actualModel: params.model,
                usage,
                ...(providerBilling ? { providerBilling } : {}),
            },
        };
    } catch (error) {
        if (config.billsRejectedVideos && isRejectedAfterGeneration(error)) {
            throw UpstreamError.fromProvider(422, {
                message: `${error.message} The video was rejected after it was generated, so this request was charged.`,
                responseBody: error.responseBody,
                billedUsage: usage,
            });
        }
        throw toUpstreamError(error, params.model);
    }
}

// fal answers a video that xAI rejected after generating it with a
// content_policy_violation that echoes the whole request, duration included.
// A rejection before generation echoes only the checked prompt and images,
// and fal does not bill it.
function isRejectedAfterGeneration(error: unknown): error is FalError {
    if (!(error instanceof FalError) || error.status !== 422) return false;
    try {
        const detail = JSON.parse(error.responseBody ?? "").detail?.[0];
        return (
            detail?.type === "content_policy_violation" &&
            typeof detail.input?.duration === "number"
        );
    } catch {
        return false;
    }
}

const MIRELO_ENDPOINT = "mirelo-ai/sfx2.0/video-to-video";

/**
 * Mirelo SFX 2.0 adds sound effects to the one `reference_videos` source and
 * returns that video. fal bills the seconds it returns at its live price.
 */
export async function callMireloSfxAPI(
    prompt: string,
    params: ImageParams,
): Promise<VideoGenerationResult> {
    if (params.image.length > 0) {
        throw new UpstreamError(400, {
            message: `${params.model} does not accept image inputs; pass the video as reference_videos.`,
        });
    }
    const sources = params.reference_videos ?? [];
    if (sources.length !== 1) {
        throw new UpstreamError(400, {
            message: `${params.model} needs exactly one reference_videos URL: the video to add sound to.`,
        });
    }
    try {
        const apiKey = requireFalKey();
        const unitCost = await falUnitPrice(MIRELO_ENDPOINT, apiKey);
        const response = await runFalJobResponse(
            {
                endpoint: MIRELO_ENDPOINT,
                input: withSeed(
                    {
                        video_url: sources[0],
                        text_prompt: prompt,
                        // fal defaults to two versions, each billed.
                        num_samples: 1,
                        // fal defaults to the first 10 seconds.
                        duration:
                            params.duration ??
                            IMAGE_SERVICES["mirelo/sfx-2.0"].defaultDuration,
                    },
                    params,
                ),
            },
            apiKey,
        );
        const units = falBillableUnits(response);
        const result = (await response.json()) as { video?: FalFile[] };
        const { buffer } = await download(result.video?.[0], params.model);
        return {
            buffer,
            mimeType: "video/mp4",
            durationSeconds: units,
            trackingData: {
                actualModel: params.model,
                usage: { completionVideoSeconds: units },
                providerBilling: { units, unitCost },
            },
        };
    } catch (error) {
        throw toUpstreamError(error, params.model);
    }
}
