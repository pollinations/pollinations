import debug from "debug";
import { withTimeoutSignal } from "../util.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";

// Logger
const logOps = debug("pollinations:seedance:ops");
const logError = debug("pollinations:seedance:error");

// Seedance API constants
// Using Seedance (BytePlus video generation)
const DEFAULT_MODEL = "seedance-1-0-lite";

interface SeedanceTaskResponse {
    id?: string;
    task_id?: string;
    status?: string;
    error?: {
        code: string;
        message: string;
    };
}

interface SeedanceTaskResult {
    id?: string;
    task_id?: string;
    status?: string;
    video?: {
        url?: string;
        duration?: number;
    };
    output?: {
        video_url?: string;
    };
    error?: {
        code: string;
        message: string;
    };
    usage?: {
        tokens_used?: number;
        total_tokens?: number;
    };
}

/**
 * Generates a video using BytePlus Seedance API
 * Supports both text-to-video and image-to-video generation
 * @param {string} prompt - The prompt for video generation
 * @param {ImageParams} safeParams - The parameters for video generation
 * @param {ProgressManager} progress - Progress manager for updates
 * @param {string} requestId - Request ID for progress tracking
 * @returns {Promise<VideoGenerationResult>}
 */
export const callSeedanceAPI = async (
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<VideoGenerationResult> => {
    // Use the same API key as Seedream (both are BytePlus ARK)
    const apiKey = process.env.SEEDREAM_API_KEY;
    if (!apiKey) {
        throw new HttpError(
            "SEEDREAM_API_KEY environment variable is required for Seedance",
            500,
        );
    }

    logOps("Calling Seedance API with prompt:", prompt);

    // Update progress
    progress.updateBar(
        requestId,
        35,
        "Processing",
        "Starting video generation with Seedance...",
    );

    // Determine video parameters
    const durationSeconds = safeParams.duration || 5; // Default 5 seconds
    const aspectRatio = safeParams.aspectRatio || "16:9";
    // Resolution: 720p or 480p (Seedance Lite only supports 720p)
    const resolution =
        safeParams.height && safeParams.height <= 480 ? "480p" : "720p";

    logOps("Video params:", {
        durationSeconds,
        aspectRatio,
        resolution,
        model: DEFAULT_MODEL,
        hasImage: !!safeParams.image,
    });

    // Build request body
    const requestBody: any = {
        model: DEFAULT_MODEL,
        prompt: prompt,
        duration: durationSeconds,
        aspect_ratio: aspectRatio,
        resolution: resolution,
        watermark: false,
    };

    // Add seed if specified
    if (safeParams.seed !== undefined && safeParams.seed !== -1) {
        requestBody.seed = safeParams.seed;
    }

    // Add image for image-to-video generation
    if (safeParams.image && safeParams.image.length > 0) {
        const imageUrl = Array.isArray(safeParams.image)
            ? safeParams.image[0]
            : safeParams.image;

        logOps("Adding first frame image for I2V:", imageUrl);
        progress.updateBar(
            requestId,
            40,
            "Processing",
            "Processing reference image...",
        );

        // Download and convert image to base64
        try {
            const imageResponse = await withTimeoutSignal(
                (signal) => fetch(imageUrl, { signal }),
                30000,
            );

            if (!imageResponse.ok) {
                throw new Error(
                    `Failed to fetch image: ${imageResponse.status}`,
                );
            }

            const imageBuffer = await imageResponse.arrayBuffer();
            const base64Data = Buffer.from(imageBuffer).toString("base64");
            const contentType =
                imageResponse.headers.get("content-type") || "image/jpeg";
            const dataUrl = `data:${contentType};base64,${base64Data}`;

            requestBody.image = dataUrl;
            logOps("Image processed successfully");
        } catch (error) {
            logError("Error processing reference image:", error.message);
            throw new HttpError(
                `Failed to process reference image: ${error.message}`,
                400,
            );
        }
    }

    logOps(
        "Seedance API request body:",
        JSON.stringify(
            {
                ...requestBody,
                image: requestBody.image ? "[base64]" : undefined,
            },
            null,
            2,
        ),
    );

    // Step 1: Create video generation task
    progress.updateBar(
        requestId,
        45,
        "Processing",
        "Initiating video generation...",
    );

    // BytePlus ARK video generation endpoint
    const generateEndpoint =
        "https://ark.ap-southeast.bytepluses.com/api/v3/videos/generations";
    logOps("Generate endpoint:", generateEndpoint);

    const generateResponse = await withTimeoutSignal(
        (signal) =>
            fetch(generateEndpoint, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(requestBody),
                signal,
            }),
        60000, // 60 second timeout for task creation
    );

    if (!generateResponse.ok) {
        const errorText = await generateResponse.text();
        logError(
            "Seedance API generate request failed:",
            generateResponse.status,
            errorText,
        );
        throw new HttpError(
            `Seedance API request failed: ${errorText}`,
            generateResponse.status,
        );
    }

    const generateData: SeedanceTaskResponse = await generateResponse.json();
    logOps("Generate response:", JSON.stringify(generateData, null, 2));

    const taskId = generateData.id || generateData.task_id;
    if (!taskId) {
        throw new HttpError("Seedance API did not return task ID", 500);
    }

    // Step 2: Poll for completion
    progress.updateBar(
        requestId,
        50,
        "Processing",
        "Generating video (this takes 40-90 seconds)...",
    );

    const result = await pollSeedanceTask(taskId, apiKey, progress, requestId);

    progress.updateBar(requestId, 95, "Success", "Video generation completed");

    // Calculate token usage for billing
    // Token formula: (height × width × FPS × duration) / 1024
    // 720p = 1280×720, 480p = 854×480, assume 24 FPS
    const width = resolution === "720p" ? 1280 : 854;
    const height = resolution === "720p" ? 720 : 480;
    const fps = 24;
    const tokenCount = Math.ceil(
        (width * height * fps * durationSeconds) / 1024,
    );

    return {
        buffer: result.buffer,
        mimeType: "video/mp4",
        durationSeconds: durationSeconds,
        trackingData: {
            actualModel: "seedance",
            usage: {
                completionVideoSeconds: durationSeconds,
                totalTokenCount: tokenCount,
            },
        },
    };
};

