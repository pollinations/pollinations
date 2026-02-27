import sleep from "await-sleep";
import debug from "debug";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import type { VideoGenerationResult } from "./veoVideoModel.ts";

const logOps = debug("pollinations:xai-video:ops");
const logError = debug("pollinations:xai-video:error");

const XAI_VIDEO_API_URL = "https://api.x.ai/v1/videos/generations";
const XAI_VIDEO_POLL_URL = "https://api.x.ai/v1/videos";

/**
 * Maps width/height to xAI video resolution string.
 * xAI supports "480p", "720p", and "1080p".
 * maxResolution caps the output (e.g. "720p" for standard, "1080p" for HD).
 */
function toResolution(
    width: number | undefined,
    height: number | undefined,
    maxResolution: "480p" | "720p" | "1080p" = "720p",
): "480p" | "720p" | "1080p" {
    const minDim = Math.min(width ?? 720, height ?? 720);
    if (maxResolution === "1080p" && minDim >= 900) return "1080p";
    if (minDim >= 540) return "720p";
    return "480p";
}

interface XaiVideoStatusResponse {
    id: string;
    status: "pending" | "processing" | "succeeded" | "failed";
    video?: {
        url: string;
    };
    error?: string;
}

/**
 * Generates a video using the official xAI video API (grok-imagine-video).
 * The API is async: submit → poll until succeeded → download result.
 */
export async function callXaiVideoAPI(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
    maxResolution: "480p" | "720p" | "1080p" = "720p",
): Promise<VideoGenerationResult> {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
        throw new HttpError(
            "XAI_API_KEY environment variable is required",
            500,
        );
    }

    const durationSeconds = safeParams.duration || 5;
    const resolution = toResolution(
        safeParams.width,
        safeParams.height,
        maxResolution,
    );

    logOps("Calling xAI video API:", { prompt, resolution, durationSeconds });
    progress.updateBar(
        requestId,
        30,
        "Processing",
        "Submitting video generation request...",
    );

    // Step 1: Submit video generation request
    const requestBody: Record<string, unknown> = {
        model: "grok-imagine-video",
        prompt,
        resolution,
    };

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

    // Step 2: Poll for completion
    const videoBuffer = await pollXaiVideoStatus(
        videoId,
        apiKey,
        progress,
        requestId,
    );

    progress.updateBar(requestId, 95, "Success", "Video generation completed");

    return {
        buffer: videoBuffer,
        mimeType: "video/mp4",
        durationSeconds,
        trackingData: {
            actualModel: "grok-video-pro",
            usage: {
                completionVideoSeconds: durationSeconds,
            },
        },
    };
}

async function pollXaiVideoStatus(
    videoId: string,
    apiKey: string,
    progress: ProgressManager,
    requestId: string,
): Promise<Buffer> {
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

        if (pollData.status === "succeeded") {
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
                "Video downloaded, size:",
                (buffer.length / 1024 / 1024).toFixed(2),
                "MB",
            );
            return buffer;
        }

        // Still pending or processing
        await sleep(delayMs);
        delayMs = Math.min(delayMs * 1.2, 15000);
    }

    throw new HttpError("xAI video generation timed out after 3 minutes", 504);
}
