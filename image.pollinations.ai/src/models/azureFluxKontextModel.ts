import debug from "debug";
import { sanitizeString } from "../translateIfNecessary.ts";
import { analyzeImageSafety, analyzeTextSafety } from "../utils/azureContentSafety.ts";
import { logGptImageError, logGptImagePrompt } from "../utils/gptImageLogger.ts";
import type { ImageParams } from "../params.ts";
import type { ImageGenerationResult, AuthResult } from "../createAndReturnImages.ts";

const logError = debug("pollinations:error");
const logCloudflare = debug("pollinations:cloudflare");

/**
 * Calls the Azure Flux Kontext API to generate or edit images
 * Supports both text-to-image generation and image-to-image editing
 * @param {string} prompt - The prompt for image generation or editing
 * @param {Object} safeParams - The parameters for image generation or editing
 * @param {Object} userInfo - Complete user authentication info object
 * @returns {Promise<ImageGenerationResult>}
 */
export async function callAzureFluxKontext(
    prompt: string,
    safeParams: ImageParams,
    userInfo: AuthResult,
): Promise<ImageGenerationResult> {
    const apiKey = process.env.AZURE_FLUX_KONTEXT_API_KEY;
    let endpoint = process.env.AZURE_FLUX_KONTEXT_ENDPOINT;

    if (!apiKey || !endpoint) {
        throw new Error(
            "Azure Flux Kontext API key or endpoint not found in environment variables",
        );
    }

    // Check if we need to use the edits endpoint instead of generations
    const isEditMode = safeParams.image && safeParams.image.length > 0;
    
    // Add the appropriate endpoint path and API version
    if (isEditMode) {
        endpoint = `${endpoint}/images/edits?api-version=2025-04-01-preview`;
        logCloudflare("Using Azure Flux Kontext in edit mode");
    } else {
        endpoint = `${endpoint}/images/generations?api-version=2025-04-01-preview`;
        logCloudflare("Using Azure Flux Kontext in generation mode");
    }

    // Check prompt safety with Azure Content Safety (with 30s timeout)
    logCloudflare("Checking prompt safety...");
    const SAFETY_CHECK_TIMEOUT_MS = 30000; // 30 seconds
    const safetyCheckPromise = analyzeTextSafety(prompt);
    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
            reject(new Error(`Azure Content Safety check timeout after ${SAFETY_CHECK_TIMEOUT_MS / 1000}s`));
        }, SAFETY_CHECK_TIMEOUT_MS);
    });
    
    const promptSafetyResult = await Promise.race([safetyCheckPromise, timeoutPromise]);

    // Log the prompt with safety analysis results
    await logGptImagePrompt(
        prompt,
        safeParams,
        userInfo,
        promptSafetyResult,
    );

    if (!promptSafetyResult.safe) {
        const errorMessage = `Prompt contains unsafe content: ${promptSafetyResult.formattedViolations}`;
        logError("Azure Content Safety rejected prompt:", errorMessage);

        const error = new Error(errorMessage);
        await logGptImageError(
            prompt,
            safeParams,
            userInfo,
            error,
            promptSafetyResult,
        );
        throw error;
    }

    // Map safeParams to Azure API parameters
    const size = `${safeParams.width}x${safeParams.height}`;

    // Build request body for generation mode
    const requestBody = {
        prompt: sanitizeString(prompt),
        size: size,
        n: 1,
        model: "flux.1-kontext-pro",
    };

    logCloudflare("Calling Azure Flux Kontext API with params:", requestBody);

    let response = null;

    if (isEditMode) {
        // For edit mode, use FormData (multipart/form-data)
        const formData = new FormData();

        // Add the prompt
        formData.append("prompt", sanitizeString(prompt));
        formData.append("model", "flux.1-kontext-pro");

        // Handle images based on their type
        try {
            // Convert to array if it's a string (backward compatible)
            const imageUrls = Array.isArray(safeParams.image)
                ? safeParams.image
                : [safeParams.image];

            if (imageUrls.length === 0) {
                throw new Error(
                    "Image URL is required for Flux Kontext edit mode but was not provided",
                );
            }

            // Process the first image (Flux Kontext typically uses single image)
            const imageUrl = imageUrls[0];
            logCloudflare(`Fetching image from URL: ${imageUrl}`);

            const imageResponse = await fetch(imageUrl);
            if (!imageResponse.ok) {
                throw new Error(
                    `Failed to fetch image from URL: ${imageUrl}`,
                );
            }

            const imageArrayBuffer = await imageResponse.arrayBuffer();
            const buffer = Buffer.from(imageArrayBuffer);

            // Check safety of input image (with 30s timeout)
            logCloudflare("Checking safety of input image");
            const IMAGE_SAFETY_TIMEOUT_MS = 30000; // 30 seconds
            const imageSafetyCheckPromise = analyzeImageSafety(buffer);
            const imageTimeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`Azure Image Safety check timeout after ${IMAGE_SAFETY_TIMEOUT_MS / 1000}s`));
                }, IMAGE_SAFETY_TIMEOUT_MS);
            });
            
            const imageSafetyResult = await Promise.race([imageSafetyCheckPromise, imageTimeoutPromise]);

            if (!imageSafetyResult.safe) {
                const errorMessage = `Input image contains unsafe content: ${imageSafetyResult.formattedViolations}`;
                const error = new Error(errorMessage);
                await logGptImageError(
                    prompt,
                    safeParams,
                    userInfo,
                    error,
                    imageSafetyResult,
                );
                throw error;
            }

            // Determine file extension from Content-Type header
            const contentType = imageResponse.headers.get("content-type") || "";
            let extension = ".png"; // Default extension

            if (contentType.startsWith("image/")) {
                const mimeExtension = contentType
                    .split("/")[1]
                    .split(";")[0];
                extension = `.${mimeExtension}`;
            }

            // Create a Blob and append to FormData
            const imageBlob = new Blob([imageArrayBuffer], { type: contentType });
            formData.append("image", imageBlob, `image${extension}`);
        } catch (error) {
            logError("Error processing image for editing:", error);
            throw new Error(`Failed to process image: ${error.message}`);
        }

        // Log the endpoint for debugging
        logCloudflare(`Sending edit request to endpoint: ${endpoint}`);

        // Send the edit request
        response = await fetch(endpoint, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
            // biome-ignore lint: linter is confused here
            body: formData as any,
        });

        logCloudflare(`Edit request response status: ${response.status}`);
    } else {
        // Standard JSON request for generation
        response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(requestBody),
        });

        logCloudflare(`Generation request response status: ${response.status}`);
    }

    if (!response.ok) {
        const errorResponse = response.clone();
        const errorText = await errorResponse.text();
        throw new Error(
            `Azure Flux Kontext API error: ${response.status} - ${errorText}`,
        );
    }

    const data = await response.json();

    if (!data.data || !data.data[0] || !data.data[0].b64_json) {
        throw new Error("Invalid response from Azure Flux Kontext API");
    }

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(data.data[0].b64_json, "base64");

    // Return result with content safety flags from Azure response
    return {
        buffer: imageBuffer,
        isMature: data.data[0].content_filter_results?.sexual?.filtered || false,
        isChild: false, // Azure doesn't provide child detection
        trackingData: {
            actualModel: "kontext",
            usage: {
                completionImageTokens: 1,
                totalTokenCount: 1
            }
        }
    };
}
