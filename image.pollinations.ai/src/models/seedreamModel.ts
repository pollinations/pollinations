import debug from "debug";
import { HttpError } from "../httpError.ts";
import { downloadImageAsBase64 } from "../utils/imageDownload.ts";
import { getScaledDimensions } from "../models.ts";
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

// Seedream model versions
const SEEDREAM_4_0 = "seedream-4-0-250828"; // 4.0 - better quality
const SEEDREAM_4_5 = "seedream-4-5-251128"; // 4.5 - 4K, multi-image

/**
 * Calls the ByteDance ARK Seedream 4.0 API for image generation (default, better quality)
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
        logOps("Calling Seedream 4.0 API with prompt:", prompt);

        const apiKey = process.env.BYTEDANCE_API_KEY;
        if (!apiKey) {
            throw new Error(
                "BYTEDANCE_API_KEY environment variable is required",
            );
        }

        // Update progress
        progress.updateBar(
            requestId,
            35,
            "Processing",
            "Generating with Seedream 4.0...",
        );

        const sizeParam = `${safeParams.width}x${safeParams.height}`;
        logOps("Using pixel dimensions:", sizeParam);

        return await generateWithSeedream(
            SEEDREAM_4_0,
            10, // max images for 4.0
            prompt,
            safeParams,
            sizeParam,
            progress,
            requestId,
            apiKey,
            "seedream",
        );
    } catch (error) {
        logError("Error calling Seedream 4.0 API:", error);
        // Preserve HttpError status codes (e.g., 400 for content policy violations)
        if (error instanceof HttpError) {
            throw error;
        }
        throw new Error(`Seedream 4.0 API generation failed: ${error.message}`);
    }
};

/**
 * Calls the ByteDance ARK Seedream 4.5 Pro API for image generation (4K, multi-image)
 * Supports both text-to-image and image-to-image generation
 * @param {string} prompt - The prompt for image generation
 * @param {Object} safeParams - The parameters for image generation (supports image array for image-to-image)
 * @param {ProgressManager} progress - Progress manager for updates
 * @param {string} requestId - Request ID for progress tracking
 * @returns {Promise<ImageGenerationResult>}
 */
export const callSeedreamProAPI = async (
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<ImageGenerationResult> => {
    try {
        logOps("Calling Seedream 4.5 Pro API with prompt:", prompt);

        const apiKey = process.env.BYTEDANCE_API_KEY;
        if (!apiKey) {
            throw new Error(
                "BYTEDANCE_API_KEY environment variable is required",
            );
        }

        // Update progress
        progress.updateBar(
            requestId,
            35,
            "Processing",
            "Generating with Seedream 4.5 Pro...",
        );

        // Scale up dimensions if needed to meet Seedream 4.5's minimum pixel requirement
        const scaled = getScaledDimensions(
            "seedream-pro",
            safeParams.width,
            safeParams.height,
        );
        if (
            scaled.width !== safeParams.width ||
            scaled.height !== safeParams.height
        ) {
            logOps(
                `Scaling up from ${safeParams.width}x${safeParams.height} to ${scaled.width}x${scaled.height} to meet minimum pixel requirement`,
            );
        }
        const sizeParam = `${scaled.width}x${scaled.height}`;
        logOps("Using pixel dimensions:", sizeParam);

        return await generateWithSeedream(
            SEEDREAM_4_5,
            14, // max images for 4.5
            prompt,
            safeParams,
            sizeParam,
            progress,
            requestId,
            apiKey,
            "seedream-pro",
        );
    } catch (error) {
        logError("Error calling Seedream 4.5 Pro API:", error);
        // Preserve HttpError status codes (e.g., 400 for content policy violations)
        if (error instanceof HttpError) {
            throw error;
        }
        throw new Error(
            `Seedream 4.5 Pro API generation failed: ${error.message}`,
        );
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
    actualModelName: string = "seedream",
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
        seed: safeParams.seed,
    };

    // Add image-to-image support if reference images are provided
    // Note: In image-to-image mode, Seedream API may ignore width/height parameters
    // and use the input image dimensions instead (API limitation)
    if (safeParams.image && safeParams.image.length > 0) {
        logOps(
            "Adding reference images for image-to-image generation:",
            safeParams.image.length,
            "images",
        );
        logOps(
            "Note: In image-to-image mode, output dimensions may be determined by input image, not requested size",
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
                const { base64, mimeType } = await downloadImageAsBase64(imageUrl);

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

    // Make API call
    const response = await fetch(
        "https://ark.ap-southeast.bytepluses.com/api/v3/images/generations",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify(requestBody),
        },
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

    const data = (await response.json()) as SeedreamResponse;
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

    const imageResponse = await fetch(imageUrl);

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
            actualModel: actualModelName,
            // Seedream uses unit-based pricing (1 token per image)
            usage: {
                completionImageTokens: 1,
                totalTokenCount: 1,
            },
        },
    };
}
