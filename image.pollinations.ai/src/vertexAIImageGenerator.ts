/**
 * Vertex AI Image Generator Integration
 * Handles the complete flow from request to image generation using Gemini
 */

import debug from "debug";
import { withTimeoutSignal } from "./util.ts";
import { HttpError } from "./httpError.ts";
import { generateImageWithVertexAI } from "./vertexAIClient.ts";
import { writeExifMetadata } from "./writeExifMetadata.js";
import { downloadImageAsBase64 } from "./utils/imageDownload.ts";
import type { ImageParams } from "./params.js";
import type {
    ImageGenerationResult,
    AuthResult,
} from "./createAndReturnImages.js";
import { generateTransparentImage } from "./utils/transparentImage.ts";
import type { VertexAIImageData } from "./vertexAIClient.ts";

const log = debug("pollinations:vertex-ai-generator");
const errorLog = debug("pollinations:vertex-ai-generator:error");

/**
 * Add simple prefix to help Nano Banana understand the prompt better
 * @param {string} userPrompt - Original user prompt
 * @returns {string} - Enhanced prompt with prefix
 */
function addNanoBananaPrefix(userPrompt: string): string {
    // Simple prefix to help Nano Banana interpret prompts as image generation requests
    return `Generate an image but only if the prompt and input images are safe. Else return an error: ${userPrompt}`;
}

/**
 * Process nanobanana requests with special logic for height/width parameters
 * @param {string} prompt - Original user prompt
 * @param {ImageParams} safeParams - Parameters for image generation
 * @returns {Promise<{processedPrompt: string, processedParams: ImageParams, transparentImage?: VertexAIImageData}>} - Processed prompt, parameters, and optional transparent image
 */
async function processNanobananaRequest(
    prompt: string,
    safeParams: ImageParams,
): Promise<{
    processedPrompt: string;
    processedParams: ImageParams;
    transparentImage?: VertexAIImageData;
}> {
    // Check if this is a nanobanana/nanobanana-pro request with height/width parameters
    const isNanoBananaModel =
        safeParams.model === "nanobanana" ||
        safeParams.model === "nanobanana-pro";
    if (!isNanoBananaModel || !safeParams.width || !safeParams.height) {
        // Return original values for non-nanobanana models or when dimensions are missing
        return { processedPrompt: prompt, processedParams: safeParams };
    }

    // Skip transparent image generation for 1:1 aspect ratio (default behavior works fine)
    const aspectRatio = safeParams.width / safeParams.height;
    if (Math.abs(aspectRatio - 1.0) < 0.001) {
        // Use small epsilon for floating point comparison
        log(
            `Skipping transparent image generation for 1:1 aspect ratio (${safeParams.width}x${safeParams.height})`,
        );
        return { processedPrompt: prompt, processedParams: safeParams };
    }

    log("Processing nanobanana request with height/width parameters");
    log(
        `Dimensions: ${safeParams.width}x${safeParams.height}, aspect ratio: ${aspectRatio.toFixed(3)}`,
    );

    try {
        // Generate transparent image for the specified dimensions
        const transparentImage = await generateTransparentImage(
            safeParams.width,
            safeParams.height,
        );
        log(
            `Generated transparent image: ${transparentImage.base64.length} base64 chars`,
        );

        // Add post-prompt after user prompt
        const postPrompt =
            " The last image defines the aspect ratio. Generate the content to match that aspect ratio, completely replacing the last image while keeping its dimensions. Make sure no blank areas are left";

        const processedPrompt = `${prompt}${postPrompt}`;

        return {
            processedPrompt,
            processedParams: safeParams,
            transparentImage,
        };
    } catch (error) {
        errorLog("Error processing nanobanana request:", error);
        // Return original values on error to maintain backward compatibility
        return { processedPrompt: prompt, processedParams: safeParams };
    }
}

/**
 * Generate image using Vertex AI Gemini and return formatted response
 */
