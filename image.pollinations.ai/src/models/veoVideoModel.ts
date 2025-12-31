import sleep from "await-sleep";
import debug from "debug";
import googleCloudAuth from "../../auth/googleCloudAuth.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import { downloadImageAsBase64 } from "../utils/imageDownload.ts";

// Logger
const logOps = debug("pollinations:veo:ops");
const logError = debug("pollinations:veo:error");

/**
 * Helper to download and encode an image for Veo API
 */
async function processImageForVeo(
    imageUrl: string,
    label: string,
): Promise<{ bytesBase64Encoded: string; mimeType: string }> {
    try {
        const { base64, mimeType } = await downloadImageAsBase64(imageUrl);
        logOps(`${label} processed successfully, mimeType:`, mimeType);
        return { bytesBase64Encoded: base64, mimeType };
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        logError(`Error processing ${label}:`, errorMessage);
        throw new HttpError(`Failed to process ${label}: ${errorMessage}`, 400);
    }
}

// Veo API constants
const LOCATION = "us-central1"; // Veo is only available in us-central1
const MODEL_ID = "veo-3.1-fast-generate-preview";

/**
 * Result of video generation
 */
export interface VideoGenerationResult {
    buffer: Buffer;
    mimeType: string;
    durationSeconds: number;
    trackingData: {
        actualModel: string;
        usage: {
            completionVideoSeconds?: number; // For Veo (billed by seconds)
            completionVideoTokens?: number; // For Seedance (billed by tokens)
            totalTokenCount?: number;
        };
    };
}

interface VeoOperationResponse {
    name?: string;
    done?: boolean;
    error?: {
        code: number;
        message: string;
    };
    response?: {
        videos?: Array<{
            bytesBase64Encoded?: string;
            gcsUri?: string;
            mimeType?: string;
        }>;
    };
    metadata?: unknown;
}

/**
 * Generates a video using Veo 3.1 Fast API
 * @param {string} prompt - The prompt for video generation
 * @param {ImageParams} safeParams - The parameters for video generation
 * @param {ProgressManager} progress - Progress manager for updates
 * @param {string} requestId - Request ID for progress tracking
 * @returns {Promise<VideoGenerationResult>}
 */
