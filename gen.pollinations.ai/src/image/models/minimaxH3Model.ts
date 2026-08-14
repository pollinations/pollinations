import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { getImageEnv } from "../env.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import { sleep } from "../util.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";

const H3_ENDPOINT = "https://queue.fal.run/minimax/h3/text-to-video";
const H3_POLL_INTERVAL_MS = 2_000;
const H3_TIMEOUT_MS = 10 * 60 * 1_000;
const H3_DURATION_SECONDS = 5;
const H3_RESOLUTIONS = {
    "480p": "480P",
    "768p": "768P",
    "2k": "2K",
} as const;

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
        throw new HttpError(message, 502);
    }
}

function remainingTime(deadline: number): number {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
        throw new HttpError("MiniMax H3 generation timed out", 504);
    }
    return remaining;
}

export async function callMinimaxH3API(
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> {
    const apiKey = getImageEnv("FAL_KEY");
    if (!apiKey) throw new HttpError("MiniMax H3 is not configured", 500);

    const resolution = safeParams.resolution ?? "480p";
    const upstreamResolution =
        H3_RESOLUTIONS[resolution as keyof typeof H3_RESOLUTIONS];
    if (!upstreamResolution) {
        throw new HttpError(`MiniMax H3 does not support ${resolution}`, 400);
    }

    const deadline = Date.now() + H3_TIMEOUT_MS;
    const authorization = { Authorization: `Key ${apiKey}` };
    const submissionResponse = await fetchUpstream(H3_ENDPOINT, {
        method: "POST",
        headers: { ...authorization, "Content-Type": "application/json" },
        body: JSON.stringify({
            prompt,
            duration: H3_DURATION_SECONDS,
            resolution: upstreamResolution,
            aspect_ratio: "16:9",
        }),
        signal: AbortSignal.timeout(remainingTime(deadline)),
        errorLabel: "MiniMax H3 submission failed",
    });
    const submission = await readJson<H3QueueSubmission>(
        submissionResponse,
        "MiniMax H3 returned an invalid submission",
    );
    if (!submission.status_url || !submission.response_url) {
        throw new HttpError("MiniMax H3 returned an invalid submission", 502);
    }

    while (true) {
        const statusResponse = await fetchUpstream(submission.status_url, {
            headers: authorization,
            signal: AbortSignal.timeout(remainingTime(deadline)),
            errorLabel: "MiniMax H3 status check failed",
        });
        const status = await readJson<H3QueueStatus>(
            statusResponse,
            "MiniMax H3 returned an invalid status",
        );
        if (status.status === "COMPLETED") break;
        if (status.status === "FAILED") {
            throw new HttpError(
                status.error || "MiniMax H3 generation failed",
                502,
            );
        }
        if (status.status !== "IN_QUEUE" && status.status !== "IN_PROGRESS") {
            throw new HttpError("MiniMax H3 returned an invalid status", 502);
        }
        await sleep(Math.min(H3_POLL_INTERVAL_MS, remainingTime(deadline)));
    }

    const resultResponse = await fetchUpstream(submission.response_url, {
        headers: authorization,
        signal: AbortSignal.timeout(remainingTime(deadline)),
        errorLabel: "MiniMax H3 result fetch failed",
    });
    const result = await readJson<H3Result>(
        resultResponse,
        "MiniMax H3 returned an invalid result",
    );
    if (!result.video?.url) {
        throw new HttpError("MiniMax H3 returned no video", 502);
    }

    const videoResponse = await fetchUpstream(result.video.url, {
        signal: AbortSignal.timeout(remainingTime(deadline)),
        errorLabel: "Failed to download MiniMax H3 output",
    });
    return {
        buffer: Buffer.from(await videoResponse.arrayBuffer()),
        mimeType:
            result.video.content_type ||
            videoResponse.headers.get("content-type") ||
            "video/mp4",
        durationSeconds: H3_DURATION_SECONDS,
        trackingData: {
            actualModel: "minimax-h3",
            usage: {
                completionVideoSeconds: H3_DURATION_SECONDS,
            },
        },
    };
}
