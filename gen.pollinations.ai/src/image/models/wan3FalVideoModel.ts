import { HttpError } from "@shared/http-error.ts";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { sleep } from "../util.ts";
import { closestRatioLogSpace } from "../utils/aspectRatio.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";

const WAN_3_TEXT_ENDPOINT =
    "https://queue.fal.run/alibaba/wan-3.0-prime/text-to-video";
const WAN_3_IMAGE_ENDPOINT =
    "https://queue.fal.run/alibaba/wan-3.0-prime/image-to-video";
const WAN_3_R2V_ENDPOINT =
    "https://queue.fal.run/alibaba/wan-3.0-prime/reference-to-video";
const WAN_3_DURATION_SECONDS = 5;
const WAN_3_TIMEOUT_MS = 5 * 60 * 1000;
const WAN_3_POLL_INTERVAL_MS = 2_000;
const WAN_3_ASPECT_RATIOS = ["16:9", "4:3", "1:1", "3:4", "9:16"] as const;

interface FalQueueSubmission {
    status_url?: string;
    response_url?: string;
}

interface FalQueueStatus {
    status?: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
    error?: string;
}

interface FalWan3Result {
    video?: {
        url?: string;
        content_type?: string;
    };
}

async function readJson<T>(response: Response, message: string): Promise<T> {
    try {
        return (await response.json()) as T;
    } catch {
        throw new HttpError(message, 502);
    }
}

function remainingTime(deadline: number): number {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
        throw new HttpError("Wan 3.0 generation timed out", 504);
    }
    return remaining;
}

export async function callWan3FalAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> {
    const apiKey = getImageEnv("FAL_KEY");
    if (!apiKey) throw new HttpError("Wan 3.0 is not configured", 500);

    const duration = safeParams.duration ?? WAN_3_DURATION_SECONDS;
    if (duration !== WAN_3_DURATION_SECONDS) {
        throw new HttpError("Wan 3.0 supports exactly 5 seconds", 400);
    }

    const images = safeParams.image ?? [];
    const hasFrames = images.length > 0;
    const hasReference =
        (safeParams.reference_images?.length ?? 0) > 0 ||
        (safeParams.reference_videos?.length ?? 0) > 0 ||
        (safeParams.reference_audios?.length ?? 0) > 0;

    if (hasFrames && hasReference) {
        throw new HttpError(
            "Frame inputs (image[]) and reference media (reference_images, reference_videos, reference_audios) cannot be combined.",
            400,
        );
    }

    const resolution = safeParams.resolution ?? "480p";
    const deadline = Date.now() + WAN_3_TIMEOUT_MS;
    const authorization = { Authorization: `Key ${apiKey}` };

    let endpoint: string;
    let body: Record<string, unknown>;

    if (hasReference) {
        endpoint = WAN_3_R2V_ENDPOINT;
        body = {
            prompt,
            resolution,
            aspect_ratio: closestRatioLogSpace(
                safeParams.width,
                safeParams.height,
                WAN_3_ASPECT_RATIOS,
            ),
            duration,
            audio: safeParams.audio,
            enable_prompt_expansion: true,
            enable_safety_checker: true,
            seed: safeParams.seed,
            ...(safeParams.reference_images?.length
                ? { reference_image_urls: safeParams.reference_images }
                : {}),
            ...(safeParams.reference_videos?.length
                ? { reference_video_urls: safeParams.reference_videos }
                : {}),
            ...(safeParams.reference_audios?.length
                ? { reference_audio_urls: safeParams.reference_audios }
                : {}),
        };
    } else if (hasFrames) {
        const startImage = images[0];
        const endImage = images[1];
        endpoint = WAN_3_IMAGE_ENDPOINT;
        body = {
            prompt,
            resolution,
            aspect_ratio: "adaptive",
            duration,
            audio: safeParams.audio,
            enable_prompt_expansion: true,
            enable_safety_checker: true,
            seed: safeParams.seed,
            start_image_url: startImage,
            ...(endImage ? { end_image_url: endImage } : {}),
        };
    } else {
        endpoint = WAN_3_TEXT_ENDPOINT;
        body = {
            prompt,
            resolution,
            aspect_ratio: closestRatioLogSpace(
                safeParams.width,
                safeParams.height,
                WAN_3_ASPECT_RATIOS,
            ),
            duration,
            audio: safeParams.audio,
            enable_prompt_expansion: true,
            enable_safety_checker: true,
            seed: safeParams.seed,
        };
    }

    const submissionResponse = await fetchUpstream(endpoint, {
        method: "POST",
        headers: { ...authorization, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(remainingTime(deadline)),
        errorLabel: "Wan 3.0 submission failed",
    });
    const submission = await readJson<FalQueueSubmission>(
        submissionResponse,
        "Wan 3.0 returned an invalid submission",
    );
    if (!submission.status_url || !submission.response_url) {
        throw new HttpError("Wan 3.0 returned an invalid submission", 502);
    }

    while (true) {
        const statusResponse = await fetchUpstream(submission.status_url, {
            headers: authorization,
            signal: AbortSignal.timeout(remainingTime(deadline)),
            errorLabel: "Wan 3.0 status check failed",
        });
        const status = await readJson<FalQueueStatus>(
            statusResponse,
            "Wan 3.0 returned an invalid status",
        );
        if (status.status === "COMPLETED") break;
        if (status.status === "FAILED") {
            throw new HttpError(
                status.error || "Wan 3.0 generation failed",
                502,
            );
        }
        if (status.status !== "IN_QUEUE" && status.status !== "IN_PROGRESS") {
            throw new HttpError("Wan 3.0 returned an invalid status", 502);
        }
        await sleep(Math.min(WAN_3_POLL_INTERVAL_MS, remainingTime(deadline)));
    }

    const resultResponse = await fetchUpstream(submission.response_url, {
        headers: authorization,
        signal: AbortSignal.timeout(remainingTime(deadline)),
        errorLabel: "Wan 3.0 result fetch failed",
    });
    const result = await readJson<FalWan3Result>(
        resultResponse,
        "Wan 3.0 returned an invalid result",
    );
    if (!result.video?.url) {
        throw new HttpError("Wan 3.0 returned no video", 502);
    }

    const videoResponse = await fetchUpstream(result.video.url, {
        signal: AbortSignal.timeout(remainingTime(deadline)),
        errorLabel: "Failed to download Wan 3.0 output",
    });
    return {
        buffer: Buffer.from(await videoResponse.arrayBuffer()),
        mimeType:
            result.video.content_type ||
            videoResponse.headers.get("content-type") ||
            "video/mp4",
        durationSeconds: duration,
        trackingData: {
            actualModel: "wan-3.0",
            usage: { completionVideoSeconds: duration },
        },
    };
}
