import sleep from "await-sleep";
import debug from "debug";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import type { VideoGenerationResult } from "./veoVideoModel.ts";

// Logger
const logOps = debug("pollinations:ltx2:ops");
const logError = debug("pollinations:ltx2:error");

// LTX-2 Modal endpoints (myceli-ai workspace)
const MODAL_BASE_URL = "https://myceli-ai--ltx2-comfyui-api-distilled";
const ENQUEUE_URL = `${MODAL_BASE_URL}-enqueue.modal.run/`;
const STATUS_URL = `${MODAL_BASE_URL}-status.modal.run/`;
const RESULT_URL = `${MODAL_BASE_URL}-result.modal.run/`;

// Modal Proxy Auth Token (from environment)
const MODAL_TOKEN_ID = process.env.MODAL_LTX2_TOKEN_ID;
const MODAL_TOKEN_SECRET = process.env.MODAL_LTX2_TOKEN_SECRET;

/**
 * Get Modal auth headers for proxy authentication
 */
function getModalAuthHeaders(): Record<string, string> {
    if (!MODAL_TOKEN_ID || !MODAL_TOKEN_SECRET) {
        throw new Error(
            "Modal authentication not configured: Missing MODAL_LTX2_TOKEN_ID or MODAL_LTX2_TOKEN_SECRET",
        );
    }
    return {
        "Modal-Key": MODAL_TOKEN_ID,
        "Modal-Secret": MODAL_TOKEN_SECRET,
    };
}

// Polling constants
const INITIAL_DELAY_MS = 3000; // 3 seconds initial delay
const POLL_INTERVAL_MS = 3000; // 3 seconds between polls
const MAX_POLL_ATTEMPTS = 400; // ~20 minutes max (400 * 3s = 1200s)
const DEFAULT_TIMEOUT_SECS = 1200; // 20 minutes

/**
 * Convert duration in seconds to frame count for LTX-2
 * LTX-2 requires frame count to be 8n+1 (e.g., 9, 17, 25, ..., 121)
 */
function durationToFrameCount(durationSeconds: number): number {
    // 24 FPS - convert seconds to frames
    const targetFrames = Math.round(durationSeconds * 24);

    // Find the nearest valid frame count (8n+1)
    // Formula: frames = 8n + 1, so n = (frames - 1) / 8
    const n = Math.round((targetFrames - 1) / 8);
    const validFrames = 8 * n + 1;

    // Clamp to reasonable bounds (9 to 241 frames = 0.375s to 10s)
    return Math.max(9, Math.min(241, validFrames));
}

// Resolution limits
const DEFAULT_SIZE = 768;
const MAX_PIXELS = 1024 * 1024; // 1,048,576 pixels max

/**
 * Round to nearest multiple of 32 (LTX-2 requirement)
 */
function roundTo32(n: number): number {
    return Math.round(n / 32) * 32;
}

/**
 * Calculate width and height with resolution limits
 * - Default: 768x768
 * - Max total pixels: 1024x1024 (1,048,576)
 * - Dimensions must be divisible by 32 for LTX-2
 */
function calculateDimensions(
    inputWidth?: number,
    inputHeight?: number,
    aspectRatio?: string,
): { width: number; height: number } {
    let width = inputWidth || DEFAULT_SIZE;
    let height = inputHeight || DEFAULT_SIZE;

    // Handle aspect ratio presets if no explicit dimensions
    if (!inputWidth && !inputHeight && aspectRatio) {
        if (aspectRatio === "16:9") {
            width = 1024;
            height = 576;
        } else if (aspectRatio === "9:16") {
            width = 576;
            height = 1024;
        } else {
            width = DEFAULT_SIZE;
            height = DEFAULT_SIZE;
        }
    }

    // Scale down if total pixels exceed max
    const totalPixels = width * height;
    if (totalPixels > MAX_PIXELS) {
        const scale = Math.sqrt(MAX_PIXELS / totalPixels);
        width = Math.floor(width * scale);
        height = Math.floor(height * scale);
        logOps(
            `Scaled down resolution to ${width}x${height} (exceeded max pixels)`,
        );
    }

    // Round to nearest 32 (LTX-2 requirement) and ensure minimum size
    width = Math.max(256, roundTo32(width));
    height = Math.max(256, roundTo32(height));

    return { width, height };
}

/**
 * Enqueue a video generation job with LTX-2
 */
async function enqueueLtx2Job(
    prompt: string,
    width: number,
    height: number,
    frameCount: number,
): Promise<string> {
    const requestBody = {
        prompt,
        width,
        height,
        frame_count: frameCount,
    };

    logOps("Enqueuing LTX-2 job:", requestBody);

    const response = await fetch(ENQUEUE_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...getModalAuthHeaders(),
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorText = await response.text();
        logError("Enqueue failed:", response.status, errorText);
        throw new HttpError(
            `Failed to enqueue video generation: ${errorText}`,
            response.status,
        );
    }

    const data = (await response.json()) as { prompt_id?: string };
    if (!data.prompt_id) {
        throw new HttpError("No prompt_id returned from enqueue", 500);
    }

    logOps("Job enqueued with prompt_id:", data.prompt_id);
    return data.prompt_id;
}

/**
 * Poll LTX-2 status endpoint until job is done
 */