export async function callVertexAIGemini(
    prompt: string,
    safeParams: ImageParams,
    userInfo: AuthResult,
): Promise<ImageGenerationResult> {
    try {
        log("Starting Vertex AI Gemini image generation");

        // Process nanobanana request with special logic if needed
        const {
            processedPrompt,
            processedParams,
            transparentImage: generatedTransparentImage,
        } = await processNanobananaRequest(prompt, safeParams);

        // Add Nano Banana optimized prefix to the processed prompt
        const enhancedPrompt = addNanoBananaPrefix(processedPrompt);

        log("Original prompt:", prompt.substring(0, 100));
        log("Enhanced prompt:", enhancedPrompt.substring(0, 100));
        log("Parameters:", {
            width: processedParams.width,
            height: processedParams.height,
            model: processedParams.model,
            hasReferenceImages: !!(
                processedParams.image && processedParams.image.length > 0
            ),
        });

        // Process all reference images (URLs + transparent image) into base64 format
        const processedImages: any[] = [];

        // Process URL-based reference images
        if (processedParams.image && processedParams.image.length > 0) {
            log(
                `Processing ${processedParams.image.length} reference image URLs`,
            );

            for (let i = 0; i < processedParams.image.length; i++) {
                const imageUrl = processedParams.image[i];
                try {
                    log(
                        `Fetching reference image ${i + 1}/${processedParams.image.length}: ${imageUrl}`,
                    );

                    // Download and detect MIME type from magic bytes
                    const { base64, mimeType } =
                        await downloadImageAsBase64(imageUrl);

                    processedImages.push({
                        base64: base64,
                        mimeType: mimeType,
                    });

                    log(
                        `Successfully processed reference image ${i + 1}: ${mimeType}, ${base64.length} chars`,
                    );
                } catch (error) {
                    errorLog(
                        `Error processing reference image ${i + 1}:`,
                        error,
                    );
                    // Continue with other images
                }
            }
        }

        // Add transparent image if it was generated for nanobanana
        if (generatedTransparentImage) {
            processedImages.push({
                base64: generatedTransparentImage.base64,
                mimeType: generatedTransparentImage.mimeType,
            });
            log(
                `Added transparent image to processed images. Total images: ${processedImages.length}`,
            );
        }

        // Determine the Vertex AI model based on the model parameter
        const vertexModel =
            safeParams.model === "nanobanana-pro"
                ? "gemini-3-pro-image-preview" // Nano Banana Pro
                : "gemini-2.5-flash-image-preview"; // Nano Banana (default)

        const vertexRequest = {
            prompt: enhancedPrompt,
            width: processedParams.width,
            height: processedParams.height,
            referenceImages: processedImages,
            model: vertexModel,
        };

        // Generate image using Vertex AI
        const result = await generateImageWithVertexAI(vertexRequest);

        log("Vertex AI generation successful");
        log(
            "Result object:",
            JSON.stringify(
                {
                    hasImageData: !!result.imageData,
                    imageDataType: typeof result.imageData,
                    imageDataLength: result.imageData?.length || 0,
                    mimeType: result.mimeType,
                    hasTextResponse: !!result.textResponse,
                    usage: result.usage,
                },
                null,
                2,
            ),
        );

        // Check for content policy violations in successful response
        const hasContentViolation = result.fullResponse?.candidates?.some(
            (c) =>
                c.finishReason === "SAFETY" ||
                c.finishReason === "PROHIBITED_CONTENT" ||
                c.finishReason === "SPII",
        );

        if (hasContentViolation) {
            const violationError = new Error(
                "Content policy violation detected in response",
            );
            throw violationError;
        }

        // Log usage metadata from Vertex AI for debugging token counts (without full response to avoid base64 bloat)
        log("=== VERTEX AI USAGE METADATA ===");
        log("candidatesTokenCount:", result.usage?.candidatesTokenCount);
        log("promptTokenCount:", result.usage?.promptTokenCount);
        log("totalTokenCount:", result.usage?.totalTokenCount);
        log("================================");

        if (!result.imageData) {
            errorLog(
                "ERROR: No imageData in result from generateImageWithVertexAI - likely content policy violation",
            );

            // Extract all available information from the response
            const geminiExplanation = result.textResponse;
            const finishReason = result.finishReason;
            const safetyRatings = result.safetyRatings;

            // Build informative error message with all available information
            if (geminiExplanation) {
                // Return Gemini's actual explanation to the user
                throw new HttpError(`Gemini: ${geminiExplanation}`, 400);
            }

            // If we have safety ratings, extract details
            if (safetyRatings && safetyRatings.length > 0) {
                const blockedCategories = safetyRatings
                    .filter((rating: any) => rating.blocked)
                    .map((rating: any) => rating.category)
                    .join(", ");

                const highProbCategories = safetyRatings
                    .filter(
                        (rating: any) =>
                            rating.probability === "HIGH" ||
                            rating.probability === "MEDIUM",
                    )
                    .map(
                        (rating: any) =>
                            `${rating.category} (${rating.probability})`,
                    )
                    .join(", ");

                if (blockedCategories) {
                    throw new HttpError(
                        `${finishReason || "Content blocked"}: ${blockedCategories}`,
                        400,
                    );
                } else if (highProbCategories) {
                    throw new HttpError(
                        `${finishReason || "Content flagged"}: ${highProbCategories}`,
                        400,
                    );
                }
            }

            // Return finish reason if available
            if (finishReason) {
                throw new HttpError(finishReason, 400);
            }

            // Fallback for cases with no additional information
            throw new HttpError("No image data returned from Vertex AI", 400);
        }

        // Convert base64 to buffer
        const imageBuffer = Buffer.from(result.imageData, "base64");

        log("Converted to buffer, size:", imageBuffer.length);

        // Add EXIF metadata to the image (use original prompt, not enhanced)
        let finalImageBuffer: Buffer;
        try {
            finalImageBuffer = await writeExifMetadata(
                imageBuffer,
                {
                    prompt, // Original user prompt, not enhanced
                    model: safeParams.model,
                    width: safeParams.width,
                    height: safeParams.height,
                },
                {
                    generator:
                        safeParams.model === "nanobanana-pro"
                            ? "Vertex AI Gemini 3 Pro Image Preview"
                            : "Vertex AI Gemini 2.5 Flash Image Preview",
                    textResponse: result.textResponse,
                    usage: result.usage,
                },
            );
            log("EXIF metadata added successfully");
        } catch (exifError) {
            errorLog(
                "Failed to add EXIF metadata, using original image:",
                exifError,
            );
            finalImageBuffer = imageBuffer;
        }

        // Return in the expected ImageGenerationResult format
        return {
            buffer: finalImageBuffer,
            isMature: false, // Gemini has built-in safety, assume safe
            isChild: false, // Gemini has built-in safety, assume not child content
            // Include tracking data for enter service headers
            trackingData: {
                actualModel: safeParams.model,
                usage: {
                    // Convert Vertex AI format to unified format
                    completionImageTokens:
                        result.usage?.candidatesTokenCount || 1,
                    promptTokenCount: result.usage?.promptTokenCount,
                    totalTokenCount: result.usage?.totalTokenCount,
                },
            },
        };
    } catch (error) {
        errorLog("Error in callVertexAIGemini:", error);

        // Extract response data from error if available
        const errorResponseData = (error as any).responseData || null;

        // Extract refusal reason from error response if available
        const refusalDetails = errorResponseData
            ? {
                  refusalReason:
                      errorResponseData.textResponse ||
                      errorResponseData.candidates?.[0]?.finishReason ||
                      error.message,
                  textResponse: errorResponseData.textResponse,
                  finishReason: errorResponseData.candidates?.[0]?.finishReason,
              }
            : {
                  refusalReason: error.message,
                  textResponse: null,
                  finishReason: null,
              };

        // Preserve Gemini's text response if it's already formatted (starts with "Gemini:")
        const errorMessage = error.message;
        if (errorMessage.startsWith("Gemini:")) {
            throw error; // Re-throw as-is to preserve the original response
        }

        // Preserve HttpError status codes (e.g., 400 for content policy violations)
        if (error instanceof HttpError) {
            throw error;
        }

        throw new Error(
            `Vertex AI Gemini image generation failed: ${error.message}`,
        );
    }
}