/**
 * Poll Seedance task until completion
 * @param {string} taskId - The task ID from generate response
 * @param {string} apiKey - BytePlus API key
 * @param {ProgressManager} progress - Progress manager
 * @param {string} requestId - Request ID
 * @returns {Promise<{buffer: Buffer}>} - The video buffer
 */
async function pollSeedanceTask(
    taskId: string,
    apiKey: string,
    progress: ProgressManager,
    requestId: string,
): Promise<{ buffer: Buffer }> {
    const pollUrl = `https://ark.ap-southeast.bytepluses.com/api/v3/videos/generations/${taskId}`;
    logOps("Poll URL:", pollUrl);

    const maxAttempts = 120; // 4 minutes max (2 second intervals)
    let delayMs = 2000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        logOps(`Poll attempt ${attempt}/${maxAttempts}...`);

        // Update progress based on attempt number
        const progressPercent = 50 + Math.min(40, Math.floor(attempt / 3));
        progress.updateBar(
            requestId,
            progressPercent,
            "Processing",
            `Generating video... (${attempt}/${maxAttempts})`,
        );

        const pollResponse = await withTimeoutSignal(
            (signal) =>
                fetch(pollUrl, {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "application/json",
                    },
                    signal,
                }),
            30000,
        );

        if (!pollResponse.ok) {
            const errorText = await pollResponse.text();
            logError("Poll error:", pollResponse.status, errorText);
            // Continue polling on non-fatal errors
            await sleep(delayMs);
            continue;
        }

        const pollData: SeedanceTaskResult = await pollResponse.json();
        logOps("Poll response status:", pollData.status);

        const status = pollData.status?.toLowerCase();

        if (
            status === "completed" ||
            status === "succeeded" ||
            status === "complete"
        ) {
            // Check for video URL
            const videoUrl = pollData.video?.url || pollData.output?.video_url;

            if (!videoUrl) {
                throw new HttpError("No video URL in completed response", 500);
            }

            logOps("Video URL:", videoUrl);

            // Download the video
            progress.updateBar(
                requestId,
                90,
                "Processing",
                "Downloading video...",
            );

            const videoResponse = await withTimeoutSignal(
                (signal) => fetch(videoUrl, { signal }),
                60000, // 60 second timeout for video download
            );

            if (!videoResponse.ok) {
                throw new HttpError(
                    `Failed to download video: ${videoResponse.status}`,
                    500,
                );
            }

            const buffer = Buffer.from(await videoResponse.arrayBuffer());
            logOps(
                "Video downloaded, size:",
                (buffer.length / 1024 / 1024).toFixed(2),
                "MB",
            );

            return { buffer };
        }

        if (status === "failed" || status === "error") {
            const errorMsg =
                pollData.error?.message || "Video generation failed";
            logError("Seedance generation error:", pollData.error);
            throw new HttpError(errorMsg, 500);
        }

        // Status is still pending/queued/generating - wait and try again
        await sleep(delayMs);
        // Slight exponential backoff, cap at 5 seconds
        delayMs = Math.min(delayMs * 1.1, 5000);
    }

    throw new HttpError("Video generation timed out after 4 minutes", 504);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
