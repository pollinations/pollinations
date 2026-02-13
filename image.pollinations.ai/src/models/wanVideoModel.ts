// Legacy imports (used only by deprecated callWanAlibabaAPI)
import sleep from "await-sleep";
import debug from "debug";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import { downloadImageAsBase64 } from "../utils/imageDownload.ts";

const logOps = debug("pollinations:wan:ops");
const logError = debug("pollinations:wan:error");

// API Configuration
const AIRFORCE_API_BASE = "https://api.airforce/v1";
const AIRFORCE_WAN_MODEL = "wan-2.6";
const DASHSCOPE_API_BASE = "https://dashscope-intl.aliyuncs.com/api/v1";
const WAN_I2V_MODEL = "wan2.6-i2v-flash";

// Video generation constraints
const MIN_DURATION_SECONDS = 2;
const MAX_DURATION_SECONDS = 15;
const DEFAULT_DURATION_SECONDS = 5;
const DEFAULT_RESOLUTION = "720P";

// Polling configuration
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

interface AirforceVideoResponse {
    created: number;
    data: Array<{
        url: string | null;
        b64_json: string | null;
    }>;
}

interface DashScopeRequest {
    model: string;
    input: { prompt: string; img_url: string };
    parameters: {
        resolution: string;
        duration: number;
        prompt_extend: boolean;
        audio: boolean;
    };
}

/**
 * Generates a video using Airforce API (wan-2.6)
 * Supports both text-to-video and image-to-video with optional audio
 */
export async function callWanAPI(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<VideoGenerationResult> {
    const apiKey = process.env.AIRFORCE_API_KEY;
    if (!apiKey) {
        throw new HttpError(
            "AIRFORCE_API_KEY environment variable is required for Wan model",
            500,
        );
    }

    const videoParams = prepareVideoParameters(safeParams);
    const imageUrl = extractFirstImage(safeParams.image);

    logOps("Calling Wan 2.6 API (Airforce) with params:", {
        prompt,
        ...videoParams,
        hasImage: !!imageUrl,
        model: AIRFORCE_WAN_MODEL,
    });

    progress.updateBar(
        requestId,
        35,
        "Processing",
        "Starting video generation with Wan 2.6...",
    );

    const requestBody = buildAirforceRequest(prompt, videoParams, imageUrl);

    logOps("Airforce API request:", JSON.stringify(requestBody, null, 2));

    progress.updateBar(
        requestId,
        45,
        "Processing",
        "Initiating video generation...",
    );

    const videoUrl = await streamAirforceResponse(
        apiKey,
        requestBody,
        progress,
        requestId,
    );

    const videoBuffer = await downloadVideo(videoUrl, progress, requestId);

    return {
        buffer: videoBuffer,
        mimeType: "video/mp4",
        durationSeconds: videoParams.durationSeconds,
        trackingData: {
            actualModel: "wan",
            usage: {
                completionVideoSeconds: videoParams.durationSeconds,
                completionAudioSeconds: videoParams.generateAudio
                    ? videoParams.durationSeconds
                    : 0,
            },
        },
    };
}

/**
 * Helper function to prepare video generation parameters
 */
function prepareVideoParameters(safeParams: ImageParams): {
    durationSeconds: number;
    resolution: string;
    generateAudio: boolean;
} {
    const rawDuration = safeParams.duration || DEFAULT_DURATION_SECONDS;
    const durationSeconds = Math.max(
        MIN_DURATION_SECONDS,
        Math.min(MAX_DURATION_SECONDS, rawDuration),
    );
    const generateAudio = safeParams.audio !== false;

    return {
        durationSeconds,
        resolution: DEFAULT_RESOLUTION,
        generateAudio,
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
 * Build request body for Airforce API
 */
function buildAirforceRequest(
    prompt: string,
    videoParams: ReturnType<typeof prepareVideoParameters>,
    imageUrl?: string,
): {
    model: string;
    prompt: string;
    n: number;
    size: string;
    response_format: string;
    sse: boolean;
    aspectRatio: string;
    duration: number;
    resolution: string;
    sound: boolean;
    image?: string;
} {
    const requestBody = {
        model: AIRFORCE_WAN_MODEL,
        prompt,
        n: 1,
        size: "1024x1024",
        response_format: "url",
        sse: true,
        aspectRatio: "16:9",
        duration: videoParams.durationSeconds,
        resolution: videoParams.resolution,
        sound: videoParams.generateAudio,
    };

    if (imageUrl) {
        return { ...requestBody, image: imageUrl };
    }

    return requestBody;
}

/**
 * Stream and parse SSE response from Airforce API
 */
async function streamAirforceResponse(
    apiKey: string,
    requestBody: ReturnType<typeof buildAirforceRequest>,
    progress: ProgressManager,
    requestId: string,
): Promise<string> {
    const endpoint = `${AIRFORCE_API_BASE}/images/generations`;

    // 5-minute timeout for video generation
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
        });

        if (!response.ok) {
            const errorText = await response.text();
            logError("Airforce API failed:", response.status, errorText);
            throw new HttpError(
                `Airforce API request failed: ${errorText}`,
                response.status,
            );
        }

        progress.updateBar(
            requestId,
            50,
            "Processing",
            "Generating video (streaming updates)...",
        );

        if (!response.body) {
            throw new HttpError("No response body from Airforce API", 500);
        }

        const videoUrl = await parseSSEStream(
            response.body,
            progress,
            requestId,
        );

        if (!videoUrl) {
            throw new HttpError("No video URL received from Airforce API", 500);
        }

        clearTimeout(timeoutId);
        return videoUrl;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === "AbortError") {
            throw new HttpError(
                "Video generation timed out after 5 minutes",
                504,
            );
        }
        throw error;
    }
}

