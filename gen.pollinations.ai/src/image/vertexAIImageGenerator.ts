/**
 * Vertex AI Image Generator Integration
 * Handles the complete flow from request to image generation using Gemini
 */

import debug from "debug";
import type { ImageGenerationResult } from "./createAndReturnImages.js";
import { HttpError } from "./httpError.ts";
import type { ImageParams } from "./params.js";
import { base64ToBuffer, downloadUserImage } from "./utils/imageDownload.ts";
import { generateImageWithVertexAI } from "./vertexAIClient.ts";
import { writeExifMetadata } from "./writeExifMetadata.js";

const log = debug("pollinations:vertex-ai-generator");
const errorLog = debug("pollinations:vertex-ai-generator:error");

/** Mapping from pollinations model names to Vertex AI model IDs and display names */
const NANOBANANA_MODELS: Record<string, { vertex: string; name: string }> = {
    "nanobanana-pro": {
        vertex: "gemini-3-pro-image-preview",
        name: "Vertex AI Gemini 3 Pro Image Preview",
    },
    "nanobanana-2": {
        vertex: "gemini-3.1-flash-image-preview",
        name: "Vertex AI Gemini 3.1 Flash Image Preview",
    },
    "nanobanana": {
        vertex: "gemini-2.5-flash-image",
        name: "Vertex AI Gemini 2.5 Flash Image",
    },
};

/**
 * Build an informative HttpError when Vertex AI returns no image data.
 * Checks in order: Gemini text explanation, blocked safety categories,
 * high-probability safety categories, finish reason, then a generic fallback.
 */
function buildNoImageDataError(result: {
    textResponse?: string;
    finishReason?: string;
    safetyRatings?: any[];
}): HttpError {
    if (result.textResponse) {
        return new HttpError(`Gemini: ${result.textResponse}`, 400);
    }

    if (result.safetyRatings && result.safetyRatings.length > 0) {
        const blockedCategories = result.safetyRatings
            .filter((r: any) => r.blocked)
            .map((r: any) => r.category)
            .join(", ");

        if (blockedCategories) {
            return new HttpError(
                `${result.finishReason || "Content blocked"}: ${blockedCategories}`,
                400,
            );
        }

        const highProbCategories = result.safetyRatings
            .filter(
                (r: any) =>
                    r.probability === "HIGH" || r.probability === "MEDIUM",
            )
            .map((r: any) => `${r.category} (${r.probability})`)
            .join(", ");

        if (highProbCategories) {
            return new HttpError(
                `${result.finishReason || "Content flagged"}: ${highProbCategories}`,
                400,
            );
        }
    }

    if (result.finishReason) {
        return new HttpError(result.finishReason, 400);
    }

    return new HttpError("No image data returned from Vertex AI", 400);
}

/**
 * Generate image using Vertex AI Gemini and return formatted response
 */
export async function callVertexAIGemini(
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> {
    try {
        log("Starting Vertex AI Gemini image generation");

        log("Prompt:", prompt.substring(0, 100));
        log("Parameters:", {
            width: safeParams.width,
            height: safeParams.height,
            model: safeParams.model,
            hasReferenceImages: !!(
                safeParams.image && safeParams.image.length > 0
            ),
        });

        // Process reference image URLs into base64 format
        const processedImages: any[] = [];

        if (safeParams.image && safeParams.image.length > 0) {
            log(`Processing ${safeParams.image.length} reference image URLs`);

            for (let i = 0; i < safeParams.image.length; i++) {
                const imageUrl = safeParams.image[i];
                try {
                    log(
                        `Fetching reference image ${i + 1}/${safeParams.image.length}: ${imageUrl}`,
                    );

                    // Download and detect MIME type from magic bytes
                    const { buffer, mimeType } =
                        await downloadUserImage(imageUrl);
                    const base64 = buffer.toString("base64");

                    processedImages.push({
                        base64,
                        mimeType,
                    });

                    log(
                        `Successfully processed reference image ${i + 1}: ${mimeType}, ${base64.length} chars`,
                    );
                } catch (error) {
                    errorLog(
                        `Error processing reference image ${i + 1}:`,
                        error,
                    );
                    // User-supplied URL failure is client error — surface as 400.
                    if (error instanceof HttpError) throw error;
                    // Continue with other images on non-HTTP errors
                }
            }
        }

        // Determine the Vertex AI model based on the model parameter
        const modelConfig =
            NANOBANANA_MODELS[safeParams.model] ||
            NANOBANANA_MODELS["nanobanana"];
        const vertexModel = modelConfig.vertex;

        const vertexRequest = {
            prompt,
            width: safeParams.width,
            height: safeParams.height,
            referenceImages: processedImages,
            model: vertexModel,
            safe: safeParams.safe as boolean,
            reasoning: safeParams.reasoning,
            ...(safeParams.seed !== undefined && {
                seed: safeParams.seed as number,
            }),
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
            (c: { finishReason?: string }) =>
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
            throw buildNoImageDataError(result);
        }

        // Convert base64 to buffer
        const imageBuffer = base64ToBuffer(result.imageData);

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
                    generator: modelConfig.name,
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
                    completionReasoningTokens: result.usage?.thoughtsTokenCount,
                },
            },
        };
    } catch (error) {
        errorLog("Error in callVertexAIGemini:", error);

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
