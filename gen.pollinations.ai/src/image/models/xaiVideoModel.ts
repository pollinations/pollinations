import debug from "debug";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { getImageEnv } from "../env.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import { sleep } from "../util.ts";
import { ASPECT_RATIOS, closestAspectRatio } from "../utils/aspectRatio.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";

const logOps = debug("pollinations:xai-video:ops");
const logError = debug("pollinations:xai-video:error");

const XAI_VIDEO_API_URL = "https://api.x.ai/v1/videos/generations";
const XAI_VIDEO_POLL_URL = "https://api.x.ai/v1/videos";

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
): Promise<VideoGenerationResult> {
    const apiKey = getImageEnv("XAI_API_KEY");
    if (!apiKey) {
        throw new HttpError(
            "XAI_API_KEY environment variable is required",
            500,
        );
    }

    const durationSeconds = Math.min(Math.max(safeParams.duration || 5, 1), 15);

    logOps("Calling xAI video API:", { prompt, durationSeconds });

    const requestBody: Record<string, unknown> = {
        model: "grok-imagine-video",
        prompt,
        resolution: "720p",
        duration: durationSeconds,
    };

    // When the caller passed explicit width/height, derive the aspect ratio
    // from them. Otherwise honor an explicit `aspectRatio` param directly —
    // params.ts fills width/height with a square default when dims are omitted,
    // which would otherwise collapse every preset to 1:1.
    const aspectRatio =
        safeParams.dimensionsExplicit || !safeParams.aspectRatio
            ? closestAspectRatio(safeParams.width, safeParams.height)
            : ASPECT_RATIOS.some((ar) => ar.label === safeParams.aspectRatio)
              ? safeParams.aspectRatio
              : closestAspectRatio(safeParams.width, safeParams.height);
    if (aspectRatio) requestBody.aspect_ratio = aspectRatio;

    if (safeParams.image?.length) {
        requestBody.image = { url: safeParams.image[0] };
    }

    logOps("Request body:", JSON.stringify(requestBody));

    const submitResponse = await fetchUpstream(XAI_VIDEO_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        errorLabel: "xAI video generation request failed",
    });

    const submitData = (await submitResponse.json()) as {
        id?: string;
        request_id?: string;
    };
    const videoId = submitData.id ?? submitData.request_id;

    if (!videoId) {
        throw new HttpError(
            "xAI video API did not return a request ID",
            500,
            undefined,
            XAI_VIDEO_API_URL,
        );
    }

    logOps("Video generation submitted, ID:", videoId);

    const result = await pollXaiVideoStatus(videoId, apiKey);

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
): Promise<{ buffer: Buffer; duration?: number }> {
    const maxAttempts = 90; // 3 minutes max
    let delayMs = 3000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        logOps(
            `Poll attempt ${attempt}/${maxAttempts} for video ${videoId}...`,
        );

        const pollUrl = `${XAI_VIDEO_POLL_URL}/${videoId}`;
        const pollResponse = await fetch(pollUrl, {
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
                    undefined,
                    pollUrl,
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
                502,
                undefined,
                pollUrl,
            );
        }

        if (pollData.status === "done" || pollData.status === "succeeded") {
            if (!pollData.video?.url) {
                throw new HttpError(
                    "xAI video succeeded but returned no URL",
                    500,
                    undefined,
                    pollUrl,
                );
            }

            logOps("Downloading video from:", pollData.video.url);

            const downloadResponse = await fetchUpstream(pollData.video.url, {
                errorLabel: "Failed to download xAI video",
            });
            const buffer = Buffer.from(await downloadResponse.arrayBuffer());
            logOps(
                `Video downloaded, size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`,
            );
            return { buffer, duration: pollData.video.duration };
        }

        await sleep(delayMs);
        delayMs = Math.min(delayMs * 1.2, 15000);
    }

    throw new HttpError(
        "xAI video generation timed out after 3 minutes",
        504,
        undefined,
        `${XAI_VIDEO_POLL_URL}/${videoId}`,
    );
}
