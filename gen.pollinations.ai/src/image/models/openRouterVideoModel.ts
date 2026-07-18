import debug from "debug";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { getImageEnv } from "../env.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import { sleep } from "../util.ts";
import { closestRatioLogSpace } from "../utils/aspectRatio.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";

const logOps = debug("pollinations:openrouter-video:ops");
const logError = debug("pollinations:openrouter-video:error");

const OPENROUTER_VIDEO_URL = "https://openrouter.ai/api/v1/videos";
const HAPPYHORSE_MODEL = "alibaba/happyhorse-1.1";
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_DELAY_MS = 30000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const HAPPYHORSE_ASPECT_RATIOS = [
    "16:9",
    "9:16",
    "1:1",
    "4:3",
    "3:4",
    "21:9",
    "9:21",
] as const;

interface OpenRouterVideoResponse {
    id: string;
    polling_url: string;
    status:
        | "pending"
        | "in_progress"
        | "completed"
        | "failed"
        | "cancelled"
        | "expired";
    error?: string;
    unsigned_urls?: string[];
    usage?: { cost?: number | null };
}

function resolveDuration(duration?: number): number {
    const resolved = duration ?? 5;
    if (!Number.isInteger(resolved) || resolved < 3 || resolved > 15) {
        throw new HttpError(
            "HappyHorse duration must be an integer from 3 to 15 seconds",
            400,
        );
    }
    return resolved;
}

function resolveAspectRatio(safeParams: ImageParams): string {
    if (
        safeParams.aspectRatio &&
        HAPPYHORSE_ASPECT_RATIOS.includes(
            safeParams.aspectRatio as (typeof HAPPYHORSE_ASPECT_RATIOS)[number],
        )
    ) {
        return safeParams.aspectRatio;
    }
    return closestRatioLogSpace(
        safeParams.width,
        safeParams.height,
        HAPPYHORSE_ASPECT_RATIOS,
    );
}

export async function callHappyHorseAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> {
    const apiKey = getImageEnv("OPENROUTER_API_KEY");
    if (!apiKey) {
        throw new HttpError(
            "OPENROUTER_API_KEY environment variable is required",
            500,
        );
    }

    const duration = resolveDuration(safeParams.duration);
    const requestBody: Record<string, unknown> = {
        model: HAPPYHORSE_MODEL,
        prompt,
        resolution: "720p",
        aspect_ratio: resolveAspectRatio(safeParams),
        duration,
        seed: safeParams.seed,
    };

    if (safeParams.image?.[0]) {
        requestBody.frame_images = [
            {
                type: "image_url",
                image_url: { url: safeParams.image[0] },
                frame_type: "first_frame",
            },
        ];
    }

    const submitResponse = await fetchUpstream(OPENROUTER_VIDEO_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        errorLabel: "OpenRouter video generation request failed",
    });
    const submitted = (await submitResponse.json()) as OpenRouterVideoResponse;
    if (!submitted.id || !submitted.polling_url) {
        throw new HttpError(
            "OpenRouter video API did not return a polling URL",
            502,
            submitted,
            OPENROUTER_VIDEO_URL,
        );
    }

    const completed = await pollVideo(submitted.polling_url, apiKey);
    const videoUrl = completed.unsigned_urls?.[0];
    if (!videoUrl) {
        throw new HttpError(
            "OpenRouter video completed without a download URL",
            502,
            completed,
            OPENROUTER_VIDEO_URL,
        );
    }

    const downloadHeaders =
        new URL(videoUrl).origin === new URL(OPENROUTER_VIDEO_URL).origin
            ? { Authorization: `Bearer ${apiKey}` }
            : undefined;
    const downloadResponse = await fetchUpstream(videoUrl, {
        headers: downloadHeaders,
        errorLabel: "Failed to download OpenRouter video",
    });
    const buffer = Buffer.from(await downloadResponse.arrayBuffer());

    logOps("HappyHorse generation complete", {
        duration,
        providerCost: completed.usage?.cost,
        bufferSize: buffer.length,
    });

    return {
        buffer,
        mimeType: "video/mp4",
        durationSeconds: duration,
        trackingData: {
            actualModel: "happyhorse-1.1",
            usage: { completionVideoSeconds: duration },
        },
    };
}

async function pollVideo(
    pollingUrl: string,
    apiKey: string,
): Promise<OpenRouterVideoResponse> {
    const url = new URL(pollingUrl, OPENROUTER_VIDEO_URL).toString();
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        let delay = POLL_INTERVAL_MS;

        if (!response.ok) {
            const body = await response.text();
            logError("OpenRouter video poll failed", response.status, body);
            if (
                response.status !== 429 &&
                response.status >= 400 &&
                response.status < 500
            ) {
                throw new HttpError(
                    `OpenRouter video poll failed: ${body}`,
                    response.status,
                    undefined,
                    url,
                );
            }
            delay = getPollRetryDelay(response);
        } else {
            const result = (await response.json()) as OpenRouterVideoResponse;
            if (result.status === "completed") return result;
            if (["failed", "cancelled", "expired"].includes(result.status)) {
                throw new HttpError(
                    `OpenRouter video generation ${result.status}: ${result.error ?? "unknown error"}`,
                    502,
                    result,
                    url,
                );
            }
        }

        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        await sleep(Math.min(delay, remaining));
    }

    throw new HttpError(
        "OpenRouter video generation timed out",
        504,
        undefined,
        url,
    );
}

function getPollRetryDelay(response: Response): number {
    if (response.status !== 429) return POLL_INTERVAL_MS;

    const retryAfter = response.headers.get("Retry-After");
    if (!retryAfter) return POLL_INTERVAL_MS;

    if (/^\d+$/.test(retryAfter)) {
        const delay = Number(retryAfter) * 1000;
        return Number.isFinite(delay)
            ? Math.min(delay, MAX_POLL_DELAY_MS)
            : POLL_INTERVAL_MS;
    }

    const delay = Date.parse(retryAfter) - Date.now();
    return Number.isFinite(delay) && delay > 0
        ? Math.min(delay, MAX_POLL_DELAY_MS)
        : POLL_INTERVAL_MS;
}
