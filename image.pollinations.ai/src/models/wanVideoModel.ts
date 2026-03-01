import debug from "debug";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import { sleep } from "../util.ts";
import { downloadImageAsBase64 } from "../utils/imageDownload.ts";
import { calculateVideoResolution } from "../utils/videoResolution.ts";

const logOps = debug("pollinations:wan:ops");
const logError = debug("pollinations:wan:error");

// API Configuration
const DASHSCOPE_API_BASE = "https://dashscope-intl.aliyuncs.com/api/v1";
const WAN_T2V_MODEL = "wan2.6-t2v";
const WAN_I2V_MODEL = "wan2.6-i2v-flash";

// Video generation constraints
const MIN_DURATION_SECONDS = 2;
const MAX_DURATION_SECONDS = 15;
const DEFAULT_DURATION_SECONDS = 5;
const DEFAULT_RESOLUTION = "720P"; // Supports 480P, 720P, 1080P

// Polling configuration for Alibaba DashScope
const POLL_MAX_ATTEMPTS = 60; // 5 minutes max
const POLL_DELAY_MS = 5000; // 5 second intervals

interface WanTaskResponse {
    output?: {
        task_id: string;
        task_status: string;
    };
    request_id?: string;
    code?: string;
    message?: string;
}

interface WanTaskResult {
    output?: {
        task_id: string;
        task_status: string;
        video_url?: string;
        code?: string;
        message?: string;
    };
    request_id?: string;
    usage?: {
        video_count?: number;
        video_duration?: number;
    };
    code?: string;
    message?: string;
}

interface DashScopeRequest {
    model: string;
    input: { prompt: string; img_url?: string };
    parameters: {
        resolution: string;
        duration: number;
        prompt_extend: boolean;
        audio: boolean;
    };
}

/**
 * Generates a video using Alibaba DashScope API (wan-2.6)
 * Supports both text-to-video and image-to-video with optional audio
 */
