import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import { sleep } from "../util.ts";

import type { VideoGenerationResult } from "./veoVideoModel.ts";

const logOps = debug("pollinations:pruna:ops");
const logError = debug("pollinations:pruna:error");

// Pruna API configuration
const PRUNA_API_BASE = "https://api.pruna.ai/v1";
const PREDICTIONS_URL = `${PRUNA_API_BASE}/predictions`;

const FILES_URL = `${PRUNA_API_BASE}/files`;

// Polling configuration
const POLL_MAX_ATTEMPTS = 120; // 10 minutes max
const POLL_DELAY_MS = 3000; // 3 second intervals

// Supported dimensions for p-image
const SUPPORTED_DIMENSIONS: Array<[number, number]> = [
    [1024, 1024],
    [1184, 896],
    [896, 1184],
    [1376, 768],
    [768, 1376],
    [1248, 832],
    [832, 1248],
];

interface PrunaPredictionResponse {
    id: string;
    model: string;
    get_url: string;
    input?: Record<string, unknown>;
}

interface PrunaStatusResponse {
    status: "starting" | "processing" | "succeeded" | "failed";
    message?: string;
    error?: string;
    generation_url?: string;
}

/**
 * Find the closest supported dimension pair for Pruna p-image
 */
function findClosestDimensions(
    width: number,
    height: number,
): { width: number; height: number } {
    const targetRatio = width / height;
    let bestMatch = SUPPORTED_DIMENSIONS[0];
    let bestDiff = Infinity;

    for (const [w, h] of SUPPORTED_DIMENSIONS) {
        const ratio = w / h;
        const diff = Math.abs(ratio - targetRatio);
        if (diff < bestDiff) {
            bestDiff = diff;
            bestMatch = [w, h];
        }
    }

    return { width: bestMatch[0], height: bestMatch[1] };
}

/**
 * Submit a prediction to the Pruna API
 */
async function submitPrediction(
    model: string,
    input: Record<string, unknown>,
): Promise<PrunaPredictionResponse> {
    const apiKey = process.env.PRUNA_API_KEY;
    if (!apiKey) {
        throw new HttpError(
            "PRUNA_API_KEY environment variable is required",
            500,
        );
    }

    logOps(`Submitting ${model} prediction:`, JSON.stringify(input, null, 2));

    const response = await fetch(PREDICTIONS_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "apikey": apiKey,
            "Model": model,
        },
        body: JSON.stringify({ input }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        logError(`Pruna API submit failed (${response.status}):`, errorText);
        throw new HttpError(
            `Pruna API request failed: ${errorText}`,
            response.status,
        );
    }

    return (await response.json()) as PrunaPredictionResponse;
}

/**
 * Upload a base64/data URI image to Pruna's file endpoint and return the hosted URL.
 * Pruna rejects inline base64 in predictions but accepts URLs to uploaded files.
 */
async function uploadImageToPruna(imageData: string): Promise<string> {
    const apiKey = process.env.PRUNA_API_KEY;
    if (!apiKey) {
        throw new HttpError(
            "PRUNA_API_KEY environment variable is required",
            500,
        );
    }

    // Strip data URI prefix if present
    let base64 = imageData;
    let mimeType = "image/png";
    const dataUriMatch = imageData.match(/^data:([^;]+);base64,(.+)$/);
    if (dataUriMatch) {
        mimeType = dataUriMatch[1];
        base64 = dataUriMatch[2];
    }

    const buffer = Buffer.from(base64, "base64");
    const ext = mimeType.split("/")[1] || "png";
    const blob = new Blob([buffer], { type: mimeType });
    const formData = new FormData();
    formData.append("content", blob, `image.${ext}`);

    const response = await fetch(FILES_URL, {
        method: "POST",
        headers: { apikey: apiKey },
        body: formData,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new HttpError(
            `Pruna file upload failed: ${errorText}`,
            response.status,
        );
    }

    const result = (await response.json()) as { urls: { get: string } };
    logOps("Uploaded image to Pruna:", result.urls.get);
    return result.urls.get;
}

/**
 * Poll prediction status until completion
 */
async function pollPrediction(
    statusUrl: string,
    progress: ProgressManager,
    requestId: string,
    label: string,
): Promise<string> {
    const apiKey = process.env.PRUNA_API_KEY;
    if (!apiKey) {
        throw new HttpError(
            "PRUNA_API_KEY environment variable is required",
            500,
        );
    }

    for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++) {
        const progressPercent = 50 + Math.min(35, Math.floor(attempt * 0.5));
        progress.updateBar(
            requestId,
            progressPercent,
            "Processing",
            `${label}... (${attempt}/${POLL_MAX_ATTEMPTS})`,
        );

        const response = await fetch(statusUrl, {
            method: "GET",
            headers: { "apikey": apiKey },
        });

        if (!response.ok) {
            const errorText = await response.text();
            logError(`Poll error (${response.status}):`, errorText);
            if (response.status >= 400 && response.status < 500) {
                throw new HttpError(
                    `Pruna poll failed: ${errorText}`,
                    response.status,
                );
            }
            await sleep(POLL_DELAY_MS);
            continue;
        }

        const data = (await response.json()) as PrunaStatusResponse;
        logOps(`Poll attempt ${attempt}, status: ${data.status}`);

        switch (data.status) {
            case "succeeded":
                if (!data.generation_url) {
                    throw new HttpError(
                        "Pruna succeeded but no generation_url",
                        500,
                    );
                }
                return data.generation_url;

            case "failed":
                throw new HttpError(
                    `Pruna generation failed: ${data.error || data.message || "unknown error"}`,
                    500,
                );

            case "starting":
            case "processing":
                break;
        }

        await sleep(POLL_DELAY_MS);
    }

    throw new HttpError("Pruna generation timed out", 504);
}

