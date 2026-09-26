import { UpstreamError } from "@shared/error.ts";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { sleep } from "../util.ts";
import { closestRatioLogSpace } from "../utils/aspectRatio.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";

const H3_ENDPOINT = "https://queue.fal.run/minimax/h3/text-to-video";
const H3_MAX_MODEL = "minimax/minimax-h3-max";
const H3_MAX_TEXT_ENDPOINT =
    "https://queue.fal.run/minimax/h3-max/text-to-video";
const H3_MAX_IMAGE_ENDPOINT =
    "https://queue.fal.run/minimax/h3-max/image-to-video";
const H3_MAX_R2V_ENDPOINT =
    "https://queue.fal.run/minimax/h3-max/reference-to-video";
const H3_MAX_TURBO_MODEL = "minimax/minimax-h3-max-turbo";
const H3_MAX_TURBO_TEXT_ENDPOINT =
    "https://queue.fal.run/minimax/h3-max-turbo/text-to-video";
const H3_MAX_TURBO_IMAGE_ENDPOINT =
    "https://queue.fal.run/minimax/h3-max-turbo/image-to-video";
const H3_POLL_INTERVAL_MS = 2_000;
const H3_TIMEOUT_MS = 10 * 60 * 1_000;
const H3_DURATION_SECONDS = 5;
const H3_RESOLUTIONS = {
    "480p": "480P",
    "768p": "768P",
    "2k": "2K",
} as const;
const H3_MAX_RESOLUTIONS = {
    "480p": "480P",
    "768p": "768P",
    "1080p": "1080P",
} as const;
const H3_MAX_DURATIONS = [5, 10, 15] as const;
const H3_MAX_ASPECT_RATIOS = [
    "21:9",
    "16:9",
    "4:3",
    "1:1",
    "3:4",
    "9:16",
] as const;

interface H3QueueSubmission {
    status_url?: string;
    response_url?: string;
}

interface H3QueueStatus {
    status?: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
    error?: string;
}

interface H3Result {
    video?: {
        url?: string;
        content_type?: string;
    };
}

async function readJson<T>(response: Response, message: string): Promise<T> {
    try {
        return (await response.json()) as T;
    } catch {
        throw UpstreamError.fromProvider(502, { message });
    }
}

function remainingTime(deadline: number, title: string): number {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
        throw UpstreamError.fromProvider(504, {
            message: `${title} generation timed out`,
        });
    }
    return remaining;
}

