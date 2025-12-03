import debug from "debug";
import { withTimeoutSignal } from "../util.ts";
import { HttpError } from "../httpError.ts";
import { downloadImageAsBase64 } from "../utils/imageDownload.ts";
import type { ImageParams } from "../params.ts";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import type { ProgressManager } from "../progressBar.ts";

// Logger
const logOps = debug("pollinations:seedream:ops");
const logError = debug("pollinations:seedream:error");

interface SeedreamResponse {
    model: string;
    created: number;
    data: Array<{
        url: string;
        size: string;
    }>;
    usage: {
        generated_images: number;
        output_tokens: number;
        total_tokens: number;
    };
}

/**
 * Calls the ByteDance ARK Seedream API for image generation
 * Supports both text-to-image and image-to-image generation
 * @param {string} prompt - The prompt for image generation
 * @param {Object} safeParams - The parameters for image generation (supports image array for image-to-image)
 * @param {ProgressManager} progress - Progress manager for updates
 * @param {string} requestId - Request ID for progress tracking
 * @returns {Promise<ImageGenerationResult>}
 */
export const callSeedreamAPI = async (
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<ImageGenerationResult> => {
    try {
        logOps("Calling Seedream API with prompt:", prompt);

        const apiKey = process.env.SEEDREAM_API_KEY;
        if (!apiKey) {
            throw new Error(
                "SEEDREAM_API_KEY environment variable is required",
            );
        }

        // Update progress
        progress.updateBar(
            requestId,
            35,
            "Processing",
            "Generating with Seedream...",
        );

        // Seedream 4.5 accepts pixel dimensions like "2048x2048"
        const sizeParam = `${safeParams.width}x${safeParams.height}`;
        logOps("Using pixel dimensions:", sizeParam);

        // Try Seedream 4.5 first, fallback to 4.0 if rate limited
        try {
            return await generateWithSeedream(
                "seedream-4-5-251128",
                14, // max images for 4.5
                prompt,
                safeParams,
                sizeParam,
                progress,
                requestId,
                apiKey,
            );
        } catch (error) {
            // If 4.5 fails with rate limit or server error, fallback to 4.0
            if (
                error instanceof HttpError &&
                (error.status === 429 || error.status >= 500)
            ) {
                logOps(
                    "Seedream 4.5 failed with status",
                    error.status,
                    "- falling back to 4.0...",
                );
                return await generateWithSeedream(
                    "seedream-4-0-250828",
                    10, // max images for 4.0
                    prompt,
                    safeParams,
                    sizeParam,
                    progress,
                    requestId,
                    apiKey,
                );
            }
            throw error;
        }
    } catch (error) {
        logError("Error calling Seedream API:", error);
        // Preserve HttpError status codes (e.g., 400 for content policy violations)
        if (error instanceof HttpError) {
            throw error;
        }
        throw new Error(`Seedream API generation failed: ${error.message}`);
    }
};

/**
 * Internal function to generate image with specific Seedream model version
 */
async function generateWithSeedream(
    modelVersion: string,
    maxReferenceImages: number,
    prompt: string,
    safeParams: ImageParams,
    sizeParam: string,
    progress: ProgressManager,
    requestId: string,
    apiKey: string,
): Promise<ImageGenerationResult> {
    // Prepare request body
    const requestBody: any = {
        model: modelVersion,
        prompt: prompt,
        sequential_image_generation: "disabled",
        response_format: "url",
        size: sizeParam,
        stream: false,
        watermark: false,
    };

    // Add image-to-image support if reference images are provided
    if (safeParams.image && safeParams.image.length > 0) {
        logOps(
            "Adding reference images for image-to-image generation:",
            safeParams.image.length,
            "images",
        );

        // Update progress for image processing
        progress.updateBar(
            requestId,
            40,
            "Processing",
            "Downloading reference images...",
        );

        // Use maxReferenceImages parameter for version-specific limits
        const imageUrls = Array.isArray(safeParams.image)
            ? safeParams.image.slice(0, maxReferenceImages)
            : [safeParams.image];

        // Download and convert images to base64 to bypass hosting provider blocks
        const processedImages: string[] = [];

        for (let i = 0; i < imageUrls.length; i++) {
            const imageUrl = imageUrls[i];
            try {
                logOps(
                    `Downloading reference image ${i + 1}/${imageUrls.length} from: ${imageUrl}`,
                );

                // Download and detect MIME type from magic bytes
                const { base64, mimeType } = await withTimeoutSignal(
                    (signal) => downloadImageAsBase64(imageUrl),
                    30000, // 30 second timeout
                );

                // Create data URL format: data:image/jpeg;base64,<base64data>
                const dataUrl = `data:${mimeType};base64,${base64}`;
                processedImages.push(dataUrl);

                logOps(
                    `Successfully processed reference image ${i + 1}: ${mimeType}, ${base64.length} chars`,
                );
            } catch (error) {
                logError(
                    `Error processing reference image ${i + 1}:`,
                    error.message,
                );
                // Continue with other images
            }
        }

        if (processedImages.length === 0) {
            throw new Error("Failed to download any reference images");
        }

        // For single image, pass as string; for multiple images, pass as array
        requestBody.image =
            processedImages.length === 1 ? processedImages[0] : processedImages;

        logOps(
            "Image-to-image mode enabled with",
            processedImages.length,
            "processed reference image(s)",
        );
    }

    logOps("Seedream API request body:", JSON.stringify(requestBody, null, 2));

    // Make API call with timeout
    const response = await withTimeoutSignal(
        (signal) =>
            fetch(
                "https://ark.ap-southeast.bytepluses.com/api/v3/images/generations",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify(requestBody),
                    signal,
                },
            ),
        60000, // 60 second timeout
    );

    if (!response.ok) {
        const errorText = await response.text();
        logError(
            `Seedream API request failed, status:`,
            response.status,
            "response:",
            errorText,
        );
        // Pass through the original status code from Seedream API
        // 400 errors are client errors (invalid parameters, content policy, etc.)
        throw new HttpError(
            `Seedream API request failed: ${errorText}`,
            response.status,
        );
    }

    const data: SeedreamResponse = await response.json();
    logOps("Seedream API response:", JSON.stringify(data, null, 2));

    if (!data.data || !data.data[0] || !data.data[0].url) {
        throw new Error(
            "Invalid response from Seedream API - no image URL received",
        );
    }

    // Download the generated image
    progress.updateBar(
        requestId,
        70,
        "Processing",
        "Downloading generated image...",
    );

    const imageUrl = data.data[0].url;
    logOps("Downloading image from URL:", imageUrl);

    const imageResponse = await withTimeoutSignal(
        (signal) => fetch(imageUrl, { signal }),
        30000, // 30 second timeout for image download
    );

    if (!imageResponse.ok) {
        throw new Error(
            `Failed to download image: ${imageResponse.status} ${imageResponse.statusText}`,
        );
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    logOps("Downloaded image, buffer size:", imageBuffer.length);

    progress.updateBar(
        requestId,
        90,
        "Success",
        "Seedream generation completed",
    );

    return {
        buffer: imageBuffer,
        isMature: false, // Seedream has built-in content filtering
        isChild: false,
        // Include tracking data for enter service headers
        trackingData: {
            actualModel: "seedream",
            // Seedream uses unit-based pricing (1 token per image)
            usage: {
                completionImageTokens: 1,
                totalTokenCount: 1,
            },
        },
    };
}
