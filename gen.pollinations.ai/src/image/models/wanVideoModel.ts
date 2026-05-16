import debug from "debug";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { getImageEnv } from "../env.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import { sleep } from "../util.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import { downloadUserImage } from "../utils/imageDownload.ts";
import { calculateVideoResolution } from "../utils/videoResolution.ts";

const logOps = debug("pollinations:wan:ops");
const logError = debug("pollinations:wan:error");

// API Configuration
const DASHSCOPE_API_BASE = "https://dashscope-intl.aliyuncs.com/api/v1";

interface WanModelConfig {
    t2vModel: string;
    i2vModel: string;
    /** Optional first-and-last-frame-to-video model id. Undefined = no kf2v support. */
    kf2vModel?: string;
    minDuration: number;
    maxDuration: number;
    defaultDuration: number;
    defaultResolution: "480P" | "720P" | "1080P";
    trackingName: string;
    displayName: string;
}

const WAN_26_CONFIG: WanModelConfig = {
    t2vModel: "wan2.6-t2v",
    i2vModel: "wan2.6-i2v-flash",
    // Wan 2.6 has no documented kf2v variant — image[1] silently dropped.
    minDuration: 2,
    maxDuration: 15,
    defaultDuration: 5,
    defaultResolution: "720P",
    trackingName: "wan",
    displayName: "Wan 2.6",
};

const WAN_22_CONFIG: WanModelConfig = {
    t2vModel: "wan2.2-t2v-plus",
    i2vModel: "wan2.2-i2v-flash",
    kf2vModel: "wan2.2-kf2v-flash",
    minDuration: 5,
    maxDuration: 5,
    defaultDuration: 5,
    defaultResolution: "480P",
    trackingName: "wan-fast",
    displayName: "Wan 2.2",
};

// kf2v uses a different DashScope endpoint than i2v/t2v
const DASHSCOPE_KF2V_PATH = "/services/aigc/image2video/video-synthesis";
const DASHSCOPE_VIDEO_PATH = "/services/aigc/video-generation/video-synthesis";

// Polling configuration for Alibaba DashScope
const POLL_MAX_ATTEMPTS = 60; // 5 minutes max
const POLL_DELAY_MS = 5000; // 5 second intervals

function getDashScopeErrorStatus(message: string): number {
    const lower = message.toLowerCase();
    if (
        lower.includes("content filter") ||
        lower.includes("invalid") ||
        lower.includes("validation") ||
        lower.includes("not support")
    ) {
        return 400;
    }
    if (lower.includes("rate limit") || lower.includes("throttl")) {
        return 429;
    }
    return 500;
}

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
    input: {
        prompt: string;
        img_url?: string;
        first_frame_url?: string;
        last_frame_url?: string;
    };
    parameters: {
        resolution: string;
        duration: number;
        prompt_extend: boolean;
        audio?: boolean;
    };
}

/**
 * Generates a video using Alibaba DashScope API (wan-2.6)
 */