async function pollLtx2Status(
    promptId: string,
    progress: ProgressManager,
    requestId: string,
): Promise<void> {
    const statusUrl = `${STATUS_URL}?prompt_id=${promptId}`;

    // Initial delay for cold start
    logOps("Waiting initial delay before polling...");
    await sleep(INITIAL_DELAY_MS);

    for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
        logOps(`Poll attempt ${attempt}/${MAX_POLL_ATTEMPTS}...`);

        // Update progress (50-90% range during generation)
        const progressPercent =
            50 + Math.min(40, Math.floor((attempt / MAX_POLL_ATTEMPTS) * 40));
        const statusMessage =
            attempt === 1
                ? "Initializing model (may take up to 100s on cold start)..."
                : `Generating video... (${attempt}/${MAX_POLL_ATTEMPTS})`;

        progress.updateBar(
            requestId,
            progressPercent,
            "Processing",
            statusMessage,
        );

        try {
            const response = await fetch(statusUrl, {
                headers: getModalAuthHeaders(),
            });

            if (!response.ok) {
                const errorText = await response.text();
                logError("Status poll error:", response.status, errorText);
                // Continue polling on non-fatal errors
                await sleep(POLL_INTERVAL_MS);
                continue;
            }

            const data = (await response.json()) as {
                status: string;
                error?: string;
            };
            logOps("Status response:", data);

            if (data.status === "done") {
                logOps("Generation complete!");
                return;
            }

            if (data.status === "error") {
                throw new HttpError(
                    `Video generation failed: ${data.error || "Unknown error"}`,
                    500,
                );
            }

            // Status is "running" or other, continue polling
        } catch (error) {
            if (error instanceof HttpError) {
                throw error;
            }
            // Network errors - log and continue polling
            logError("Poll error:", error);
        }

        await sleep(POLL_INTERVAL_MS);
    }

    throw new HttpError(
        `Video generation timed out after ${DEFAULT_TIMEOUT_SECS} seconds`,
        504,
    );
}

/**
 * Fetch the generated video from result endpoint
 */
async function fetchLtx2Result(promptId: string): Promise<Buffer> {
    const resultUrl = `${RESULT_URL}?prompt_id=${promptId}`;

    logOps("Fetching result from:", resultUrl);

    const response = await fetch(resultUrl, {
        headers: getModalAuthHeaders(),
    });

    if (!response.ok) {
        if (response.status === 202) {
            // Not ready yet - shouldn't happen if polling worked correctly
            throw new HttpError("Video not ready yet", 202);
        }
        const errorText = await response.text();
        logError("Result fetch failed:", response.status, errorText);
        throw new HttpError(
            `Failed to fetch video result: ${errorText}`,
            response.status,
        );
    }

    // Get the video as buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    logOps(
        "Video received, size:",
        (buffer.length / 1024 / 1024).toFixed(2),
        "MB",
    );

    return buffer;
}

/**
 * Generates a video using LTX-2 on Modal
 * @param {string} prompt - The prompt for video generation
 * @param {ImageParams} safeParams - The parameters for video generation
 * @param {ProgressManager} progress - Progress manager for updates
 * @param {string} requestId - Request ID for progress tracking
 * @returns {Promise<VideoGenerationResult>}
 */
export const callLtx2API = async (
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<VideoGenerationResult> => {
    logOps("Calling LTX-2 API with prompt:", prompt);

    // Update progress
    progress.updateBar(
        requestId,
        35,
        "Processing",
        "Starting LTX-2 video generation...",
    );

    // Calculate video parameters
    const durationSeconds = safeParams.duration || 5;
    const frameCount = durationToFrameCount(durationSeconds);
    const { width, height } = calculateDimensions(
        safeParams.width ? Number(safeParams.width) : undefined,
        safeParams.height ? Number(safeParams.height) : undefined,
        safeParams.aspectRatio,
    );

    // Audio is enabled by default for LTX-2 (unless explicitly disabled)
    const generateAudio = safeParams.audio !== false;

    logOps("Video params:", {
        durationSeconds,
        frameCount,
        width,
        height,
        aspectRatio: safeParams.aspectRatio,
        generateAudio,
    });

    // Step 1: Enqueue the job
    progress.updateBar(
        requestId,
        40,
        "Processing",
        "Enqueuing video generation job...",
    );

    const promptId = await enqueueLtx2Job(prompt, width, height, frameCount);

    // Step 2: Poll for completion
    progress.updateBar(
        requestId,
        50,
        "Processing",
        "Generating video (may take up to 100s on cold start)...",
    );

    await pollLtx2Status(promptId, progress, requestId);

    // Step 3: Fetch the result
    progress.updateBar(
        requestId,
        90,
        "Processing",
        "Retrieving generated video...",
    );

    const videoBuffer = await fetchLtx2Result(promptId);

    progress.updateBar(requestId, 95, "Success", "Video generation completed");

    // Calculate actual duration based on frame count
    const actualDurationSeconds = frameCount / 24;

    return {
        buffer: videoBuffer,
        mimeType: "video/mp4",
        durationSeconds: actualDurationSeconds,
        trackingData: {
            actualModel: "ltx-2",
            usage: {
                completionVideoSeconds: actualDurationSeconds,
                // If audio was generated, track it separately (same duration as video)
                ...(generateAudio && {
                    completionAudioSeconds: actualDurationSeconds,
                }),
            },
        },
    };
};