export async function callWanAPI(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<VideoGenerationResult> {
    return await callWanAlibabaAPI(prompt, safeParams, progress, requestId);
}

/**
 * Prepare video generation parameters with resolution calculation
 */
function prepareVideoParameters(safeParams: ImageParams) {
    const rawDuration = safeParams.duration || DEFAULT_DURATION_SECONDS;
    const durationSeconds = Math.max(
        MIN_DURATION_SECONDS,
        Math.min(MAX_DURATION_SECONDS, rawDuration),
    );

    const { aspectRatio, resolution } = calculateVideoResolution({
        width: safeParams.width,
        height: safeParams.height,
        aspectRatio: safeParams.aspectRatio,
        defaultResolution: DEFAULT_RESOLUTION,
    });

    return {
        durationSeconds,
        resolution,
        aspectRatio,
        generateAudio: safeParams.audio !== false,
    };
}

/**
 * Extract the first image from params if available
 */
function extractFirstImage(image: ImageParams["image"]): string | undefined {
    if (!image) return undefined;
    return Array.isArray(image) ? image[0] : image;
}

/**
 * Create standardized video generation result
 */
function createVideoResult(
    buffer: Buffer,
    videoParams: ReturnType<typeof prepareVideoParameters>,
    actualDuration?: number,
): VideoGenerationResult {
    const duration = actualDuration || videoParams.durationSeconds;
    return {
        buffer,
        mimeType: "video/mp4",
        durationSeconds: videoParams.durationSeconds,
        trackingData: {
            actualModel: "wan",
            usage: {
                completionVideoSeconds: duration,
                completionAudioSeconds: videoParams.generateAudio
                    ? duration
                    : 0,
            },
        },
    };
}

/**
 * Download video from URL
 */
async function downloadVideo(
    videoUrl: string,
    progress: ProgressManager,
    requestId: string,
): Promise<Buffer> {
    progress.updateBar(requestId, 90, "Processing", "Downloading video...");

    const response = await fetch(videoUrl);
    if (!response.ok) {
        throw new HttpError(
            `Failed to download video: ${response.status}`,
            500,
        );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    logOps(
        `Video downloaded, size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`,
    );
    progress.updateBar(requestId, 95, "Success", "Video generation completed");

    return buffer;
}

/**
 * Generates a video using Alibaba DashScope API (wan-2.6)
 * Supports both text-to-video and image-to-video with optional audio
 */
async function callWanAlibabaAPI(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<VideoGenerationResult> {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
        throw new HttpError(
            "DASHSCOPE_API_KEY environment variable is required for Wan model",
            500,
        );
    }

    const videoParams = prepareVideoParameters(safeParams);
    const rawImageUrl = extractFirstImage(safeParams.image);
    const mode = rawImageUrl ? "I2V" : "T2V";

    logOps(`Calling Wan 2.6 API (DashScope ${mode}) with params:`, {
        prompt,
        ...videoParams,
        hasImage: !!rawImageUrl,
    });

    progress.updateBar(
        requestId,
        35,
        "Processing",
        `Starting video generation with Wan 2.6 (${mode})...`,
    );

    // Download image and convert to base64 data URI for reliability
    // (DashScope can't fetch URLs that redirect or require special headers)
    let imageDataUri: string | undefined;
    if (rawImageUrl) {
        logOps("Downloading image for base64 encoding:", rawImageUrl);
        const { base64, mimeType } = await downloadImageAsBase64(rawImageUrl);
        imageDataUri = `data:${mimeType};base64,${base64}`;
        logOps("Image downloaded and encoded, mimeType:", mimeType);
    }

    const requestBody = buildDashScopeRequest(
        prompt,
        imageDataUri,
        videoParams,
    );
    logRequestSafely(requestBody);

    const taskId = await createDashScopeTask(
        apiKey,
        requestBody,
        progress,
        requestId,
    );
    const result = await pollWanTask(taskId, apiKey, progress, requestId);
    return createVideoResult(
        result.buffer,
        videoParams,
        result.usage.video_duration,
    );
}

/**
 * Build request body for DashScope API (T2V or I2V)
 */
function buildDashScopeRequest(
    prompt: string,
    imageUrl: string | undefined,
    videoParams: ReturnType<typeof prepareVideoParameters>,
): DashScopeRequest {
    return {
        model: imageUrl ? WAN_I2V_MODEL : WAN_T2V_MODEL,
        input: imageUrl
            ? { prompt, img_url: prepareImageUrl(imageUrl) }
            : { prompt },
        parameters: {
            resolution: videoParams.resolution,
            duration: videoParams.durationSeconds,
            prompt_extend: true,
            audio: videoParams.generateAudio,
        },
    };
}

/**
 * Validate image URL for DashScope (accepts HTTP/HTTPS URLs and base64 data URIs)
 */
function prepareImageUrl(imageUrl: string): string {
    if (
        imageUrl.startsWith("http://") ||
        imageUrl.startsWith("https://") ||
        imageUrl.startsWith("data:")
    ) {
        return imageUrl;
    }
    throw new HttpError(
        "Invalid image URL: must be http/https or data URI",
        400,
    );
}

/**
 * Log request safely (hide base64 data)
 */
function logRequestSafely(requestBody: DashScopeRequest): void {
    const safeRequest = {
        ...requestBody,
        input: {
            ...requestBody.input,
            img_url: requestBody.input.img_url?.startsWith("data:")
                ? "[base64]"
                : requestBody.input.img_url,
        },
    };
    logOps("DashScope API request:", JSON.stringify(safeRequest, null, 2));
}

/**
 * Create a video generation task with DashScope API
 */
async function createDashScopeTask(
    apiKey: string,
    requestBody: DashScopeRequest,
    progress: ProgressManager,
    requestId: string,
): Promise<string> {
    progress.updateBar(
        requestId,
        45,
        "Processing",
        "Initiating video generation...",
    );

    const response = await fetch(
        `${DASHSCOPE_API_BASE}/services/aigc/video-generation/video-synthesis`,
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "X-DashScope-Async": "enable",
            },
            body: JSON.stringify(requestBody),
        },
    );

    if (!response.ok) {
        const errorText = await response.text();
        logError("DashScope API failed:", response.status, errorText);
        throw new HttpError(
            `DashScope API request failed: ${errorText}`,
            response.status,
        );
    }

    const data: WanTaskResponse = await response.json();
    logOps("Task creation response:", JSON.stringify(data, null, 2));

    if (data.code) {
        throw new HttpError(
            `DashScope API error: ${data.message || data.code}`,
            400,
        );
    }

    const taskId = data.output?.task_id;
    if (!taskId) {
        throw new HttpError("DashScope API did not return task ID", 500);
    }

    progress.updateBar(
        requestId,
        50,
        "Processing",
        "Generating video (this takes 1-5 minutes)...",
    );
    return taskId;
}