export async function callWanAPI(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<VideoGenerationResult> {
    return await callWanAlibabaAPI(
        prompt,
        safeParams,
        progress,
        requestId,
        WAN_26_CONFIG,
    );
}

/**
 * Generates a video using Alibaba DashScope API (wan-2.2, faster/cheaper)
 */
export async function callWanFastAPI(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<VideoGenerationResult> {
    return await callWanAlibabaAPI(
        prompt,
        safeParams,
        progress,
        requestId,
        WAN_22_CONFIG,
    );
}

/**
 * Prepare video generation parameters with resolution calculation.
 * kf2v has fixed 5s duration and does not produce audio.
 */
function prepareVideoParameters(
    safeParams: ImageParams,
    config: WanModelConfig,
    useKf2v = false,
) {
    const rawDuration = safeParams.duration || config.defaultDuration;
    const durationSeconds = useKf2v
        ? 5
        : Math.max(
              config.minDuration,
              Math.min(config.maxDuration, rawDuration),
          );

    const { aspectRatio, resolution } = calculateVideoResolution({
        width: safeParams.width,
        height: safeParams.height,
        aspectRatio: safeParams.aspectRatio,
        defaultResolution: config.defaultResolution,
    });

    return {
        durationSeconds,
        resolution,
        aspectRatio,
        generateAudio: !useKf2v && safeParams.audio !== false,
    };
}

/**
 * Extract start/end frame URLs from positional image[] param.
 * image[0] = start frame, image[1] = end frame.
 */
function extractFrames(image: ImageParams["image"]): {
    first?: string;
    last?: string;
} {
    if (!image) return {};
    const arr = Array.isArray(image) ? image : [image];
    return { first: arr[0], last: arr[1] };
}

/**
 * Create standardized video generation result
 */
function createVideoResult(
    buffer: Buffer,
    videoParams: ReturnType<typeof prepareVideoParameters>,
    config: WanModelConfig,
    actualDuration?: number,
): VideoGenerationResult {
    const duration = actualDuration || videoParams.durationSeconds;
    return {
        buffer,
        mimeType: "video/mp4",
        durationSeconds: videoParams.durationSeconds,
        trackingData: {
            actualModel: config.trackingName,
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

    const response = await fetchUpstream(videoUrl, {
        errorLabel: "Failed to download video",
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    logOps(
        `Video downloaded, size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`,
    );
    progress.updateBar(requestId, 95, "Success", "Video generation completed");

    return buffer;
}

/**
 * Generates a video using Alibaba DashScope API
 * Supports both text-to-video and image-to-video with optional audio
 */
async function callWanAlibabaAPI(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
    config: WanModelConfig,
): Promise<VideoGenerationResult> {
    const apiKey = getImageEnv("DASHSCOPE_API_KEY");
    if (!apiKey) {
        throw new HttpError(
            "DASHSCOPE_API_KEY environment variable is required for Wan model",
            500,
        );
    }

    const { first: firstFrameUrl, last: lastFrameUrl } = extractFrames(
        safeParams.image,
    );
    // kf2v is only used when the model variant supports it AND we have both frames.
    const useKf2v = !!(config.kf2vModel && firstFrameUrl && lastFrameUrl);
    const videoParams = prepareVideoParameters(safeParams, config, useKf2v);
    const mode = useKf2v ? "KF2V" : firstFrameUrl ? "I2V" : "T2V";

    logOps(
        `Calling ${config.displayName} API (DashScope ${mode}) with params:`,
        {
            prompt,
            ...videoParams,
            hasFirstFrame: !!firstFrameUrl,
            hasLastFrame: !!lastFrameUrl,
        },
    );

    progress.updateBar(
        requestId,
        35,
        "Processing",
        `Starting video generation with ${config.displayName} (${mode})...`,
    );

    // Download image(s) and convert to base64 data URI for reliability
    // (DashScope can't fetch URLs that redirect or require special headers)
    const toDataUri = async (url: string): Promise<string> => {
        logOps("Downloading image for base64 encoding:", url);
        const { buffer, mimeType } = await downloadUserImage(url);
        return `data:${mimeType};base64,${buffer.toString("base64")}`;
    };
    const firstDataUri = firstFrameUrl
        ? await toDataUri(firstFrameUrl)
        : undefined;
    const lastDataUri =
        useKf2v && lastFrameUrl ? await toDataUri(lastFrameUrl) : undefined;

    const requestBody = buildDashScopeRequest(
        prompt,
        firstDataUri,
        lastDataUri,
        videoParams,
        config,
        useKf2v,
    );
    logRequestSafely(requestBody);

    const taskId = await createDashScopeTask(
        apiKey,
        requestBody,
        progress,
        requestId,
        useKf2v,
    );
    const result = await pollWanTask(taskId, apiKey, progress, requestId);
    return createVideoResult(
        result.buffer,
        videoParams,
        config,
        result.usage.video_duration,
    );
}

/**
 * Build request body for DashScope API (T2V, I2V, or KF2V)
 */
function buildDashScopeRequest(
    prompt: string,
    firstFrameUrl: string | undefined,
    lastFrameUrl: string | undefined,
    videoParams: ReturnType<typeof prepareVideoParameters>,
    config: WanModelConfig,
    useKf2v: boolean,
): DashScopeRequest {
    if (useKf2v) {
        // kf2v requires both frames, fixed 5s duration, and does not accept `audio`
        if (!config.kf2vModel || !firstFrameUrl || !lastFrameUrl) {
            throw new HttpError(
                `${config.displayName} does not support first+last frame mode`,
                400,
            );
        }
        return {
            model: config.kf2vModel,
            input: {
                prompt,
                first_frame_url: prepareImageUrl(firstFrameUrl),
                last_frame_url: prepareImageUrl(lastFrameUrl),
            },
            parameters: {
                resolution: videoParams.resolution,
                duration: videoParams.durationSeconds,
                prompt_extend: true,
            },
        };
    }
    return {
        model: firstFrameUrl ? config.i2vModel : config.t2vModel,
        input: firstFrameUrl
            ? { prompt, img_url: prepareImageUrl(firstFrameUrl) }
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
    const mask = (url?: string) =>
        url?.startsWith("data:") ? "[base64]" : url;
    const safeRequest = {
        ...requestBody,
        input: {
            ...requestBody.input,
            img_url: mask(requestBody.input.img_url),
            first_frame_url: mask(requestBody.input.first_frame_url),
            last_frame_url: mask(requestBody.input.last_frame_url),
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
    useKf2v = false,
): Promise<string> {
    progress.updateBar(
        requestId,
        45,
        "Processing",
        "Initiating video generation...",
    );

    const path = useKf2v ? DASHSCOPE_KF2V_PATH : DASHSCOPE_VIDEO_PATH;
    const submitUrl = `${DASHSCOPE_API_BASE}${path}`;
    const response = await fetchUpstream(submitUrl, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "X-DashScope-Async": "enable",
        },
        body: JSON.stringify(requestBody),
        errorLabel: "DashScope API request failed",
    });

    const data: WanTaskResponse = await response.json();
    logOps("Task creation response:", JSON.stringify(data, null, 2));

    if (data.code) {
        throw new HttpError(
            `DashScope API error: ${data.message || data.code}`,
            400,
            undefined,
            submitUrl,
        );
    }

    const taskId = data.output?.task_id;
    if (!taskId) {
        throw new HttpError(
            "DashScope API did not return task ID",
            500,
            undefined,
            submitUrl,
        );
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
            throw new HttpError(
                pollResult.error,
                getDashScopeErrorStatus(pollResult.error),
                undefined,
                pollUrl,
            );
        }

        await sleep(POLL_DELAY_MS);
    }

    throw new HttpError(
        "Video generation timed out after 5 minutes",
        504,
        undefined,
        pollUrl,
    );
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
): Promise<
    | { status: "pending" }
    | { status: "completed"; videoUrl: string; videoDuration: number }
    | { status: "failed"; error: string }
> {
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
                throw new HttpError(
                    "No video URL in completed response",
                    500,
                    undefined,
                    pollUrl,
                );
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
