import debug from "debug";
import sleep from "await-sleep";
import { HttpError } from "../httpError.ts";
import { downloadImageAsBase64 } from "../utils/imageDownload.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";

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
        code: string;
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
        code: string;
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
    // Minimum values for fastest generation: 2s duration, 480p resolution
    const durationSeconds = safeParams.duration || 2; // Default 2 seconds (minimum)
    const aspectRatio = safeParams.aspectRatio || "16:9";
    // Resolution: default to 720p
    const resolution = "720p";

    // Lite uses separate models for T2V and I2V
    const hasImage = safeParams.image && safeParams.image.length > 0;
    const selectedModel = hasImage ? SEEDANCE_LITE_I2V : SEEDANCE_LITE_T2V;

    logOps("Video params:", {
        durationSeconds,
        aspectRatio,
        resolution,
        model: selectedModel,
        hasImage,
    });

    // Build text command with parameters (BytePlus format)
    // Parameters are appended to prompt as --param value
    let textCommand = `${prompt} --resolution ${resolution} --duration ${durationSeconds} --watermark false`;
    if (safeParams.seed !== undefined && safeParams.seed !== -1) {
        textCommand += ` --seed ${safeParams.seed}`;
    }

    // Build request body using content array format (required by BytePlus API)
    const requestBody: SeedanceRequestBody = {
        model: selectedModel,
        content: [
            {
                type: "text",
                text: textCommand,
            },
        ],
    };

    // Add image for image-to-video generation (when using I2V model)
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

        // Download and convert image to base64
        try {
            // Download and detect MIME type from magic bytes
            const { base64, mimeType } = await downloadImageAsBase64(imageUrl);
            const dataUrl = `data:${mimeType};base64,${base64}`;

            // Add image to content array
            requestBody.content.push({
                type: "image_url",
                image_url: { url: dataUrl },
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

    // Log request body (hide base64 data)
    const logBody = {
        model: requestBody.model,
        content: requestBody.content.map(
            (c: { type: string; image_url?: { url: string } }) =>
                c.type === "image_url"
                    ? { ...c, image_url: { url: "[base64]" } }
                    : c,
        ),
    };
    logOps("Seedance API request body:", JSON.stringify(logBody, null, 2));

    // Step 1: Create video generation task
    progress.updateBar(
        requestId,
        45,
        "Processing",
        "Initiating video generation...",
    );

    // BytePlus ARK video generation endpoint (must use /contents/generations/tasks)
    const generateEndpoint =
        "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks";
    logOps("Generate endpoint:", generateEndpoint);

    const generateResponse = await fetch(generateEndpoint, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
    });

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

    return {
        buffer: result.buffer,
        mimeType: "video/mp4",
        durationSeconds: durationSeconds,
        trackingData: {
            actualModel: "seedance", // Lite
            usage: {
                completionVideoTokens: result.usage.completion_tokens,
                totalTokenCount: result.usage.total_tokens,
            },
        },
    };
};

/**
 * Generates a video using BytePlus Seedance Pro-Fast API
 * Pro-Fast has better prompt adherence but lower quality than Lite
 * @param {string} prompt - The prompt for video generation
 * @param {ImageParams} safeParams - The parameters for video generation
 * @param {ProgressManager} progress - Progress manager for updates
 * @param {string} requestId - Request ID for progress tracking
 * @returns {Promise<VideoGenerationResult>}
 */
export const callSeedanceProAPI = async (
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<VideoGenerationResult> => {
    // Use the same API key as Seedream (both are BytePlus ARK)
    const apiKey = process.env.SEEDREAM_API_KEY;
    if (!apiKey) {
        throw new HttpError(
            "SEEDREAM_API_KEY environment variable is required for Seedance Pro",
            500,
        );
    }

    logOps("Calling Seedance Pro API with prompt:", prompt);

    // Update progress
    progress.updateBar(
        requestId,
        35,
        "Processing",
        "Starting video generation with Seedance Pro...",
    );

    // Determine video parameters
    const durationSeconds = safeParams.duration || 2;
    const aspectRatio = safeParams.aspectRatio || "16:9";
    const resolution = "720p";

    // Pro-Fast uses single model for both T2V and I2V
    const hasImage = safeParams.image && safeParams.image.length > 0;
    const selectedModel = SEEDANCE_PRO_FAST;

    logOps("Video params:", {
        durationSeconds,
        aspectRatio,
        resolution,
        model: selectedModel,
        hasImage,
    });

    // Build text command with parameters (BytePlus format)
    let textCommand = `${prompt} --resolution ${resolution} --duration ${durationSeconds} --watermark false`;
    if (safeParams.seed !== undefined && safeParams.seed !== -1) {
        textCommand += ` --seed ${safeParams.seed}`;
    }

    // Build request body using content array format (required by BytePlus API)
    const requestBody: SeedanceRequestBody = {
        model: selectedModel,
        content: [
            {
                type: "text",
                text: textCommand,
            },
        ],
    };

    // Add image for image-to-video generation
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
            const { base64, mimeType } = await downloadImageAsBase64(imageUrl);
            const dataUrl = `data:${mimeType};base64,${base64}`;

            requestBody.content.push({
                type: "image_url",
                image_url: { url: dataUrl },
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

    // Log request body (hide base64 data)
    const logBody = {
        model: requestBody.model,
        content: requestBody.content.map(
            (c: { type: string; image_url?: { url: string } }) =>
                c.type === "image_url"
                    ? { ...c, image_url: { url: "[base64]" } }
                    : c,
        ),
    };
    logOps("Seedance Pro API request body:", JSON.stringify(logBody, null, 2));

    // Step 1: Create video generation task
    progress.updateBar(
        requestId,
        45,
        "Processing",
        "Initiating video generation...",
    );

    const generateEndpoint =
        "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks";
    logOps("Generate endpoint:", generateEndpoint);

    const generateResponse = await fetch(generateEndpoint, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
    });

    if (!generateResponse.ok) {
        const errorText = await generateResponse.text();
        logError(
            "Seedance Pro API generate request failed:",
            generateResponse.status,
            errorText,
        );
        throw new HttpError(
            `Seedance Pro API request failed: ${errorText}`,
            generateResponse.status,
        );
    }

    const generateData: SeedanceTaskResponse = await generateResponse.json();
    logOps("Generate response:", JSON.stringify(generateData, null, 2));

    const taskId = generateData.id || generateData.task_id;
    if (!taskId) {
        throw new HttpError("Seedance Pro API did not return task ID", 500);
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

    return {
        buffer: result.buffer,
        mimeType: "video/mp4",
        durationSeconds: durationSeconds,
        trackingData: {
            actualModel: "seedance-pro",
            usage: {
                completionVideoTokens: result.usage.completion_tokens,
                totalTokenCount: result.usage.total_tokens,
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

            const videoResponse = await fetch(videoUrl);

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
