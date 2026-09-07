import { UpstreamError } from "@shared/error.ts";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { sleep } from "../util.ts";
import { closestRatioLogSpace } from "../utils/aspectRatio.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";

const H3_ENDPOINT = "https://queue.fal.run/minimax/h3/text-to-video";
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
const H3_MAX_TURBO_RESOLUTIONS = {
    "480p": "480P",
    "768p": "768P",
} as const;
const H3_MAX_TURBO_DURATIONS = [5, 10, 15] as const;
const H3_MAX_TURBO_ASPECT_RATIOS = [
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
): Promise<VideoGenerationResult> {
    const apiKey = getImageEnv("FAL_KEY");
    if (!apiKey)
        throw UpstreamError.fromProvider(500, {
            message: `${title} is not configured`,
        });

    const deadline = Date.now() + H3_TIMEOUT_MS;
    const authorization = { Authorization: `Key ${apiKey}` };
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
        "minimax-h3",
    );
}

export async function callMinimaxH3MaxTurboAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> {
    const duration = safeParams.duration ?? H3_MAX_TURBO_DURATIONS[0];
    if (!(H3_MAX_TURBO_DURATIONS as readonly number[]).includes(duration)) {
        throw UpstreamError.fromProvider(400, {
            message: "MiniMax H3 Max Turbo supports 5, 10, or 15 seconds",
        });
    }

    const resolution = safeParams.resolution ?? "480p";
    const upstreamResolution =
        H3_MAX_TURBO_RESOLUTIONS[
            resolution as keyof typeof H3_MAX_TURBO_RESOLUTIONS
        ];
    if (!upstreamResolution) {
        throw UpstreamError.fromProvider(400, {
            message: `MiniMax H3 Max Turbo does not support ${resolution}`,
        });
    }

    const images = safeParams.image ?? [];
    const hasFrames = images.length > 0;
    const endpoint = hasFrames
        ? H3_MAX_TURBO_IMAGE_ENDPOINT
        : H3_MAX_TURBO_TEXT_ENDPOINT;
    const requestedAspectRatio = safeParams.aspectRatio;
    if (
        !hasFrames &&
        requestedAspectRatio &&
        !H3_MAX_TURBO_ASPECT_RATIOS.includes(
            requestedAspectRatio as (typeof H3_MAX_TURBO_ASPECT_RATIOS)[number],
        )
    ) {
        throw UpstreamError.fromProvider(400, {
            message: `MiniMax H3 Max Turbo does not support aspectRatio ${requestedAspectRatio}`,
        });
    }

    return callFalH3API(
        "MiniMax H3 Max Turbo",
        endpoint,
        {
            prompt,
            duration,
            resolution: upstreamResolution,
            seed: safeParams.seed,
            enable_safety_checker: true,
            prompt_expansion_mode: "balanced",
            ...(hasFrames
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
                                    H3_MAX_TURBO_ASPECT_RATIOS,
                                )
                              : "16:9"),
                  }),
        },
        duration,
        H3_MAX_TURBO_MODEL,
    );
}
