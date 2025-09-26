import debug from "debug";
import { withTimeoutSignal } from "../util.ts";
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
            throw new Error("SEEDREAM_API_KEY environment variable is required");
        }

        // Update progress
        progress.updateBar(requestId, 35, "Processing", "Generating with Seedream...");

        // Determine size parameter based on dimensions
        // Seedream 4.0 supports both resolution strings (1K, 2K, 4K) and pixel dimensions
        let sizeParam: string;
        
        if (safeParams.width && safeParams.height) {
            // Use exact pixel dimensions if provided
            sizeParam = `${safeParams.width}x${safeParams.height}`;
            logOps("Using exact pixel dimensions:", sizeParam);
        } else {
            // Fall back to resolution strings based on total pixels
            const totalPixels = (safeParams.width || 2048) * (safeParams.height || 2048);
            
            if (totalPixels <= 1024 * 1024) {
                sizeParam = "1K";
            } else if (totalPixels <= 2048 * 2048) {
                sizeParam = "2K";
            } else {
                sizeParam = "4K";
            }
            logOps("Using resolution string:", sizeParam, "for", totalPixels, "total pixels");
        }

        // Prepare request body
        const requestBody: any = {
            model: "seedream-4-0-250828",
            prompt: prompt,
            sequential_image_generation: "disabled",
            response_format: "url",
            size: sizeParam,
            stream: false,
            watermark: false,
        };

        // Add image-to-image support if reference images are provided
        if (safeParams.image && safeParams.image.length > 0) {
            logOps("Adding reference images for image-to-image generation:", safeParams.image.length, "images");
            
            // Seedream 4.0 supports up to 10 reference images
            const imageUrls = Array.isArray(safeParams.image) 
                ? safeParams.image.slice(0, 10) // Limit to max 10 images
                : [safeParams.image];
            
            // For single image, pass as string; for multiple images, pass as array
            requestBody.image = imageUrls.length === 1 ? imageUrls[0] : imageUrls;
            
            logOps("Image-to-image mode enabled with", imageUrls.length, "reference image(s)");
        }

        logOps("Seedream API request body:", JSON.stringify(requestBody, null, 2));

        // Make API call with timeout
        const response = await withTimeoutSignal(
            (signal) =>
                fetch("https://ark.ap-southeast.bytepluses.com/api/v3/images/generations", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify(requestBody),
                    signal,
                }),
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
            throw new Error(
                `Seedream API request failed with status ${response.status}: ${errorText}`,
            );
        }

        const data: SeedreamResponse = await response.json();
        logOps("Seedream API response:", JSON.stringify(data, null, 2));

        if (!data.data || !data.data[0] || !data.data[0].url) {
            throw new Error("Invalid response from Seedream API - no image URL received");
        }

        // Download the generated image
        progress.updateBar(requestId, 70, "Processing", "Downloading generated image...");
        
        const imageUrl = data.data[0].url;
        logOps("Downloading image from URL:", imageUrl);

        const imageResponse = await withTimeoutSignal(
            (signal) => fetch(imageUrl, { signal }),
            30000, // 30 second timeout for image download
        );

        if (!imageResponse.ok) {
            throw new Error(`Failed to download image: ${imageResponse.status} ${imageResponse.statusText}`);
        }

        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
        logOps("Downloaded image, buffer size:", imageBuffer.length);

        progress.updateBar(requestId, 90, "Success", "Seedream generation completed");

        return {
            buffer: imageBuffer,
            isMature: false, // Seedream has built-in content filtering
            isChild: false,
            // Include tracking data for enter service headers
            trackingData: {
                actualModel: 'seedream',
                // Seedream uses unit-based pricing (1 token per image)
                usage: {
                    candidatesTokenCount: 1,
                    totalTokenCount: 1
                }
            }
        };

    } catch (error) {
        logError("Error calling Seedream API:", error);
        throw new Error(`Seedream API generation failed: ${error.message}`);
    }
};