/**
 * Parse Server-Sent Events stream from Airforce API
 */
async function parseSSEStream(
    body: ReadableStream<Uint8Array>,
    progress: ProgressManager,
    requestId: string,
): Promise<string | null> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let videoUrl: string | null = null;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine === ": keepalive") continue;

            if (trimmedLine === "data: [DONE]") {
                logOps("SSE stream completed");
                return videoUrl;
            }

            if (trimmedLine.startsWith("data: ")) {
                videoUrl = parseSSEData(
                    trimmedLine.slice(6),
                    progress,
                    requestId,
                );
            }
        }
    }

    return videoUrl;
}

/**
 * Parse individual SSE data message
 */
function parseSSEData(
    dataString: string,
    progress: ProgressManager,
    requestId: string,
): string | null {
    try {
        const data = JSON.parse(dataString) as AirforceVideoResponse;

        if (data.data?.[0]?.url) {
            const videoUrl = data.data[0].url;
            logOps("Video URL received:", videoUrl);

            progress.updateBar(
                requestId,
                80,
                "Processing",
                "Video generation completed, downloading...",
            );

            return videoUrl;
        }
    } catch (e) {
        logError("Failed to parse SSE data:", dataString, e);
    }

    return null;
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
    const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
    logOps(`Video downloaded, size: ${sizeMB} MB`);

    progress.updateBar(requestId, 95, "Success", "Video generation completed");

    return buffer;
}

/**
 * LEGACY: Generates a video using Alibaba Wan 2.6 API (DashScope)
 * Kept for potential future fallback implementation
 * @deprecated Use callWanAPI (Airforce) instead
 */
export async function callWanAlibabaAPI(
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
    const imageUrl = extractFirstImage(safeParams.image);

    if (!imageUrl) {
        throw new HttpError(
            "Wan model requires an image parameter for image-to-video generation",
            400,
        );
    }

    logOps("Calling Wan 2.6 API (DashScope) with params:", {
        prompt,
        ...videoParams,
        model: WAN_I2V_MODEL,
    });

    progress.updateBar(
        requestId,
        35,
        "Processing",
        "Starting video generation with Wan 2.6...",
    );

    const requestBody = await buildDashScopeRequest(
        prompt,
        imageUrl,
        videoParams,
        progress,
        requestId,
    );

    logRequestSafely(requestBody);

    const taskId = await createDashScopeTask(
        apiKey,
        requestBody,
        progress,
        requestId,
    );

    const result = await pollWanTask(taskId, apiKey, progress, requestId);

    const videoDuration =
        result.usage.video_duration || videoParams.durationSeconds;

    return {
        buffer: result.buffer,
        mimeType: "video/mp4",
        durationSeconds: videoParams.durationSeconds,
        trackingData: {
            actualModel: "wan",
            usage: {
                completionVideoSeconds: videoDuration,
                completionAudioSeconds: videoParams.generateAudio
                    ? videoDuration
                    : 0,
            },
        },
    };
}

/**
 * Build request body for DashScope API
 */
async function buildDashScopeRequest(
    prompt: string,
    imageUrl: string,
    videoParams: ReturnType<typeof prepareVideoParameters>,
    progress: ProgressManager,
    requestId: string,
): Promise<DashScopeRequest> {
    progress.updateBar(
        requestId,
        40,
        "Processing",
        "Processing reference image...",
    );

    const imgUrl = await prepareImageUrl(imageUrl);

    return {
        model: WAN_I2V_MODEL,
        input: { prompt, img_url: imgUrl },
        parameters: {
            resolution: videoParams.resolution,
            duration: videoParams.durationSeconds,
            prompt_extend: true,
            audio: videoParams.generateAudio,
        },
    };
}

/**
 * Prepare image URL for DashScope (convert to base64 if needed)
 */
async function prepareImageUrl(imageUrl: string): Promise<string> {
    if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
        return imageUrl;
    }

    try {
        const { base64, mimeType } = await downloadImageAsBase64(imageUrl);
        return `data:${mimeType};base64,${base64}`;
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        logError("Error processing reference image:", errorMessage);
        throw new HttpError(
            `Failed to process reference image: ${errorMessage}`,
            400,
        );
    }
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

    const endpoint = `${DASHSCOPE_API_BASE}/services/aigc/video-generation/video-synthesis`;

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "X-DashScope-Async": "enable",
        },
        body: JSON.stringify(requestBody),
    });

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
): Promise<{
    buffer: Buffer;
    usage: { video_duration: number };
}> {
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
        return { status: "pending" }; // Continue polling on non-fatal errors
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