async function callFalH3API(
    title: string,
    endpoint: string,
    body: Record<string, unknown>,
    durationSeconds: number,
    actualModel: string,
    billFromProvider = false,
): Promise<VideoGenerationResult> {
    const apiKey = getImageEnv("FAL_KEY");
    if (!apiKey)
        throw UpstreamError.fromProvider(500, {
            message: `${title} is not configured`,
        });

    const deadline = Date.now() + H3_TIMEOUT_MS;
    const authorization = { Authorization: `Key ${apiKey}` };
    let unitCost: number | undefined;
    if (billFromProvider) {
        const endpointId = new URL(endpoint).pathname.slice(1);
        const pricingResponse = await fetchUpstream(
            `https://api.fal.ai/v1/models/pricing?endpoint_id=${encodeURIComponent(endpointId)}`,
            {
                headers: authorization,
                signal: AbortSignal.timeout(remainingTime(deadline, title)),
                errorLabel: `${title} pricing lookup failed`,
            },
        );
        const pricing = await readJson<{
            prices?: {
                endpoint_id: string;
                unit_price: number;
                currency: string;
                unit: string;
            }[];
        }>(pricingResponse, `${title} returned invalid pricing`);
        const price = pricing.prices?.find(
            (price) => price.endpoint_id === endpointId,
        );
        if (
            !price ||
            price.currency !== "USD" ||
            price.unit !== "seconds" ||
            !Number.isFinite(price.unit_price) ||
            price.unit_price <= 0
        ) {
            throw UpstreamError.fromProvider(502, {
                message: `${title} returned invalid pricing`,
            });
        }
        unitCost = price.unit_price;
    }
    const submissionResponse = await fetchUpstream(endpoint, {
        method: "POST",
        headers: { ...authorization, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(remainingTime(deadline, title)),
        errorLabel: `${title} submission failed`,
    });
    const submission = await readJson<H3QueueSubmission>(
        submissionResponse,
        `${title} returned an invalid submission`,
    );
    if (!submission.status_url || !submission.response_url) {
        throw UpstreamError.fromProvider(502, {
            message: `${title} returned an invalid submission`,
        });
    }

    while (true) {
        const statusResponse = await fetchUpstream(submission.status_url, {
            headers: authorization,
            signal: AbortSignal.timeout(remainingTime(deadline, title)),
            errorLabel: `${title} status check failed`,
        });
        const status = await readJson<H3QueueStatus>(
            statusResponse,
            `${title} returned an invalid status`,
        );
        if (status.status === "COMPLETED") break;
        if (status.status === "FAILED") {
            throw UpstreamError.fromProvider(502, {
                message: status.error || `${title} generation failed`,
            });
        }
        if (status.status !== "IN_QUEUE" && status.status !== "IN_PROGRESS") {
            throw UpstreamError.fromProvider(502, {
                message: `${title} returned an invalid status`,
            });
        }
        await sleep(
            Math.min(H3_POLL_INTERVAL_MS, remainingTime(deadline, title)),
        );
    }

    const resultResponse = await fetchUpstream(submission.response_url, {
        headers: authorization,
        signal: AbortSignal.timeout(remainingTime(deadline, title)),
        errorLabel: `${title} result fetch failed`,
    });
    const billableUnits = Number(
        resultResponse.headers.get("x-fal-billable-units"),
    );
    if (
        billFromProvider &&
        (!Number.isFinite(billableUnits) || billableUnits <= 0)
    ) {
        throw UpstreamError.fromProvider(502, {
            message: `${title} returned invalid billing units`,
        });
    }
    const result = await readJson<H3Result>(
        resultResponse,
        `${title} returned an invalid result`,
    );
    if (!result.video?.url) {
        throw UpstreamError.fromProvider(502, {
            message: `${title} returned no video`,
        });
    }

    const videoResponse = await fetchUpstream(result.video.url, {
        signal: AbortSignal.timeout(remainingTime(deadline, title)),
        errorLabel: `Failed to download ${title} output`,
    });
    return {
        buffer: Buffer.from(await videoResponse.arrayBuffer()),
        mimeType:
            result.video.content_type ||
            videoResponse.headers.get("content-type") ||
            "video/mp4",
        durationSeconds,
        trackingData: {
            actualModel,
            ...(unitCost !== undefined
                ? { providerBilling: { units: billableUnits, unitCost } }
                : {}),
            usage: { completionVideoSeconds: durationSeconds },
        },
    };
}

export async function callMinimaxH3API(
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> {
    const resolution = safeParams.resolution ?? "480p";
    const upstreamResolution =
        H3_RESOLUTIONS[resolution as keyof typeof H3_RESOLUTIONS];
    if (!upstreamResolution) {
        throw UpstreamError.fromProvider(400, {
            message: `MiniMax H3 does not support ${resolution}`,
        });
    }

    return callFalH3API(
        "MiniMax H3",
        H3_ENDPOINT,
        {
            prompt,
            duration: H3_DURATION_SECONDS,
            resolution: upstreamResolution,
            aspect_ratio: "16:9",
            seed: safeParams.seed,
        },
        H3_DURATION_SECONDS,
        "minimax/minimax-h3",
    );
}

async function callFalMinimaxMaxVariant(
    title: string,
    modelId: string,
    textEndpoint: string,
    imageEndpoint: string,
    r2vEndpoint: string | undefined,
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> {
    const duration = safeParams.duration ?? H3_MAX_DURATIONS[0];
    if (!(H3_MAX_DURATIONS as readonly number[]).includes(duration)) {
        throw UpstreamError.fromProvider(400, {
            message: `${title} supports 5, 10, or 15 seconds`,
        });
    }

    const resolution = safeParams.resolution ?? "480p";
    const upstreamResolution =
        H3_MAX_RESOLUTIONS[resolution as keyof typeof H3_MAX_RESOLUTIONS];
    if (!upstreamResolution) {
        throw UpstreamError.fromProvider(400, {
            message: `${title} does not support ${resolution}`,
        });
    }

    const images = safeParams.image ?? [];
    const hasFrames = images.length > 0;
    const hasReference =
        (safeParams.reference_images?.length ?? 0) > 0 ||
        (safeParams.reference_videos?.length ?? 0) > 0 ||
        (safeParams.reference_audios?.length ?? 0) > 0;

    if (hasFrames && hasReference) {
        throw UpstreamError.fromProvider(400, {
            message:
                "Frame inputs (image[]) and reference media (reference_images, reference_videos, reference_audios) cannot be combined.",
        });
    }

    if (hasReference && !r2vEndpoint) {
        throw UpstreamError.fromProvider(400, {
            message: `${title} does not support reference media`,
        });
    }

    const endpoint =
        hasReference && r2vEndpoint
            ? r2vEndpoint
            : hasFrames
              ? imageEndpoint
              : textEndpoint;
    const requestedAspectRatio = safeParams.aspectRatio;
    if (
        !hasFrames &&
        requestedAspectRatio &&
        !H3_MAX_ASPECT_RATIOS.includes(
            requestedAspectRatio as (typeof H3_MAX_ASPECT_RATIOS)[number],
        )
    ) {
        throw UpstreamError.fromProvider(400, {
            message: `${title} does not support aspectRatio ${requestedAspectRatio}`,
        });
    }

    return callFalH3API(
        title,
        endpoint,
        {
            prompt,
            duration,
            resolution: upstreamResolution,
            seed: safeParams.seed,
            enable_safety_checker: true,
            prompt_expansion_mode: "balanced",
            ...(hasReference
                ? {
                      aspect_ratio:
                          requestedAspectRatio ??
                          (safeParams.dimensionsExplicit
                              ? closestRatioLogSpace(
                                    safeParams.width,
                                    safeParams.height,
                                    H3_MAX_ASPECT_RATIOS,
                                )
                              : "16:9"),
                      ...(safeParams.reference_images?.length
                          ? {
                                reference_image_urls:
                                    safeParams.reference_images,
                            }
                          : {}),
                      ...(safeParams.reference_videos?.length
                          ? {
                                reference_video_urls:
                                    safeParams.reference_videos,
                            }
                          : {}),
                      ...(safeParams.reference_audios?.length
                          ? {
                                reference_audio_urls:
                                    safeParams.reference_audios,
                            }
                          : {}),
                  }
                : hasFrames
                  ? {
                        image_url: images[0],
                        ...(images[1] ? { end_image_url: images[1] } : {}),
                    }
                  : {
                        aspect_ratio:
                            requestedAspectRatio ??
                            (safeParams.dimensionsExplicit
                                ? closestRatioLogSpace(
                                      safeParams.width,
                                      safeParams.height,
                                      H3_MAX_ASPECT_RATIOS,
                                  )
                                : "16:9"),
                    }),
        },
        duration,
        modelId,
        modelId === H3_MAX_MODEL,
    );
}

export async function callMinimaxH3MaxAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> {
    return callFalMinimaxMaxVariant(
        "MiniMax H3 Max",
        H3_MAX_MODEL,
        H3_MAX_TEXT_ENDPOINT,
        H3_MAX_IMAGE_ENDPOINT,
        H3_MAX_R2V_ENDPOINT,
        prompt,
        safeParams,
    );
}

export async function callMinimaxH3MaxTurboAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> {
    return callFalMinimaxMaxVariant(
        "MiniMax H3 Max Turbo",
        H3_MAX_TURBO_MODEL,
        H3_MAX_TURBO_TEXT_ENDPOINT,
        H3_MAX_TURBO_IMAGE_ENDPOINT,
        undefined,
        prompt,
        safeParams,
    );
}
