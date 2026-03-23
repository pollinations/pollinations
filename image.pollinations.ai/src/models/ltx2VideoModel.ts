import debug from "debug";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import { sleep } from "../util.ts";
import type { VideoGenerationResult } from "./veoVideoModel.ts";

// Logger
const logOps = debug("pollinations:ltx2:ops");
const logError = debug("pollinations:ltx2:error");

// LTX-2 Vast.ai endpoint (instance 32608960 GPU 0)
const LTX2_BASE_URL = process.env.LTX2_BASE_URL || "http://114.32.64.6:40161";

// Polling constants
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 150; // 150 * 2s = 5 minutes max
const DEFAULT_TIMEOUT_SECS = 300;

/**
 * Convert duration in seconds to frame count for LTX-2
 * LTX-2 requires frame count to be 8n+1 (e.g., 9, 17, 25, ..., 121)
 */
function durationToFrameCount(durationSeconds: number): number {
    const targetFrames = Math.round(durationSeconds * 24);
    const n = Math.round((targetFrames - 1) / 8);
    const validFrames = 8 * n + 1;
    return Math.max(9, Math.min(241, validFrames));
}

// Resolution limits
const DEFAULT_SIZE = 768;
const MAX_PIXELS = 1024 * 1024;

function roundTo32(n: number): number {
    return Math.round(n / 32) * 32;
}

function calculateDimensions(
    inputWidth?: number,
    inputHeight?: number,
    aspectRatio?: string,
): { width: number; height: number } {
    let width: number;
    let height: number;

    if (inputWidth && inputHeight) {
        width = inputWidth;
        height = inputHeight;
    } else {
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

    const totalPixels = width * height;
    if (totalPixels > MAX_PIXELS) {
        const scale = Math.sqrt(MAX_PIXELS / totalPixels);
        width = Math.floor(width * scale);
        height = Math.floor(height * scale);
        logOps(
            `Scaled down resolution to ${width}x${height} (exceeded max pixels)`,
        );
    }

    width = Math.max(256, roundTo32(width));
    height = Math.max(256, roundTo32(height));

    return { width, height };
}

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

    const response = await fetch(`${LTX2_BASE_URL}/enqueue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

async function pollLtx2Status(
    promptId: string,
    progress: ProgressManager,
    requestId: string,
): Promise<void> {
    const statusUrl = `${LTX2_BASE_URL}/status?prompt_id=${promptId}`;

    for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
        logOps(`Poll attempt ${attempt}/${MAX_POLL_ATTEMPTS}...`);

        const progressPercent =
            50 + Math.min(40, Math.floor((attempt / MAX_POLL_ATTEMPTS) * 40));
        progress.updateBar(
            requestId,
            progressPercent,
            "Processing",
            `Generating video... (${attempt}/${MAX_POLL_ATTEMPTS})`,
        );

        try {
            const response = await fetch(statusUrl);

            if (!response.ok) {
                const errorText = await response.text();
                logError("Status poll error:", response.status, errorText);
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
        } catch (error) {
            if (error instanceof HttpError) {
                throw error;
            }
            logError("Poll error:", error);
        }

        await sleep(POLL_INTERVAL_MS);
    }

    throw new HttpError(
        `Video generation timed out after ${DEFAULT_TIMEOUT_SECS} seconds`,
        504,
    );
}

async function fetchLtx2Result(promptId: string): Promise<Buffer> {
    const resultUrl = `${LTX2_BASE_URL}/result?prompt_id=${promptId}`;

    logOps("Fetching result from:", resultUrl);

    const response = await fetch(resultUrl);

    if (!response.ok) {
        if (response.status === 202) {
            throw new HttpError("Video not ready yet", 202);
        }
        const errorText = await response.text();
        logError("Result fetch failed:", response.status, errorText);
        throw new HttpError(
            `Failed to fetch video result: ${errorText}`,
            response.status,
        );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    logOps(
        "Video received, size:",
        (buffer.length / 1024 / 1024).toFixed(2),
        "MB",
    );

    return buffer;
}

export const callLtx2API = async (
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<VideoGenerationResult> => {
    logOps("Calling LTX-2 API with prompt:", prompt);

    progress.updateBar(
        requestId,
        35,
        "Processing",
        "Starting LTX-2 video generation...",
    );

    const durationSeconds = safeParams.duration || 5;
    const frameCount = durationToFrameCount(durationSeconds);
    const { width, height } = calculateDimensions(
        safeParams.width ? Number(safeParams.width) : undefined,
        safeParams.height ? Number(safeParams.height) : undefined,
        safeParams.aspectRatio,
    );

    logOps("Video params:", {
        durationSeconds,
        frameCount,
        width,
        height,
        aspectRatio: safeParams.aspectRatio,
    });

    progress.updateBar(
        requestId,
        40,
        "Processing",
        "Enqueuing video generation job...",
    );

    const promptId = await enqueueLtx2Job(prompt, width, height, frameCount);

    progress.updateBar(requestId, 50, "Processing", "Generating video...");

    await pollLtx2Status(promptId, progress, requestId);

    progress.updateBar(
        requestId,
        90,
        "Processing",
        "Retrieving generated video...",
    );

    const videoBuffer = await fetchLtx2Result(promptId);

    progress.updateBar(requestId, 95, "Success", "Video generation completed");

    const actualDurationSeconds = frameCount / 24;

    return {
        buffer: videoBuffer,
        mimeType: "video/mp4",
        durationSeconds: actualDurationSeconds,
        trackingData: {
            actualModel: "ltx-2",
            usage: {
                completionVideoSeconds: actualDurationSeconds,
            },
        },
    };
};
