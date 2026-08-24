import { HttpError } from "@shared/http-error.ts";
import debug from "debug";
import type {
    AuthResult,
    ImageGenerationResult,
} from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { sanitizeString } from "../util.ts";
import {
    analyzeImageSafety,
    requireSafePrompt,
} from "../utils/azureContentSafety.ts";
import { logGptImageError } from "../utils/gptImageLogger.ts";
import { base64ToBuffer, downloadUserImage } from "../utils/imageDownload.ts";

const logError = debug("pollinations:error");
const logCloudflare = debug("pollinations:cloudflare");
const AZURE_FLUX_KONTEXT_ENDPOINT =
    "https://myceli-prod-eastus.cognitiveservices.azure.com/providers/blackforestlabs/v1/flux-kontext-pro?api-version=preview";

function greatestCommonDivisor(a: number, b: number): number {
    while (b !== 0) {
        [a, b] = [b, a % b];
    }
    return a || 1;
}

function toAspectRatio(width: number, height: number): string {
    const divisor = greatestCommonDivisor(width, height);
    return `${width / divisor}:${height / divisor}`;
}

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
    const apiKey = getImageEnv("AZURE_MYCELI_PROD_API_KEY");

    if (!apiKey) {
        throw new Error(
            "AZURE_MYCELI_PROD_API_KEY not found in environment variables",
        );
    }

    const isEditMode = safeParams.image.length > 0;
    logCloudflare(
        `Using Azure Flux Kontext in ${isEditMode ? "edit" : "generation"} mode`,
    );

    logCloudflare("Checking prompt safety...");
    await requireSafePrompt(prompt, safeParams, userInfo);

    const requestBody: Record<string, unknown> = {
        prompt: sanitizeString(prompt),
        model: "FLUX.1-Kontext-pro",
        output_format: "png",
        num_images: 1,
    };

    if (isEditMode) {
        try {
            const imageUrl = safeParams.image[0];
            logCloudflare(`Fetching image from URL: ${imageUrl}`);

            const { buffer } = await downloadUserImage(imageUrl);

            logCloudflare("Checking safety of input image");
            const imageSafetyResult = await analyzeImageSafety(buffer);

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
            requestBody.input_image = buffer.toString("base64");
        } catch (error) {
            logError("Error processing image for editing:", error);
            if (error instanceof HttpError) throw error;
            throw new Error(`Failed to process image: ${error.message}`);
        }
    } else {
        requestBody.aspect_ratio = toAspectRatio(
            safeParams.width,
            safeParams.height,
        );
    }

    logCloudflare("Calling Azure Flux Kontext API with params:", {
        ...requestBody,
        input_image: requestBody.input_image ? "[base64]" : undefined,
    });

    const response = await fetch(AZURE_FLUX_KONTEXT_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
    });

    logCloudflare(`Kontext request response status: ${response.status}`);

    if (!response.ok) {
        const errorText = await response.text();
        throw new HttpError(
            errorText,
            response.status,
            undefined,
            AZURE_FLUX_KONTEXT_ENDPOINT,
        );
    }

    const data = (await response.json()) as {
        data?: Array<{
            b64_json?: string;
            content_filter_results?: {
                sexual?: { filtered?: boolean };
            };
        }>;
    };

    if (!data.data?.[0]?.b64_json) {
        throw new HttpError(
            "Invalid response from Azure Flux Kontext API",
            500,
            undefined,
            AZURE_FLUX_KONTEXT_ENDPOINT,
        );
    }

    // Convert base64 to buffer
    const imageBuffer = base64ToBuffer(data.data[0].b64_json);

    // Return result with content safety flags from Azure response
    return {
        buffer: imageBuffer,
        isMature:
            data.data[0].content_filter_results?.sexual?.filtered || false,
        isChild: false, // Azure doesn't provide child detection
        trackingData: {
            actualModel: "kontext",
            usage: {
                completionImageTokens: 1,
                totalTokenCount: 1,
            },
        },
    };
}
