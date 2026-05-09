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

// Logger
const logOps = debug("pollinations:seedance:ops");
const logError = debug("pollinations:seedance:error");

// Seedance API constants
// Model IDs include date suffix as required by BytePlus
// Lite uses separate models for T2V and I2V
const SEEDANCE_LITE_T2V = "seedance-1-0-lite-t2v-250428";
const SEEDANCE_LITE_I2V = "seedance-1-0-lite-i2v-250428";
// Pro-Fast uses single model for both T2V and I2V
const SEEDANCE_PRO_FAST = "seedance-1-0-pro-fast-251015";

interface SeedanceTaskResponse {
    id?: string;
    task_id?: string;
    status?: string;
    error?: {
        code: number | string;
        message: string;
    };
}

interface SeedanceTaskResult {
    id?: string;
    status?: string;
    content?: {
        video_url?: string;
    };
    error?: {
        code: number | string;
        message: string;
    };
    usage?: {
        completion_tokens?: number;
        total_tokens?: number;
    };
}

interface SeedanceRequestBody {
    model: string;
    content: Array<{
        type: string;
        text?: string;
        image_url?: { url: string };
        role?: string;
    }>;
}

/**
 * Model configuration for Seedance variants
 */
interface SeedanceModelConfig {
    t2vModel: string;
    i2vModel: string;
    trackingLabel: string;
    displayName: string;
}

const SEEDANCE_LITE_CONFIG: SeedanceModelConfig = {
    t2vModel: SEEDANCE_LITE_T2V,
    i2vModel: SEEDANCE_LITE_I2V,
    trackingLabel: "seedance",
    displayName: "Seedance Lite",
};

const SEEDANCE_PRO_CONFIG: SeedanceModelConfig = {
    t2vModel: SEEDANCE_PRO_FAST,
    i2vModel: SEEDANCE_PRO_FAST, // Pro-Fast uses same model for T2V and I2V
    trackingLabel: "seedance-pro",
    displayName: "Seedance Pro",
};

/**
 * Shared video generation logic for all Seedance models
 */
async function generateSeedanceVideo(
    config: SeedanceModelConfig,
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<VideoGenerationResult> {
    const apiKey = getImageEnv("BYTEDANCE_API_KEY");
    if (!apiKey) {
        throw new HttpError(
            `BYTEDANCE_API_KEY environment variable is required for ${config.displayName}`,
            500,
        );
    }

    logOps(`Calling ${config.displayName} API with prompt:`, prompt);

    progress.updateBar(
        requestId,
        35,
        "Processing",
        `Starting video generation with ${config.displayName}...`,
    );

    // Video parameters
    const durationSeconds = safeParams.duration || 2;

    // Calculate resolution and aspect ratio from width/height or aspectRatio
    const { aspectRatio, resolution: resolutionUpper } =
        calculateVideoResolution({
            width: safeParams.width,
            height: safeParams.height,
            aspectRatio: safeParams.aspectRatio,
            defaultResolution: "720P",
        });
    const resolution = resolutionUpper.toLowerCase() as
        | "480p"
        | "720p"
        | "1080p";
    // Map aspectRatio to Seedance format: "16:9" -> "16_9", "9:16" -> "9_16"
    const aspectRatioFormatted = aspectRatio.replace(":", "_");

    // Select model based on whether we have an input image
    const hasImage = safeParams.image && safeParams.image.length > 0;
    const selectedModel = hasImage ? config.i2vModel : config.t2vModel;

    logOps("Video params:", {
        durationSeconds,
        resolution,
        aspectRatio: aspectRatioFormatted,
        model: selectedModel,
        hasImage,
    });

    // Build text command with parameters (BytePlus format)
    // Include aspectratio parameter for proper video dimensions
    let textCommand = `${prompt} --resolution ${resolution} --duration ${durationSeconds} --aspectratio ${aspectRatioFormatted} --watermark false`;
    if (safeParams.seed !== undefined && safeParams.seed !== -1) {
        textCommand += ` --seed ${safeParams.seed}`;
    }

    // Build request body
    const requestBody: SeedanceRequestBody = {
        model: selectedModel,
        content: [{ type: "text", text: textCommand }],
    };

    // Add image for I2V generation
    if (hasImage) {
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

        try {
            const { buffer, mimeType } = await downloadUserImage(imageUrl);
            requestBody.content.push({
                type: "image_url",
                image_url: {
                    url: `data:${mimeType};base64,${buffer.toString("base64")}`,
                },
                role: "first_frame",
            });
            logOps("Image processed successfully");
        } catch (error) {
            logError("Error processing reference image:", error.message);
            throw new HttpError(
                `Failed to process reference image: ${error.message}`,
                400,
            );
        }
    }

    // Log request (hide base64)
    logOps(
        `${config.displayName} request:`,
        JSON.stringify(
            {
                model: requestBody.model,
                content: requestBody.content.map((c) =>
                    c.type === "image_url"
                        ? { ...c, image_url: { url: "[base64]" } }
                        : c,
                ),
            },
            null,
            2,
        ),
    );

    // Create task
    progress.updateBar(
        requestId,
        45,
        "Processing",
        "Initiating video generation...",
    );

    const generateEndpoint =
        "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks";
    logOps(
        `${config.displayName} request body:`,
        JSON.stringify(requestBody, null, 2),
    );
    const generateResponse = await fetchUpstream(generateEndpoint, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        errorLabel: `${config.displayName} API request failed`,
    });

    const generateData: SeedanceTaskResponse = await generateResponse.json();
    logOps("Generate response:", JSON.stringify(generateData, null, 2));

    const taskId = generateData.id || generateData.task_id;
    if (!taskId) {
        throw new HttpError(
            `${config.displayName} API did not return task ID`,
            500,
            undefined,
            generateEndpoint,
        );
    }

    // Poll for completion
    progress.updateBar(
        requestId,
        50,
        "Processing",
        "Generating video (this takes 40-90 seconds)...",
    );
    const result = await pollSeedanceTask(taskId, apiKey, progress, requestId);

    progress.updateBar(requestId, 95, "Success", "Video generation completed");

    return {
        buffer: result.buffer,
        mimeType: "video/mp4",
        durationSeconds,
        trackingData: {
            actualModel: config.trackingLabel,
            usage: {
                completionVideoTokens: result.usage.completion_tokens,
                totalTokenCount: result.usage.total_tokens,
            },
        },
    };
}

