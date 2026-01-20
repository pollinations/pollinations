import debug from "debug";
import sleep from "await-sleep";
import { HttpError } from "../httpError.ts";
import { downloadImageAsBase64 } from "../utils/imageDownload.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";

// Logger
const logOps = debug("pollinations:wan:ops");
const logError = debug("pollinations:wan:error");

// DashScope API constants (Singapore region)
const DASHSCOPE_API_BASE = "https://dashscope-intl.aliyuncs.com/api/v1";
const WAN_I2V_MODEL = "wan2.6-i2v-flash";

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

/**
 * Generates a video using Alibaba Wan 2.6 API (DashScope)
 * Supports image-to-video with optional audio
 */
export async function callWanAPI(
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

    logOps("Calling Wan 2.6 API with prompt:", prompt);

    progress.updateBar(
        requestId,
        35,
        "Processing",
        "Starting video generation with Wan 2.6...",
    );

    // Video parameters
    const durationSeconds = safeParams.duration || 5;
    // Resolution: 480P, 720P, or 1080P
    const resolution = "720P";
    // Audio: true by default for Wan 2.6 (auto-dubbing)
    // Can be disabled with audio=false to reduce cost
    const generateAudio = safeParams.audio !== false;

    // Check for input image (required for I2V model)
    const hasImage = safeParams.image && safeParams.image.length > 0;

    if (!hasImage) {
        throw new HttpError(
            "Wan model requires an image parameter for image-to-video generation",
            400,
        );
    }

    logOps("Video params:", {
        durationSeconds,
        resolution,
        generateAudio,
        hasImage,
        model: WAN_I2V_MODEL,
    });

    // Build request body
    const input: {
        prompt: string;
        img_url?: string;
    } = {
        prompt: prompt,
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

        // Wan accepts either URL or base64 data URL
        // If it's already a URL, use it directly; otherwise encode
        if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
            input.img_url = imageUrl;
        } else {
            // Assume it needs encoding
            try {
                const { base64, mimeType } =
                    await downloadImageAsBase64(imageUrl);
                input.img_url = `data:${mimeType};base64,${base64}`;
            } catch (error) {
                logError("Error processing reference image:", error.message);
                throw new HttpError(
                    `Failed to process reference image: ${error.message}`,
                    400,
                );
            }
        }
    }

    const requestBody = {
        model: WAN_I2V_MODEL,
        input,
        parameters: {
            resolution,
            duration: durationSeconds,
            prompt_extend: true, // Enable prompt enhancement
            audio: generateAudio, // Audio generation (auto-dub or silent)
        },
    };

    // Log request (hide base64 if present)
    const logSafeRequest = {
        ...requestBody,
        input: {
            ...requestBody.input,
            img_url: requestBody.input.img_url?.startsWith("data:")
                ? "[base64]"
                : requestBody.input.img_url,
        },
    };
    logOps("Wan API request:", JSON.stringify(logSafeRequest, null, 2));

    // Step 1: Create task
    progress.updateBar(
        requestId,
        45,
        "Processing",
        "Initiating video generation...",
    );

    const generateEndpoint = `${DASHSCOPE_API_BASE}/services/aigc/video-generation/video-synthesis`;
    const generateResponse = await fetch(generateEndpoint, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "X-DashScope-Async": "enable",
        },
        body: JSON.stringify(requestBody),
    });

    if (!generateResponse.ok) {
        const errorText = await generateResponse.text();
        logError("Wan API failed:", generateResponse.status, errorText);
        throw new HttpError(
            `Wan API request failed: ${errorText}`,
            generateResponse.status,
        );
    }

    const generateData: WanTaskResponse = await generateResponse.json();
    logOps("Generate response:", JSON.stringify(generateData, null, 2));

    if (generateData.code) {
        throw new HttpError(
            `Wan API error: ${generateData.message || generateData.code}`,
            400,
        );
    }

    const taskId = generateData.output?.task_id;
    if (!taskId) {
        throw new HttpError("Wan API did not return task ID", 500);
    }

    // Step 2: Poll for completion
    progress.updateBar(
        requestId,
        50,
        "Processing",
        "Generating video (this takes 1-5 minutes)...",
    );

    const result = await pollWanTask(taskId, apiKey, progress, requestId);

    progress.updateBar(requestId, 95, "Success", "Video generation completed");

    const videoDuration = result.usage.video_duration || durationSeconds;

    return {
        buffer: result.buffer,
        mimeType: "video/mp4",
        durationSeconds,
        trackingData: {
            actualModel: "wan",
            usage: {
                completionVideoSeconds: videoDuration,
                // Audio seconds = video duration when audio is enabled
                // This allows separate pricing: video base + audio add-on
                completionAudioSeconds: generateAudio ? videoDuration : 0,
            },
        },
    };
}

/**
 * Poll Wan task until completion
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
    logOps("Poll URL:", pollUrl);

    const maxAttempts = 60; // 5 minutes max (5 second intervals)
    let delayMs = 5000; // Start with 5 seconds as recommended

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        logOps(`Poll attempt ${attempt}/${maxAttempts}...`);

        // Update progress based on attempt number
        const progressPercent = 50 + Math.min(40, Math.floor(attempt * 0.7));
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
            },
        });

        if (!pollResponse.ok) {
            const errorText = await pollResponse.text();
            logError("Poll error:", pollResponse.status, errorText);
            // Continue polling on non-fatal errors
            await sleep(delayMs);
            continue;
        }

        const pollData: WanTaskResult = await pollResponse.json();
        logOps("Poll response:", JSON.stringify(pollData, null, 2));

        const status = pollData.output?.task_status?.toUpperCase();
        logOps("Task status:", status);

        if (status === "SUCCEEDED") {
            const videoUrl = pollData.output?.video_url;

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
                video_duration: pollData.usage?.video_duration || 0,
            };
            logOps("API usage:", usage);

            return { buffer, usage };
        }

        if (status === "FAILED") {
            const errorMsg =
                pollData.output?.message ||
                pollData.message ||
                "Video generation failed";
            logError("Wan generation error:", pollData);
            throw new HttpError(errorMsg, 500);
        }

        if (status === "CANCELED") {
            throw new HttpError("Video generation was canceled", 500);
        }

        // Status is PENDING or RUNNING - wait and try again
        await sleep(delayMs);
        // Slight increase in delay, cap at 15 seconds
        delayMs = Math.min(delayMs * 1.1, 15000);
    }

    throw new HttpError("Video generation timed out after 5 minutes", 504);
}