export const callVeoAPI = async (
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<VideoGenerationResult> => {
    const PROJECT_ID = process.env.GOOGLE_PROJECT_ID;

    if (!PROJECT_ID) {
        throw new HttpError(
            "GOOGLE_PROJECT_ID environment variable is required",
            500,
        );
    }

    logOps("Calling Veo API with prompt:", prompt);

    // Update progress
    progress.updateBar(
        requestId,
        35,
        "Processing",
        "Starting video generation...",
    );

    // Get access token
    const accessToken = await googleCloudAuth.getAccessToken();
    if (!accessToken) {
        throw new HttpError("Failed to get Google Cloud access token", 500);
    }

    // Determine video parameters - pass through to Veo API, let it validate
    const durationSeconds = safeParams.duration || 4;
    const aspectRatio = safeParams.aspectRatio || "16:9";
    // Audio is disabled by default - user must explicitly pass audio=true to enable
    const generateAudio = safeParams.audio === true;
    // Resolution: currently only 720p is enabled
    // TODO: Enable 1080p later by adding resolution param and updating cost calculation
    const resolution = "720p";

    // Check for input image (image-to-video)
    const hasImage = safeParams.image && safeParams.image.length > 0;

    // Check if we have a second image for last frame interpolation
    const hasLastFrame =
        Array.isArray(safeParams.image) && safeParams.image.length > 1;

    logOps("Video params:", {
        durationSeconds,
        aspectRatio,
        generateAudio,
        resolution,
        hasImage,
        hasLastFrame,
    });

    // Build instance object
    const instance: {
        prompt: string;
        image?: { bytesBase64Encoded: string; mimeType: string };
        lastFrame?: { bytesBase64Encoded: string; mimeType: string };
    } = {
        prompt: prompt,
    };

    // Add image for I2V generation (Veo supports 1 reference image as first frame)
    if (hasImage) {
        const imageUrl = Array.isArray(safeParams.image)
            ? safeParams.image[0]
            : safeParams.image;
        logOps("Adding first frame image for I2V:", imageUrl);
        progress.updateBar(
            requestId,
            38,
            "Processing",
            "Processing first frame...",
        );
        instance.image = await processImageForVeo(imageUrl, "first frame");
    }

    // Add lastFrame for video interpolation (image[1] = last frame)
    if (hasLastFrame) {
        const lastFrameUrl = safeParams.image[1];
        logOps("Adding last frame image for interpolation:", lastFrameUrl);
        progress.updateBar(
            requestId,
            39,
            "Processing",
            "Processing last frame...",
        );
        instance.lastFrame = await processImageForVeo(
            lastFrameUrl,
            "last frame",
        );
    }

    // Build request body
    const requestBody = {
        instances: [instance],
        parameters: {
            sampleCount: 1,
            durationSeconds: durationSeconds,
            aspectRatio: aspectRatio,
            personGeneration: "allow_all",
            addWatermark: true,
            generateAudio: generateAudio,
            resolution: resolution,
        },
    };

    // Log request (hide base64)
    const logSafeRequest = {
        ...requestBody,
        instances: requestBody.instances.map((inst) => ({
            ...inst,
            image: inst.image
                ? { ...inst.image, bytesBase64Encoded: "[BASE64]" }
                : undefined,
            lastFrame: inst.lastFrame
                ? { ...inst.lastFrame, bytesBase64Encoded: "[BASE64]" }
                : undefined,
        })),
    };
    logOps("Veo API request body:", JSON.stringify(logSafeRequest, null, 2));

    // Step 1: Start video generation with predictLongRunning
    progress.updateBar(
        requestId,
        40,
        "Processing",
        "Initiating video generation...",
    );

    const generateEndpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL_ID}:predictLongRunning`;
    logOps("Generate endpoint:", generateEndpoint);

    const generateResponse = await fetch(generateEndpoint, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
    });

    if (!generateResponse.ok) {
        const errorText = await generateResponse.text();
        logError(
            "Veo API generate request failed:",
            generateResponse.status,
            errorText,
        );
        throw new HttpError(
            `Veo API request failed: ${errorText}`,
            generateResponse.status,
        );
    }

    const generateData: VeoOperationResponse = await generateResponse.json();
    logOps("Generate response:", JSON.stringify(generateData, null, 2));

    if (!generateData.name) {
        throw new HttpError("Veo API did not return operation name", 500);
    }

    // Step 2: Poll for completion using fetchPredictOperation
    progress.updateBar(
        requestId,
        50,
        "Processing",
        "Generating video (this takes 30-90 seconds)...",
    );

    const videoBuffer = await pollVeoOperation(
        generateData.name,
        accessToken,
        progress,
        requestId,
    );

    progress.updateBar(requestId, 95, "Success", "Video generation completed");

    return {
        buffer: videoBuffer,
        mimeType: "video/mp4",
        durationSeconds: durationSeconds,
        trackingData: {
            actualModel: "veo",
            usage: {
                completionVideoSeconds: durationSeconds,
            },
        },
    };
};

/**
 * Poll Veo operation until completion using fetchPredictOperation
 * @param {string} operationName - The operation name from generate response
 * @param {string} accessToken - Google Cloud access token
 * @param {ProgressManager} progress - Progress manager
 * @param {string} requestId - Request ID
 * @returns {Promise<Buffer>} - The video buffer
 */
async function pollVeoOperation(
    operationName: string,
    accessToken: string,
    progress: ProgressManager,
    requestId: string,
): Promise<Buffer> {
    const PROJECT_ID = process.env.GOOGLE_PROJECT_ID;

    // Extract model from operation name
    const modelMatch = operationName.match(/models\/([^/]+)\/operations/);
    const model = modelMatch ? modelMatch[1] : MODEL_ID;

    const pollUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${model}:fetchPredictOperation`;
    logOps("Poll URL:", pollUrl);

    const maxAttempts = 90; // 3 minutes max
    let delayMs = 2000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        logOps(`Poll attempt ${attempt}/${maxAttempts}...`);

        // Update progress based on attempt number
        const progressPercent = 50 + Math.min(40, attempt);
        progress.updateBar(
            requestId,
            progressPercent,
            "Processing",
            `Waiting for video... (${attempt}/${maxAttempts})`,
        );

        const pollResponse = await fetch(pollUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                operationName: operationName,
            }),
        });

        if (!pollResponse.ok) {
            const errorText = await pollResponse.text();
            logError("Poll error:", pollResponse.status, errorText);
            // Continue polling on non-fatal errors
            await sleep(delayMs);
            delayMs = Math.min(delayMs * 1.2, 30000); // Exponential backoff, cap at 30s
            continue;
        }

        const pollData: VeoOperationResponse = await pollResponse.json();
        logOps("Poll response done:", pollData.done);

        if (pollData.done) {
            // Check for error
            if (pollData.error) {
                logError("Veo operation error:", pollData.error);

                // Vertex AI uses gRPC status codes for errors:
                // - 3 = INVALID_ARGUMENT (bad input/prompt)
                // - 9 = FAILED_PRECONDITION (content policy violation)
                // See: https://cloud.google.com/vertex-ai/generative-ai/docs/video/responsible-ai-and-usage-guidelines
                const errorCode = pollData.error.code;
                const isClientError =
                    errorCode === 400 || errorCode === 3 || errorCode === 9;

                throw new HttpError(
                    `Video generation failed: ${pollData.error.message}`,
                    isClientError ? 400 : 500,
                );
            }

            // Check for videos
            if (
                pollData.response?.videos &&
                pollData.response.videos.length > 0
            ) {
                const video = pollData.response.videos[0];

                if (video.bytesBase64Encoded) {
                    const buffer = Buffer.from(
                        video.bytesBase64Encoded,
                        "base64",
                    );
                    logOps(
                        "Video received, size:",
                        (buffer.length / 1024 / 1024).toFixed(2),
                        "MB",
                    );
                    return buffer;
                }

                if (video.gcsUri) {
                    // If we get a GCS URI instead of base64, throw error
                    // (This shouldn't happen with the current API but just in case)
                    throw new HttpError(
                        "Video returned as GCS URI which is not supported",
                        500,
                    );
                }
            }

            throw new HttpError("No video data in response", 500);
        }

        // Not done yet, wait and try again
        await sleep(delayMs);
        delayMs = Math.min(delayMs * 1.2, 30000); // Exponential backoff, cap at 30s
    }

    throw new HttpError("Video generation timed out after 3 minutes", 504);
}