/**
 * Poll DashScope task until completion
 */
async function pollWanTask(
    taskId: string,
    apiKey: string,
    progress: ProgressManager,
    requestId: string,
): Promise<{ buffer: Buffer; usage: { video_duration: number } }> {
    const pollUrl = `${DASHSCOPE_API_BASE}/tasks/${taskId}`;
    logOps("Polling task:", taskId);

    for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++) {
        const pollResult = await pollTaskOnce(
            pollUrl,
            apiKey,
            attempt,
            progress,
            requestId,
        );

        if (pollResult.status === "completed") {
            const buffer = await downloadVideo(
                pollResult.videoUrl,
                progress,
                requestId,
            );
            return {
                buffer,
                usage: { video_duration: pollResult.videoDuration },
            };
        }

        if (pollResult.status === "failed") {
            throw new HttpError(pollResult.error, 500);
        }

        await sleep(POLL_DELAY_MS);
    }

    throw new HttpError("Video generation timed out after 5 minutes", 504);
}

/**
 * Poll task once and return status
 */
async function pollTaskOnce(
    pollUrl: string,
    apiKey: string,
    attempt: number,
    progress: ProgressManager,
    requestId: string,
): Promise<{
    status: "pending" | "completed" | "failed";
    videoUrl?: string;
    videoDuration?: number;
    error?: string;
}> {
    logOps(`Poll attempt ${attempt}/${POLL_MAX_ATTEMPTS}...`);

    const progressPercent = 50 + Math.min(40, Math.floor(attempt * 0.7));
    progress.updateBar(
        requestId,
        progressPercent,
        "Processing",
        `Generating video... (${attempt}/${POLL_MAX_ATTEMPTS})`,
    );

    const response = await fetch(pollUrl, {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
        },
    });

    if (!response.ok) {
        const errorText = await response.text();
        logError("Poll error:", response.status, errorText);
        // Fail fast on client errors (4xx) - auth failures, bad requests won't self-resolve
        if (response.status >= 400 && response.status < 500) {
            return {
                status: "failed",
                error: `DashScope poll failed (${response.status}): ${errorText}`,
            };
        }
        return { status: "pending" }; // Retry on server errors (5xx) / network issues
    }

    const data: WanTaskResult = await response.json();
    logOps("Poll response:", JSON.stringify(data, null, 2));

    const taskStatus = data.output?.task_status?.toUpperCase();
    logOps("Task status:", taskStatus);

    switch (taskStatus) {
        case "SUCCEEDED":
            if (!data.output?.video_url) {
                throw new HttpError("No video URL in completed response", 500);
            }
            return {
                status: "completed",
                videoUrl: data.output.video_url,
                videoDuration: data.usage?.video_duration || 0,
            };

        case "FAILED":
            return {
                status: "failed",
                error:
                    data.output?.message ||
                    data.message ||
                    "Video generation failed",
            };

        case "CANCELED":
            return {
                status: "failed",
                error: "Video generation was canceled",
            };

        default:
            return { status: "pending" };
    }
}
