import debug from "debug";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import { sleep } from "../util.ts";

const logOps = debug("pollinations:xai-video:ops");
const logError = debug("pollinations:xai-video:error");

const XAI_VIDEO_API_URL = "https://api.x.ai/v1/videos/generations";
const XAI_VIDEO_POLL_URL = "https://api.x.ai/v1/videos";

// xAI video aspect ratios
const ASPECT_RATIOS: Array<{ ratio: number; label: string }> = [
    { ratio: 1 / 1, label: "1:1" },
    { ratio: 16 / 9, label: "16:9" },
    { ratio: 9 / 16, label: "9:16" },
    { ratio: 4 / 3, label: "4:3" },
    { ratio: 3 / 4, label: "3:4" },
    { ratio: 3 / 2, label: "3:2" },
    { ratio: 2 / 3, label: "2:3" },
];

function closestAspectRatio(
    width: number | undefined,
    height: number | undefined,
): string | undefined {
    if (!width || !height) return undefined;
    const requested = width / height;
    return ASPECT_RATIOS.reduce((best, ar) =>
        Math.abs(requested - ar.ratio) < Math.abs(requested - best.ratio)
            ? ar
            : best,
    ).label;
}

interface XaiVideoStatusResponse {
    id: string;
    status: "pending" | "processing" | "done" | "succeeded" | "failed";
    video?: {
        url: string;
        duration?: number;
    };
    error?: string;
    progress?: number;
}

/**
 * Generates a video using the official xAI video API (grok-imagine-video).
 * Always uses 720p resolution. Async: submit → poll → download.
 */
export async function callXaiVideoAPI(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<VideoGenerationResult> {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
        throw new HttpError(
            "XAI_API_KEY environment variable is required",
            500,
        );
    }

    const durationSeconds = Math.min(Math.max(safeParams.duration || 5, 1), 15);

    logOps("Calling xAI video API:", { prompt, durationSeconds });
    progress.updateBar(
        requestId,
        30,
        "Processing",
        "Submitting video generation request...",
    );

    const requestBody: Record<string, unknown> = {
        model: "grok-imagine-video",
        prompt,
        resolution: "720p",
        duration: durationSeconds,
    };

    const aspectRatio = closestAspectRatio(safeParams.width, safeParams.height);
    if (aspectRatio) requestBody.aspect_ratio = aspectRatio;

    logOps("Request body:", JSON.stringify(requestBody));

    const submitResponse = await fetch(XAI_VIDEO_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
    });

    if (!submitResponse.ok) {
        const errorText = await submitResponse.text();
        logError("xAI video submit failed:", submitResponse.status, errorText);
        throw new HttpError(
            `xAI video generation request failed: ${errorText}`,
            submitResponse.status,
        );
    }

    const submitData = (await submitResponse.json()) as {
        id?: string;
        request_id?: string;
    };
    const videoId = submitData.id ?? submitData.request_id;

    if (!videoId) {
        throw new HttpError("xAI video API did not return a request ID", 500);
    }

    logOps("Video generation submitted, ID:", videoId);
    progress.updateBar(
        requestId,
        40,
        "Processing",
        "Video generation queued, waiting...",
    );

    const result = await pollXaiVideoStatus(
        videoId,
        apiKey,
        progress,
        requestId,
    );

    progress.updateBar(requestId, 95, "Success", "Video generation completed");

    const actualDuration = result.duration || durationSeconds;

    return {
        buffer: result.buffer,
        mimeType: "video/mp4",
        durationSeconds: actualDuration,
        trackingData: {
            actualModel: "grok-video-pro",
            usage: {
                completionVideoSeconds: actualDuration,
            },
        },
    };
}

async function pollXaiVideoStatus(
    videoId: string,
    apiKey: string,
    progress: ProgressManager,
    requestId: string,
): Promise<{ buffer: Buffer; duration?: number }> {
    const maxAttempts = 90; // 3 minutes max
    let delayMs = 3000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        logOps(
            `Poll attempt ${attempt}/${maxAttempts} for video ${videoId}...`,
        );

        const progressPercent = 40 + Math.min(50, attempt);
        progress.updateBar(
            requestId,
            progressPercent,
            "Processing",
            `Generating video... (${attempt}/${maxAttempts})`,
        );

        const pollResponse = await fetch(`${XAI_VIDEO_POLL_URL}/${videoId}`, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
        });

        if (!pollResponse.ok) {
            const errorText = await pollResponse.text();
            logError("Poll request failed:", pollResponse.status, errorText);
            if (pollResponse.status >= 400 && pollResponse.status < 500) {
                throw new HttpError(
                    `xAI video poll failed: ${errorText}`,
                    pollResponse.status,
                );
            }
            await sleep(delayMs);
            delayMs = Math.min(delayMs * 1.2, 15000);
            continue;
        }

        const pollData: XaiVideoStatusResponse = await pollResponse.json();
        logOps("Poll status:", pollData.status);

        if (pollData.status === "failed") {
            throw new HttpError(
                `xAI video generation failed: ${pollData.error ?? "unknown error"}`,
                500,
            );
        }

        if (pollData.status === "done" || pollData.status === "succeeded") {
            if (!pollData.video?.url) {
                throw new HttpError(
                    "xAI video succeeded but returned no URL",
                    500,
                );
            }

            logOps("Downloading video from:", pollData.video.url);
            progress.updateBar(
                requestId,
                90,
                "Processing",
                "Downloading video...",
            );

            const downloadResponse = await fetch(pollData.video.url);
            if (!downloadResponse.ok) {
                throw new HttpError(
                    `Failed to download xAI video: ${downloadResponse.status}`,
                    500,
                );
            }

            const buffer = Buffer.from(await downloadResponse.arrayBuffer());
            logOps(
                `Video downloaded, size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`,
            );
            return { buffer, duration: pollData.video.duration };
        }

        await sleep(delayMs);
        delayMs = Math.min(delayMs * 1.2, 15000);
    }

    throw new HttpError("xAI video generation timed out after 3 minutes", 504);
}
