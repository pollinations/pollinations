import { UpstreamError } from "@shared/error.ts";
import debug from "debug";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { sleep } from "../util.ts";
import { closestRatioLogSpace } from "../utils/aspectRatio.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";

const logOps = debug("pollinations:kling:ops");

const KLING_MODEL = "kwaivgi/kling-v3.0-std";
const KLING_TEXT_ENDPOINT =
    "https://queue.fal.run/fal-ai/kling-video/v3/standard/text-to-video";
const KLING_IMAGE_ENDPOINT =
    "https://queue.fal.run/fal-ai/kling-video/v3/standard/image-to-video";
const KLING_POLL_INTERVAL_MS = 3_000;
const KLING_TIMEOUT_MS = 10 * 60 * 1_000;
// Text-to-video's aspect_ratio enum; image-to-video has no such field and
// instead follows the supplied start image.
const KLING_ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;

interface FalQueueSubmission {
    status_url?: string;
    response_url?: string;
}

interface FalQueueStatus {
    status?: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
    error?: string;
}

interface KlingResult {
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

function remainingTime(deadline: number): number {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
        throw UpstreamError.fromProvider(504, {
            message: "Kling generation timed out",
        });
    }
    return remaining;
}

export async function callKlingVideoAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> {
    const apiKey = getImageEnv("FAL_KEY");
    if (!apiKey) {
        throw UpstreamError.fromProvider(500, {
            message: "FAL_KEY environment variable is required",
        });
    }

    const duration = safeParams.duration ?? 5;
    if (!Number.isInteger(duration) || duration < 3 || duration > 15) {
        throw UpstreamError.fromProvider(400, {
            message: "Kling duration must be an integer from 3 to 15 seconds",
        });
    }
    const generateAudio = safeParams.audio === true;
    const [startImage, endImage] = safeParams.image ?? [];
    const isImageToVideo = Boolean(startImage);

    const requestBody: Record<string, unknown> = {
        prompt,
        duration: String(duration),
        generate_audio: generateAudio,
        seed: safeParams.seed,
    };
    if (isImageToVideo) {
        requestBody.start_image_url = startImage;
        if (endImage) requestBody.end_image_url = endImage;
    } else {
        requestBody.aspect_ratio = closestRatioLogSpace(
            safeParams.width,
            safeParams.height,
            KLING_ASPECT_RATIOS,
        );
    }

    const endpoint = isImageToVideo
        ? KLING_IMAGE_ENDPOINT
        : KLING_TEXT_ENDPOINT;
    const deadline = Date.now() + KLING_TIMEOUT_MS;
    const authorization = { Authorization: `Key ${apiKey}` };

    const submissionResponse = await fetchUpstream(endpoint, {
        method: "POST",
        headers: { ...authorization, "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(remainingTime(deadline)),
        errorLabel: "Kling submission failed",
    });
    const submission = await readJson<FalQueueSubmission>(
        submissionResponse,
        "Kling returned an invalid submission",
    );
    if (!submission.status_url || !submission.response_url) {
        throw UpstreamError.fromProvider(502, {
            message: "Kling returned an invalid submission",
        });
    }

    while (true) {
        const statusResponse = await fetchUpstream(submission.status_url, {
            headers: authorization,
            signal: AbortSignal.timeout(remainingTime(deadline)),
            errorLabel: "Kling status check failed",
        });
        const status = await readJson<FalQueueStatus>(
            statusResponse,
            "Kling returned an invalid status",
        );
        if (status.status === "COMPLETED") break;
        if (status.status === "FAILED") {
            throw UpstreamError.fromProvider(502, {
                message: status.error || "Kling generation failed",
            });
        }
        if (status.status !== "IN_QUEUE" && status.status !== "IN_PROGRESS") {
            throw UpstreamError.fromProvider(502, {
                message: "Kling returned an invalid status",
            });
        }
        await sleep(Math.min(KLING_POLL_INTERVAL_MS, remainingTime(deadline)));
    }

    const resultResponse = await fetchUpstream(submission.response_url, {
        headers: authorization,
        signal: AbortSignal.timeout(remainingTime(deadline)),
        errorLabel: "Kling result fetch failed",
    });
    const result = await readJson<KlingResult>(
        resultResponse,
        "Kling returned an invalid result",
    );
    if (!result.video?.url) {
        throw UpstreamError.fromProvider(502, {
            message: "Kling returned no video",
        });
    }

    const videoResponse = await fetchUpstream(result.video.url, {
        signal: AbortSignal.timeout(remainingTime(deadline)),
        errorLabel: "Failed to download Kling output",
    });

    logOps("Kling generation complete", {
        duration,
        generateAudio,
        isImageToVideo,
    });

    return {
        buffer: Buffer.from(await videoResponse.arrayBuffer()),
        mimeType:
            result.video.content_type ||
            videoResponse.headers.get("content-type") ||
            "video/mp4",
        durationSeconds: duration,
        trackingData: {
            actualModel: KLING_MODEL,
            usage: {
                completionVideoSeconds: duration,
                ...(generateAudio ? { completionAudioSeconds: duration } : {}),
            },
        },
    };
}
