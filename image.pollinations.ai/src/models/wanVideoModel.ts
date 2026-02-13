import debug from "debug";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import { calculateVideoResolution } from "../utils/videoResolution.ts";

const logOps = debug("pollinations:wan:ops");
const logError = debug("pollinations:wan:error");

// API Configuration
const AIRFORCE_API_BASE = "https://api.airforce/v1";
const AIRFORCE_WAN_MODEL = "wan-2.6";

// Video generation constraints
const MIN_DURATION_SECONDS = 2;
const MAX_DURATION_SECONDS = 15;
const DEFAULT_DURATION_SECONDS = 5;
const DEFAULT_RESOLUTION = "720P"; // Supports 480P, 720P, 1080P

interface AirforceVideoResponse {
    created: number;
    data: Array<{
        url: string | null;
        b64_json: string | null;
    }>;
}

/**
 * Simple retry wrapper for flaky async operations
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (attempt === maxRetries) throw error;
            logOps(`Attempt ${attempt}/${maxRetries} failed, retrying...`);
        }
    }
    throw new Error("Unreachable");
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

    const videoUrl = await withRetry(() =>
        streamAirforceResponse(apiKey, requestBody, progress, requestId),
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
 * Uses unified resolution calculation from width/height or aspectRatio
 */
function prepareVideoParameters(safeParams: ImageParams): {
    durationSeconds: number;
    resolution: string;
    aspectRatio: string;
    generateAudio: boolean;
} {
    const rawDuration = safeParams.duration || DEFAULT_DURATION_SECONDS;
    const durationSeconds = Math.max(
        MIN_DURATION_SECONDS,
        Math.min(MAX_DURATION_SECONDS, rawDuration),
    );
    const generateAudio = safeParams.audio !== false;

    // Calculate resolution and aspect ratio from width/height or aspectRatio
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
        aspectRatio: videoParams.aspectRatio,
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

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
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

    const videoUrl = await parseSSEStream(response.body, progress, requestId);

    if (!videoUrl) {
        throw new HttpError("No video URL received from Airforce API", 500);
    }

    return videoUrl;
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
