import {
    collectUpstreamHeaders,
    ensureUpstreamOk,
    UpstreamError,
} from "@shared/error.ts";
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

const AZURE_FLUX_2_CONFIG = {
    "flux-2-pro": {
        upstreamModel: "FLUX.2-pro",
        modelPath: "flux-2-pro",
        title: "FLUX.2 Pro",
        maxReferenceImages: 8,
    },
    "flux-2-flex": {
        upstreamModel: "FLUX.2-flex",
        modelPath: "flux-2-flex",
        title: "FLUX.2 Flex",
        maxReferenceImages: 10,
    },
} as const;

type AzureFlux2Model = keyof typeof AZURE_FLUX_2_CONFIG;

const AZURE_FLUX_2_MAX_PIXELS = 2048 * 2048;
const AZURE_FLUX_2_MIN_SIDE = 256;
const AZURE_FLUX_2_DIMENSION_STEP = 16;

function flux2Endpoint(modelPath: string): string {
    return `https://myceli-prod-eastus.cognitiveservices.azure.com/providers/blackforestlabs/v1/${modelPath}?api-version=preview`;
}

type AzureFluxResponse = {
    data?: Array<{
        b64_json?: string;
        content_filter_results?: unknown;
        error?: unknown;
        finish_reason?: unknown;
        message?: unknown;
    }>;
    request_meta?: {
        cost?: number;
        input_mp?: number;
        output_mp?: number;
        total_pixels?: number;
    };
    error?: unknown;
    message?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function stringValue(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

function errorSummary(value: unknown): Record<string, string> | undefined {
    if (typeof value === "string") return { message: value };
    const error = asRecord(value);
    if (!error) return undefined;

    const summary = {
        code: stringValue(error.code),
        message: stringValue(error.message),
        type: stringValue(error.type),
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

function contentPolicyReason(data: AzureFluxResponse): string | undefined {
    const first = data.data?.[0];
    const categories = filteredCategories(first?.content_filter_results);
    if (categories.length > 0) {
        return `Content filter blocked categories: ${categories.join(", ")}`;
    }

    const rootError = errorSummary(data.error);
    const itemError = errorSummary(first?.error);
    return firstContentPolicyMessage([
        stringValue(first?.finish_reason)?.replaceAll("_", " "),
        stringValue(data.message),
        stringValue(first?.message),
        rootError?.message,
        rootError?.code?.replaceAll("_", " "),
        itemError?.message,
        itemError?.code?.replaceAll("_", " "),
    ]);
}

export async function ensureAzureImageOk(
    response: Response,
    endpoint: string,
): Promise<void> {
    try {
        await ensureUpstreamOk(response, endpoint);
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

async function ensureAzureFluxKontextOk(response: Response): Promise<void> {
    await ensureAzureImageOk(response, AZURE_FLUX_KONTEXT_ENDPOINT);
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
            if (error instanceof UpstreamError) throw error;
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

    const data = (await response.json()) as AzureFluxResponse;

    if (!data.data?.[0]?.b64_json) {
        const requestUrl = new URL(AZURE_FLUX_KONTEXT_ENDPOINT);
        const responseBody = JSON.stringify(data);
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
            actualModel: "kontext",
            usage: {
                completionImageTokens: 1,
                totalTokenCount: 1,
            },
        },
    };
}

function validateFlux2Dimensions(
    modelTitle: string,
    width: number,
    height: number,
): void {
    if (width < AZURE_FLUX_2_MIN_SIDE || height < AZURE_FLUX_2_MIN_SIDE) {
        throw UpstreamError.fromProvider(400, {
            message: `${modelTitle} requires width and height of at least ${AZURE_FLUX_2_MIN_SIDE}px`,
        });
    }
    if (
        width % AZURE_FLUX_2_DIMENSION_STEP !== 0 ||
        height % AZURE_FLUX_2_DIMENSION_STEP !== 0
    ) {
        throw UpstreamError.fromProvider(400, {
            message: `${modelTitle} requires width and height to be multiples of ${AZURE_FLUX_2_DIMENSION_STEP}px`,
        });
    }
    if (width * height > AZURE_FLUX_2_MAX_PIXELS) {
        throw UpstreamError.fromProvider(400, {
            message: `${modelTitle} supports at most 4,194,304 pixels`,
        });
    }
}

function billableMegapixels(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) && value >= 0
        ? Math.ceil(value)
        : undefined;
}

export async function callAzureFlux2(
    prompt: string,
    safeParams: ImageParams,
    userInfo: AuthResult,
): Promise<ImageGenerationResult> {
    const model = safeParams.model as AzureFlux2Model;
    const config = AZURE_FLUX_2_CONFIG[model];
    if (!config) {
        throw UpstreamError.fromProvider(400, {
            message: `Unsupported Azure FLUX.2 model: ${model}`,
        });
    }

    validateFlux2Dimensions(config.title, safeParams.width, safeParams.height);
    if (safeParams.image.length > config.maxReferenceImages) {
        throw UpstreamError.fromProvider(400, {
            message: `${config.title} supports at most ${config.maxReferenceImages} reference images`,
        });
    }

    const apiKey = getImageEnv("AZURE_MYCELI_PROD_API_KEY");
    if (!apiKey) {
        throw new Error(
            "AZURE_MYCELI_PROD_API_KEY not found in environment variables",
        );
    }

    await requireSafePrompt(prompt, safeParams, userInfo);

    const requestBody: Record<string, unknown> = {
        prompt: sanitizeString(prompt),
        model: config.upstreamModel,
        width: safeParams.width,
        height: safeParams.height,
        seed: safeParams.seed,
        output_format: "png",
        num_images: 1,
    };
    if (safeParams.guidance_scale !== undefined) {
        requestBody.guidance = safeParams.guidance_scale;
    }

    const inputImages = await Promise.all(
        safeParams.image.map(async (imageUrl) => {
            const { buffer } = await downloadUserImage(imageUrl);
            const imageSafetyResult = await analyzeImageSafety(buffer);
            if (!imageSafetyResult.safe) {
                const error = UpstreamError.fromProvider(400, {
                    message: `Input image contains unsafe content: ${imageSafetyResult.formattedViolations}`,
                });
                await logGptImageError(
                    prompt,
                    safeParams,
                    userInfo,
                    error,
                    imageSafetyResult,
                );
                throw error;
            }
            return buffer;
        }),
    );

    for (const [index, buffer] of inputImages.entries()) {
        const field = index === 0 ? "input_image" : `input_image_${index + 1}`;
        requestBody[field] = buffer.toString("base64");
    }

    const endpoint = flux2Endpoint(config.modelPath);
    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
    });
    await ensureAzureImageOk(response, endpoint);

    const data = (await response.json()) as AzureFluxResponse;
    const encodedImage = data.data?.[0]?.b64_json;
    if (!encodedImage) {
        const requestUrl = new URL(endpoint);
        const responseBody = JSON.stringify(data);
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
            message: `Azure ${config.title} returned no image`,
            requestUrl,
            upstreamStatus: response.status,
            responseBody,
            upstreamHeaders,
        });
    }

    const promptImageTokens = billableMegapixels(data.request_meta?.input_mp);
    const completionImageTokens = billableMegapixels(
        data.request_meta?.output_mp,
    );
    if (
        promptImageTokens === undefined ||
        completionImageTokens === undefined
    ) {
        throw new UpstreamError(502, {
            message: `Azure ${config.title} returned no billing metadata`,
            requestUrl: new URL(endpoint),
            upstreamStatus: response.status,
            responseBody: JSON.stringify(data),
            upstreamHeaders: collectUpstreamHeaders(response.headers),
        });
    }

    return {
        buffer: base64ToBuffer(encodedImage),
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel: model,
            usage: {
                ...(promptImageTokens > 0 ? { promptImageTokens } : {}),
                completionImageTokens: Math.max(1, completionImageTokens),
            },
        },
    };
}
