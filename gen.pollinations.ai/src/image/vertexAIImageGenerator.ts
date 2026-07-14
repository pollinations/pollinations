/**
 * Vertex AI Image Generator Integration
 * Handles the complete flow from request to image generation using Gemini
 */

import type { Usage } from "@shared/registry/registry.ts";
import debug from "debug";
import type { ImageGenerationResult } from "./createAndReturnImages.js";
import { HttpError } from "./httpError.ts";
import type { ImageParams } from "./params.js";
import { base64ToBuffer, downloadUserImage } from "./utils/imageDownload.ts";
import {
    generateImageWithVertexAI,
    type VertexAIImageData,
    type VertexAIModality,
    type VertexAIModalityTokenCount,
    type VertexAISafetyRating,
    type VertexAIUsageMetadata,
} from "./vertexAIClient.ts";
import { writeExifMetadata } from "./writeExifMetadata.js";

const log = debug("pollinations:vertex-ai-generator");
const errorLog = debug("pollinations:vertex-ai-generator:error");

/** Mapping from pollinations model names to Vertex AI model IDs and display names */
const NANOBANANA_MODELS = {
    "nanobanana-pro": {
        vertex: "gemini-3-pro-image",
        name: "Vertex AI Gemini 3 Pro Image",
    },
    "nanobanana-2": {
        vertex: "gemini-3.1-flash-image",
        name: "Vertex AI Gemini 3.1 Flash Image",
    },
    "nanobanana-2-lite": {
        vertex: "gemini-3.1-flash-lite-image",
        name: "Vertex AI Gemini 3.1 Flash-Lite Image",
    },
    "nanobanana": {
        vertex: "gemini-2.5-flash-image",
        name: "Vertex AI Gemini 2.5 Flash Image",
    },
} as const;

const PROMPT_MODALITY_TO_USAGE_KEY: Partial<
    Record<VertexAIModality, keyof Usage>
> = {
    TEXT: "promptTextTokens",
    IMAGE: "promptImageTokens",
    AUDIO: "promptAudioTokens",
    VIDEO: "promptVideoTokens",
};

const COMPLETION_MODALITY_TO_USAGE_KEY: Partial<
    Record<VertexAIModality, keyof Usage>
> = {
    TEXT: "completionTextTokens",
    IMAGE: "completionImageTokens",
};

function isTokenCount(value: unknown): value is number {
    return Number.isSafeInteger(value) && (value as number) >= 0;
}

function invalidVertexUsage(usage: VertexAIUsageMetadata | undefined): never {
    errorLog(
        "Vertex AI returned invalid billing usage metadata:",
        JSON.stringify(usage),
    );
    throw new HttpError(
        "Vertex AI returned invalid billing usage metadata",
        502,
    );
}

function addUsage(usage: Usage, key: keyof Usage, amount: number) {
    if (amount === 0) return;
    usage[key] = (usage[key] ?? 0) + amount;
}

function mapModalityDetails(
    usage: Usage,
    details: VertexAIModalityTokenCount[],
    keyMap: Partial<Record<VertexAIModality, keyof Usage>>,
    providerUsage: VertexAIUsageMetadata,
): number {
    let mappedTokens = 0;
    for (const detail of details) {
        const key = detail.modality && keyMap[detail.modality];
        if (!key || !isTokenCount(detail.tokenCount)) {
            invalidVertexUsage(providerUsage);
        }
        addUsage(usage, key, detail.tokenCount);
        mappedTokens += detail.tokenCount;
    }
    return mappedTokens;
}

export function mapVertexGeminiImageUsage({
    usage,
}: {
    usage?: VertexAIUsageMetadata;
}): Usage {
    if (
        !usage ||
        !isTokenCount(usage.promptTokenCount) ||
        !isTokenCount(usage.candidatesTokenCount) ||
        !isTokenCount(usage.totalTokenCount) ||
        (usage.thoughtsTokenCount !== undefined &&
            !isTokenCount(usage.thoughtsTokenCount)) ||
        !usage.promptTokensDetails?.length ||
        !usage.candidatesTokensDetails?.length
    ) {
        invalidVertexUsage(usage);
    }

    const mappedUsage: Usage = {};
    const promptTokens = usage.promptTokenCount;
    const mappedPromptTokens = mapModalityDetails(
        mappedUsage,
        usage.promptTokensDetails,
        PROMPT_MODALITY_TO_USAGE_KEY,
        usage,
    );

    const candidateTokens = usage.candidatesTokenCount;
    const mappedCandidateTokens = mapModalityDetails(
        mappedUsage,
        usage.candidatesTokensDetails,
        COMPLETION_MODALITY_TO_USAGE_KEY,
        usage,
    );
    const thoughtsTokens = usage.thoughtsTokenCount ?? 0;
    addUsage(mappedUsage, "completionReasoningTokens", thoughtsTokens);

    if (
        mappedPromptTokens !== promptTokens ||
        mappedCandidateTokens !== candidateTokens ||
        !mappedUsage.completionImageTokens ||
        promptTokens + candidateTokens + thoughtsTokens !==
            usage.totalTokenCount
    ) {
        invalidVertexUsage(usage);
    }

    return mappedUsage;
}

/**
 * Build an informative HttpError when Vertex AI returns no image data.
 * Checks in order: Gemini text explanation, blocked safety categories,
 * high-probability safety categories, finish reason, then a generic fallback.
 */
function buildNoImageDataError(result: {
    textResponse?: string;
    finishReason?: string;
    safetyRatings?: VertexAISafetyRating[];
}): HttpError {
    if (result.textResponse) {
        return new HttpError(`Gemini: ${result.textResponse}`, 400);
    }

    if (result.safetyRatings && result.safetyRatings.length > 0) {
        const blockedCategories = result.safetyRatings
            .filter((rating) => rating.blocked)
            .map((rating) => rating.category)
            .join(", ");

        if (blockedCategories) {
            return new HttpError(
                `${result.finishReason || "Content blocked"}: ${blockedCategories}`,
                400,
            );
        }

        const highProbCategories = result.safetyRatings
            .filter(
                (rating) =>
                    rating.probability === "HIGH" ||
                    rating.probability === "MEDIUM",
            )
            .map((rating) => `${rating.category} (${rating.probability})`)
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
        const processedImages: VertexAIImageData[] = [];

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
            NANOBANANA_MODELS[
                safeParams.model as keyof typeof NANOBANANA_MODELS
            ];
        if (!modelConfig) {
            throw new HttpError(
                `Unsupported Vertex AI image model: ${safeParams.model}`,
                400,
            );
        }
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
        log("candidatesTokensDetails:", result.usage?.candidatesTokensDetails);
        log("promptTokenCount:", result.usage?.promptTokenCount);
        log("promptTokensDetails:", result.usage?.promptTokensDetails);
        log("totalTokenCount:", result.usage?.totalTokenCount);
        log("================================");

        if (!result.imageData) {
            errorLog(
                "ERROR: No imageData in result from generateImageWithVertexAI - likely content policy violation",
            );
            throw buildNoImageDataError(result);
        }

        const usage = mapVertexGeminiImageUsage({ usage: result.usage });

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
                usage,
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