/**
 * Generates a video using BytePlus Seedance Lite API
 * Lite has better quality but slower generation
 */
export const callSeedanceAPI = (
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<VideoGenerationResult> =>
    generateSeedanceVideo(
        SEEDANCE_LITE_CONFIG,
        prompt,
        safeParams,
        progress,
        requestId,
    );

/**
 * Generates a video using BytePlus Seedance Pro-Fast API
 * Pro-Fast has better prompt adherence but lower quality than Lite
 */
export const callSeedanceProAPI = (
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<VideoGenerationResult> =>
    generateSeedanceVideo(
        SEEDANCE_PRO_CONFIG,
        prompt,
        safeParams,
        progress,
        requestId,
    );

/**
 * Poll Seedance task until completion
 * @param {string} taskId - The task ID from generate response
 * @param {string} apiKey - BytePlus API key
 * @param {ProgressManager} progress - Progress manager
 * @param {string} requestId - Request ID
 * @returns {Promise<{buffer: Buffer, usage: {completion_tokens: number, total_tokens: number}}>} - The video buffer and usage
 */
async function pollSeedanceTask(
    taskId: string,
    apiKey: string,
    progress: ProgressManager,
    requestId: string,
): Promise<{
    buffer: Buffer;
    usage: { completion_tokens: number; total_tokens: number };
}> {
    const pollUrl = `https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/${taskId}`;
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

        const pollResponse = await fetch(pollUrl, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
        });

        if (!pollResponse.ok) {
            const errorText = await pollResponse.text();
            logError("Poll error:", pollResponse.status, errorText);
            // Continue polling on non-fatal errors
            await sleep(delayMs);
            continue;
        }

        const pollData: SeedanceTaskResult = await pollResponse.json();
        // Log full response for debugging
        logOps("Poll response FULL:", JSON.stringify(pollData, null, 2));

        const status = pollData.status?.toLowerCase();
        logOps("Parsed status:", status);

        if (status === "succeeded") {
            // Check for video URL (API returns content.video_url)
            const videoUrl = pollData.content?.video_url;

            if (!videoUrl) {
                throw new HttpError(
                    "No video URL in completed response",
                    500,
                    undefined,
                    pollUrl,
                );
            }

            logOps("Video URL:", videoUrl);

            // Download the video
            progress.updateBar(
                requestId,
                90,
                "Processing",
                "Downloading video...",
            );

            const videoResponse = await fetchUpstream(videoUrl, {
                errorLabel: "Failed to download video",
            });

            const buffer = Buffer.from(await videoResponse.arrayBuffer());
            logOps(
                "Video downloaded, size:",
                (buffer.length / 1024 / 1024).toFixed(2),
                "MB",
            );

            // Extract usage from API response
            const usage = {
                completion_tokens: pollData.usage?.completion_tokens || 0,
                total_tokens: pollData.usage?.total_tokens || 0,
            };
            logOps("API usage:", usage);

            return { buffer, usage };
        }

        if (status === "failed" || status === "error") {
            const errorMsg =
                pollData.error?.message || "Video generation failed";
            const errorCode = pollData.error?.code;
            const httpStatus =
                typeof errorCode === "number" &&
                errorCode >= 400 &&
                errorCode < 600
                    ? errorCode
                    : 500;
            logError("Seedance generation error:", pollData.error);
            throw new HttpError(errorMsg, httpStatus, undefined, pollUrl);
        }

        // Status is still pending/queued/generating - wait and try again
        await sleep(delayMs);
        // Slight exponential backoff, cap at 5 seconds
        delayMs = Math.min(delayMs * 1.1, 5000);
    }

    throw new HttpError(
        "Video generation timed out after 4 minutes",
        504,
        undefined,
        pollUrl,
    );
}
