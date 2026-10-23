import { UpstreamError } from "@shared/error.ts";
import debug from "debug";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { sleep } from "../util.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import {
    resolveGrokAspectRatio,
    resolveGrokDuration,
} from "./openRouterVideoModel.ts";

const logOps = debug("pollinations:xai-video:ops");

const XAI_VIDEO_URL = "https://api.x.ai/v1/videos";
const XAI_UPSTREAM_MODEL = "grok-imagine-video-1.5-lite";
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 3 * 60 * 1000;

interface XaiVideoStatus {
    status: "pending" | "done" | "expired" | "failed";
    video?: {
        url?: string;
        duration?: number;
        respect_moderation?: boolean;
    };
    error?: { code?: string; message?: string };
}

async function pollXaiVideo(
    requestId: string,
    apiKey: string,
): Promise<XaiVideoStatus> {
    const url = `${XAI_VIDEO_URL}/${requestId}`;
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (response.ok) {
            const result = (await response.json()) as XaiVideoStatus;
            if (result.status === "done") return result;
            if (result.status === "failed" || result.status === "expired") {
                const invalidInput = result.error?.code === "invalid_argument";
                throw UpstreamError.fromProvider(invalidInput ? 400 : 502, {
                    message: `xAI video generation ${result.status}: ${result.error?.message ?? "unknown error"}`,
                    responseBody: JSON.stringify(result),
                    requestUrl: new URL(url),
                });
            }
        } else if (
            response.status !== 429 &&
            response.status >= 400 &&
            response.status < 500
        ) {
            const body = await response.text();
            throw UpstreamError.fromProvider(response.status, {
                message: `xAI video poll failed: ${body}`,
                responseBody: body,
                requestUrl: new URL(url),
            });
        }
        await sleep(Math.min(POLL_INTERVAL_MS, deadline - Date.now()));
    }

    throw UpstreamError.fromProvider(504, {
        message: "xAI video generation timed out",
        requestUrl: new URL(url),
    });
}

/**
 * xAI direct video API for Grok Imagine Video 1.5 Lite. Requests are
 * asynchronous: submit, poll the request id, then download the temporary URL.
 */
export async function callXaiVideoAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> {
    const apiKey = getImageEnv("XAI_API_KEY");
    if (!apiKey) {
        throw UpstreamError.fromProvider(500, {
            message: "XAI_API_KEY environment variable is required",
        });
    }

    const duration = resolveGrokDuration(safeParams.duration);
    const startFrame = safeParams.image?.[0];
    const requestBody: Record<string, unknown> = {
        model: XAI_UPSTREAM_MODEL,
        prompt,
        duration,
        resolution: safeParams.resolution ?? "720p",
    };
    // An image-to-video request keeps the image's own ratio; sending one
    // would stretch the frame.
    if (startFrame) {
        requestBody.image = { url: startFrame };
    } else {
        const aspectRatio = resolveGrokAspectRatio(safeParams);
        if (aspectRatio) requestBody.aspect_ratio = aspectRatio;
    }

    const submitUrl = `${XAI_VIDEO_URL}/generations`;
    const submitResponse = await fetchUpstream(submitUrl, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        errorLabel: "xAI video generation request failed",
    });
    const submitted = (await submitResponse.json()) as { request_id?: string };
    if (!submitted.request_id) {
        throw UpstreamError.fromProvider(502, {
            message: "xAI video API did not return a request id",
            responseBody: JSON.stringify(submitted),
            requestUrl: new URL(submitUrl),
        });
    }

    const completed = await pollXaiVideo(submitted.request_id, apiKey);
    const video = completed.video;
    if (video?.respect_moderation === false) {
        throw UpstreamError.fromProvider(400, {
            message: "xAI filtered the generated video by moderation",
            errorCode: "content_policy_violation",
            responseBody: JSON.stringify(completed),
            requestUrl: new URL(submitUrl),
        });
    }
    if (!video?.url) {
        throw UpstreamError.fromProvider(502, {
            message: "xAI video completed without a download URL",
            responseBody: JSON.stringify(completed),
            requestUrl: new URL(submitUrl),
        });
    }

    const downloadResponse = await fetchUpstream(video.url, {
        errorLabel: "Failed to download xAI video",
    });
    const buffer = Buffer.from(await downloadResponse.arrayBuffer());
    // Bill the duration xAI reports for the finished video.
    const billedSeconds =
        Number.isFinite(video.duration) && (video.duration as number) > 0
            ? (video.duration as number)
            : duration;

    logOps("xAI video generation complete", {
        duration: billedSeconds,
        bufferSize: buffer.length,
    });

    return {
        buffer,
        mimeType: "video/mp4",
        durationSeconds: billedSeconds,
        trackingData: {
            actualModel: safeParams.model,
            usage: {
                ...(startFrame ? { promptImageTokens: 1 } : {}),
                completionVideoSeconds: billedSeconds,
            },
        },
    };
}
