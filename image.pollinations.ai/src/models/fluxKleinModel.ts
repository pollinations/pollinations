import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import { withTimeoutSignal } from "../util.ts";
import { downloadImageAsBase64 } from "../utils/imageDownload.ts";

const logOps = debug("pollinations:flux-klein:ops");
const logError = debug("pollinations:flux-klein:error");

// Modal endpoints for Flux Klein
const FLUX_KLEIN_GENERATE_URL =
    "https://myceli-ai--flux-klein-fluxklein-generate-web.modal.run";
const FLUX_KLEIN_EDIT_URL =
    "https://myceli-ai--flux-klein-fluxklein-edit-web.modal.run";

/**
 * Calls the Flux Klein Modal API for image generation
 * Supports both text-to-image and image editing (with reference images)
 * @param prompt - The prompt for image generation
 * @param safeParams - The parameters for image generation (supports image array for editing)
 * @param progress - Progress manager for updates
 * @param requestId - Request ID for progress tracking
 * @returns Promise<ImageGenerationResult>
 */
export const callFluxKleinAPI = async (
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<ImageGenerationResult> => {
    try {
        logOps("Calling Flux Klein API with prompt:", prompt);

        const enterToken = process.env.PLN_ENTER_TOKEN;
        if (!enterToken) {
            throw new Error("PLN_ENTER_TOKEN environment variable is required");
        }

        progress.updateBar(
            requestId,
            35,
            "Processing",
            "Generating with Flux Klein...",
        );

        // Check if we have reference images for editing mode
        const hasReferenceImages =
            safeParams.image && safeParams.image.length > 0;

        if (hasReferenceImages) {
            return await generateWithEditing(
                prompt,
                safeParams,
                progress,
                requestId,
                enterToken,
            );
        }

        return await generateTextToImage(
            prompt,
            safeParams,
            progress,
            requestId,
            enterToken,
        );
    } catch (error) {
        logError("Error calling Flux Klein API:", error);
        if (error instanceof HttpError) {
            throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Flux Klein API generation failed: ${message}`);
    }
};

/**
 * Text-to-image generation using GET endpoint
 */
async function generateTextToImage(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
    enterToken: string,
): Promise<ImageGenerationResult> {
    logOps("Using text-to-image mode (GET)");

    // Build query parameters
    const params = new URLSearchParams({
        prompt: prompt,
        width: String(safeParams.width || 1024),
        height: String(safeParams.height || 1024),
    });

    if (safeParams.seed !== undefined) {
        params.append("seed", String(safeParams.seed));
    }

    const url = `${FLUX_KLEIN_GENERATE_URL}?${params.toString()}`;
    logOps("Flux Klein GET URL:", url);

    const response = await withTimeoutSignal(
        (signal) =>
            fetch(url, {
                method: "GET",
                headers: {
                    "x-enter-token": enterToken,
                },
                signal,
            }),
        120000, // 2 minute timeout for cold starts
    );

    if (!response.ok) {
        const errorText = await response.text();
        logError(
            "Flux Klein API request failed, status:",
            response.status,
            "response:",
            errorText,
        );
        throw new HttpError(
            `Flux Klein API request failed: ${errorText}`,
            response.status,
        );
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    logOps("Generated image, buffer size:", imageBuffer.length);

    progress.updateBar(
        requestId,
        90,
        "Success",
        "Flux Klein generation completed",
    );

    return {
        buffer: imageBuffer,
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel: "klein",
            usage: {
                completionImageTokens: 1,
                totalTokenCount: 1,
            },
        },
    };
}

/**
 * Image editing using POST endpoint with base64 images
 */
async function generateWithEditing(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
    enterToken: string,
): Promise<ImageGenerationResult> {
    logOps(
        "Using image editing mode (POST) with",
        safeParams.image?.length,
        "reference images",
    );

    progress.updateBar(
        requestId,
        40,
        "Processing",
        "Downloading reference images...",
    );

    // Download and convert images to base64
    const imageUrls = Array.isArray(safeParams.image)
        ? safeParams.image.slice(0, 10) // Max 10 images
        : [safeParams.image];

    const base64Images: string[] = [];

    for (let i = 0; i < imageUrls.length; i++) {
        const imageUrl = imageUrls[i];
        try {
            logOps(
                `Downloading reference image ${i + 1}/${imageUrls.length} from: ${imageUrl}`,
            );

            const { base64, mimeType } = await withTimeoutSignal(
                (signal) => downloadImageAsBase64(imageUrl, signal),
                30000, // 30 second timeout
            );

            // Create data URL format for Modal endpoint
            const dataUrl = `data:${mimeType};base64,${base64}`;
            base64Images.push(dataUrl);

            logOps(
                `Successfully processed reference image ${i + 1}: ${mimeType}, ${base64.length} chars`,
            );
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            logError(`Error processing reference image ${i + 1}:`, message);
            // Continue with other images
        }
    }

    if (base64Images.length === 0) {
        throw new Error("Failed to download any reference images");
    }

    logOps("Image editing mode with", base64Images.length, "processed images");

    // Build query parameters for edit endpoint
    const params = new URLSearchParams({
        prompt: prompt,
        width: String(safeParams.width || 1024),
        height: String(safeParams.height || 1024),
    });

    if (safeParams.seed !== undefined) {
        params.append("seed", String(safeParams.seed));
    }

    const editUrl = `${FLUX_KLEIN_EDIT_URL}?${params.toString()}`;
    logOps("Flux Klein POST URL:", editUrl);
    logOps("Sending", base64Images.length, "images in body");

    progress.updateBar(
        requestId,
        50,
        "Processing",
        "Generating with Flux Klein (editing)...",
    );

    const response = await withTimeoutSignal(
        (signal) =>
            fetch(editUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-enter-token": enterToken,
                },
                body: JSON.stringify(base64Images),
                signal,
            }),
        120000, // 2 minute timeout for cold starts
    );

    if (!response.ok) {
        const errorText = await response.text();
        logError(
            "Flux Klein edit API request failed, status:",
            response.status,
            "response:",
            errorText,
        );
        throw new HttpError(
            `Flux Klein edit API request failed: ${errorText}`,
            response.status,
        );
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    logOps("Generated edited image, buffer size:", imageBuffer.length);

    progress.updateBar(
        requestId,
        90,
        "Success",
        "Flux Klein editing completed",
    );

    return {
        buffer: imageBuffer,
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel: "klein",
            usage: {
                completionImageTokens: 1,
                totalTokenCount: 1,
            },
        },
    };
}
