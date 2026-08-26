import {
    collectUpstreamHeaders,
    ensureUpstreamOk,
    UpstreamError,
} from "@shared/error.ts";
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
import {
    CONTENT_POLICY_ERROR_CODE,
    CONTENT_POLICY_STATUS,
    contentPolicyMessage,
    firstContentPolicyMessage,
} from "../utils/contentModeration.ts";
import { logGptImageError } from "../utils/gptImageLogger.ts";
import { base64ToBuffer, downloadUserImage } from "../utils/imageDownload.ts";

const logError = debug("pollinations:error");
const logCloudflare = debug("pollinations:cloudflare");
const AZURE_FLUX_KONTEXT_ENDPOINT =
    "https://myceli-prod-eastus.cognitiveservices.azure.com/providers/blackforestlabs/v1/flux-kontext-pro?api-version=preview";

type AzureFluxKontextResponse = {
    data?: Array<{
        b64_json?: string;
        content_filter_results?: unknown;
        error?: unknown;
        finish_reason?: unknown;
        message?: unknown;
    }>;
    error?: unknown;
    message?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function shortString(value: unknown): string | undefined {
    return typeof value === "string" ? value.slice(0, 500) : undefined;
}

function errorSummary(value: unknown): Record<string, string> | undefined {
    if (typeof value === "string") return { message: value.slice(0, 500) };
    const error = asRecord(value);
    if (!error) return undefined;

    const summary = {
        code: shortString(error.code),
        message: shortString(error.message),
        type: shortString(error.type),
    };
    const entries = Object.entries(summary).filter(
        (entry): entry is [string, string] => Boolean(entry[1]),
    );
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function filteredCategories(value: unknown): string[] {
    const filters = asRecord(value);
    if (!filters) return [];
    return Object.entries(filters)
        .filter(([, result]) => asRecord(result)?.filtered === true)
        .map(([category]) => category)
        .sort();
}

function summarizeUnexpectedResponse(data: AzureFluxKontextResponse): string {
    const first = data.data?.[0];
    const root = data as Record<string, unknown>;
    const firstRecord = asRecord(first);
    const summary = {
        responseKeys: Object.keys(root).sort(),
        dataCount: Array.isArray(data.data) ? data.data.length : undefined,
        firstDataKeys: firstRecord
            ? Object.keys(firstRecord).sort()
            : undefined,
        finishReason: shortString(first?.finish_reason),
        message: shortString(data.message) || shortString(first?.message),
        error: errorSummary(data.error) || errorSummary(first?.error),
        filteredCategories: filteredCategories(first?.content_filter_results),
    };
    return JSON.stringify(summary);
}

function contentPolicyReason(
    data: AzureFluxKontextResponse,
): string | undefined {
    const first = data.data?.[0];
    const categories = filteredCategories(first?.content_filter_results);
    if (categories.length > 0) {
        return `Content filter blocked categories: ${categories.join(", ")}`;
    }

    const rootError = errorSummary(data.error);
    const itemError = errorSummary(first?.error);
    return firstContentPolicyMessage([
        shortString(first?.finish_reason)?.replaceAll("_", " "),
        shortString(data.message),
        shortString(first?.message),
        rootError?.message,
        rootError?.code?.replaceAll("_", " "),
        itemError?.message,
        itemError?.code?.replaceAll("_", " "),
    ]);
}

async function ensureAzureFluxKontextOk(response: Response): Promise<void> {
    try {
        await ensureUpstreamOk(response, AZURE_FLUX_KONTEXT_ENDPOINT);
    } catch (error) {
        if (!(error instanceof UpstreamError)) throw error;

        const rejectionReason = firstContentPolicyMessage([
            error.message,
            error.responseBody,
        ]);
        if (!rejectionReason) throw error;

        throw new UpstreamError(CONTENT_POLICY_STATUS, {
            message: contentPolicyMessage(rejectionReason),
            errorCode: CONTENT_POLICY_ERROR_CODE,
            requestUrl: error.requestUrl,
            upstreamStatus: error.upstreamStatus,
            responseBody: error.responseBody,
            upstreamHeaders: error.upstreamHeaders,
            cause: error,
        });
    }
}

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

    await ensureAzureFluxKontextOk(response);

    const data = (await response.json()) as AzureFluxKontextResponse;

    if (!data.data?.[0]?.b64_json) {
        const requestUrl = new URL(AZURE_FLUX_KONTEXT_ENDPOINT);
        const responseBody = summarizeUnexpectedResponse(data);
        const upstreamHeaders = collectUpstreamHeaders(response.headers);
        const rejectionReason = contentPolicyReason(data);

        if (rejectionReason) {
            throw new UpstreamError(CONTENT_POLICY_STATUS, {
                message: contentPolicyMessage(rejectionReason),
                errorCode: CONTENT_POLICY_ERROR_CODE,
                requestUrl,
                upstreamStatus: response.status,
                responseBody,
                upstreamHeaders,
            });
        }

        throw new UpstreamError(502, {
            message: "Azure Flux Kontext returned no image",
            requestUrl,
            upstreamStatus: response.status,
            responseBody,
            upstreamHeaders,
        });
    }

    // Convert base64 to buffer
    const imageBuffer = base64ToBuffer(data.data[0].b64_json);

    // Return result with content safety flags from Azure response
    return {
        buffer: imageBuffer,
        isMature:
            asRecord(asRecord(data.data[0].content_filter_results)?.sexual)
                ?.filtered === true,
        isChild: false, // Azure doesn't provide child detection
        trackingData: {
            actualModel: "black-forest-labs/flux.1-kontext-pro",
            usage: {
                completionImageTokens: 1,
                totalTokenCount: 1,
            },
        },
    };
}