/**
 * Download result from Pruna delivery URL
 */
async function downloadResult(deliveryUrl: string): Promise<Buffer> {
    const apiKey = process.env.PRUNA_API_KEY;

    const response = await fetch(deliveryUrl, {
        method: "GET",
        headers: apiKey ? { "apikey": apiKey } : {},
    });

    if (!response.ok) {
        throw new HttpError(
            `Pruna delivery download failed: ${response.status}`,
            response.status,
        );
    }

    return Buffer.from(await response.arrayBuffer());
}

// =============================================================================
// p-image: Text-to-Image
// =============================================================================

export async function callPrunaImageAPI(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<ImageGenerationResult> {
    try {
        logOps("Calling Pruna p-image with prompt:", prompt);

        progress.updateBar(
            requestId,
            35,
            "Processing",
            "Generating with Pruna p-image...",
        );

        const dims = findClosestDimensions(
            safeParams.width || 1024,
            safeParams.height || 1024,
        );

        const input: Record<string, unknown> = {
            prompt,
            aspect_ratio: "custom",
            width: dims.width,
            height: dims.height,
        };

        if (safeParams.seed !== undefined) {
            input.seed = safeParams.seed;
        }

        const prediction = await submitPrediction("p-image", input);
        const deliveryUrl = await pollPrediction(
            prediction.get_url,
            progress,
            requestId,
            "Generating image",
        );

        progress.updateBar(requestId, 90, "Processing", "Downloading image...");
        const buffer = await downloadResult(deliveryUrl);
        logOps("Downloaded image, buffer size:", buffer.length);

        progress.updateBar(requestId, 95, "Success", "Pruna p-image completed");

        return {
            buffer,
            isMature: false,
            isChild: false,
            trackingData: {
                actualModel: "p-image",
                usage: {
                    completionImageTokens: 1,
                    totalTokenCount: 1,
                },
            },
        };
    } catch (error) {
        logError("Error calling Pruna p-image:", error);
        if (error instanceof HttpError) throw error;
        throw new Error(`Pruna p-image generation failed: ${error.message}`);
    }
}

// =============================================================================
// p-image-edit: Image-to-Image Editing
// =============================================================================

export async function callPrunaImageEditAPI(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<ImageGenerationResult> {
    try {
        logOps("Calling Pruna p-image-edit with prompt:", prompt);

        progress.updateBar(
            requestId,
            30,
            "Processing",
            "Preparing image for editing...",
        );

        const input: Record<string, unknown> = { prompt };

        // Pruna p-image-edit accepts image URLs (1-5 images)
        // Inline base64/data URIs are rejected, so upload those via /v1/files first
        if (safeParams.image && safeParams.image.length > 0) {
            const rawImages = safeParams.image.slice(0, 5);

            const resolvedImages: string[] = [];
            for (const img of rawImages) {
                if (img.startsWith("http://") || img.startsWith("https://")) {
                    resolvedImages.push(img);
                } else {
                    // base64 or data URI — upload to Pruna's file hosting
                    resolvedImages.push(await uploadImageToPruna(img));
                }
            }
            input.images = resolvedImages;
        }

        if (safeParams.seed !== undefined) {
            input.seed = safeParams.seed;
        }

        progress.updateBar(
            requestId,
            40,
            "Processing",
            "Generating with Pruna p-image-edit...",
        );

        const prediction = await submitPrediction("p-image-edit", input);
        const deliveryUrl = await pollPrediction(
            prediction.get_url,
            progress,
            requestId,
            "Editing image",
        );

        progress.updateBar(requestId, 90, "Processing", "Downloading image...");
        const buffer = await downloadResult(deliveryUrl);
        logOps("Downloaded edited image, buffer size:", buffer.length);

        progress.updateBar(
            requestId,
            95,
            "Success",
            "Pruna p-image-edit completed",
        );

        return {
            buffer,
            isMature: false,
            isChild: false,
            trackingData: {
                actualModel: "p-image-edit",
                usage: {
                    completionImageTokens: 1,
                    totalTokenCount: 1,
                },
            },
        };
    } catch (error) {
        logError("Error calling Pruna p-image-edit:", error);
        if (error instanceof HttpError) throw error;
        throw new Error(
            `Pruna p-image-edit generation failed: ${error.message}`,
        );
    }
}

// =============================================================================
// p-video: Text/Image-to-Video
// =============================================================================

export async function callPrunaVideoAPI(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<VideoGenerationResult> {
    try {
        logOps("Calling Pruna p-video with prompt:", prompt);

        progress.updateBar(
            requestId,
            35,
            "Processing",
            "Starting video generation with Pruna p-video...",
        );

        const input: Record<string, unknown> = { prompt };

        // Determine resolution and aspect ratio from dimensions
        const resolution =
            (safeParams.height || 720) >= 1080 ? "1080p" : "720p";
        input.resolution = resolution;

        // Image-to-video mode
        if (safeParams.image && safeParams.image.length > 0) {
            const img = safeParams.image[0];

            logOps("Reference image for I2V:", img);
            progress.updateBar(
                requestId,
                30,
                "Processing",
                "Preparing reference image...",
            );
            // Pruna rejects inline base64/data URIs — pass URLs directly, upload others
            if (img.startsWith("http://") || img.startsWith("https://")) {
                input.image = img;
            } else {
                input.image = await uploadImageToPruna(img);
            }
            // I2V ignores aspect_ratio, uses input image dimensions
        } else {
            // Text-to-video: determine aspect ratio from requested dimensions
            const w = safeParams.width || 1024;
            const h = safeParams.height || 1024;
            const ratio = w / h;
            // Map to closest supported aspect ratio
            const ratios = [
                { ar: "16:9", r: 16 / 9 },
                { ar: "9:16", r: 9 / 16 },
                { ar: "4:3", r: 4 / 3 },
                { ar: "3:4", r: 3 / 4 },
                { ar: "3:2", r: 3 / 2 },
                { ar: "2:3", r: 2 / 3 },
                { ar: "1:1", r: 1 },
            ];
            const closest = ratios.reduce((a, b) =>
                Math.abs(a.r - ratio) < Math.abs(b.r - ratio) ? a : b,
            );
            input.aspect_ratio = closest.ar;
            logOps("T2V aspect ratio:", closest.ar, "resolution:", resolution);
        }

        // Duration (1-10s, default 5)
        const duration = Math.max(1, Math.min(10, safeParams.duration || 5));
        input.duration = duration;

        // FPS (24 or 48)
        if (safeParams.fps) {
            input.fps = safeParams.fps >= 36 ? 48 : 24;
        }

        if (safeParams.seed !== undefined) {
            input.seed = safeParams.seed;
        }

        const prediction = await submitPrediction("p-video", input);
        const deliveryUrl = await pollPrediction(
            prediction.get_url,
            progress,
            requestId,
            "Generating video (this may take 1-3 minutes)",
        );

        progress.updateBar(requestId, 90, "Processing", "Downloading video...");
        const buffer = await downloadResult(deliveryUrl);
        logOps(
            `Video downloaded, size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`,
        );

        progress.updateBar(requestId, 95, "Success", "Pruna p-video completed");

        return {
            buffer,
            mimeType: "video/mp4",
            durationSeconds: duration,
            trackingData: {
                actualModel: "p-video",
                usage: {
                    completionVideoSeconds: duration,
                },
            },
        };
    } catch (error) {
        logError("Error calling Pruna p-video:", error);
        if (error instanceof HttpError) throw error;
        throw new Error(`Pruna p-video generation failed: ${error.message}`);
    }
}
