import debug from "debug";
import dotenv from "dotenv";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import {
    fetchFromLeastBusyFluxServer,
    fetchFromLeastBusyServer,
} from "./availableServers.ts";
import { HttpError } from "./httpError.ts";
import { callAzureFluxKontext } from "./models/azureFluxKontextModel.js";
import { callFluxKleinAPI } from "./models/fluxKleinModel.ts";
import { callNovaCanvasAPI } from "./models/novaCanvasModel.ts";
import {
    callPrunaImageAPI,
    callPrunaImageEditAPI,
} from "./models/prunaModel.ts";
import { callQwenImageAPI } from "./models/qwenImageModel.ts";
import {
    callSeedream5API,
    callSeedreamAPI,
    callSeedreamProAPI,
} from "./models/seedreamModel.ts";
import { callWanImageAPI } from "./models/wanImageModel.ts";
import { callXaiImageAPI } from "./models/xaiModel.ts";
import type { ImageParams } from "./params.ts";
import type { ProgressManager } from "./progressBar.ts";
import { sanitizeString } from "./translateIfNecessary.ts";
import {
    analyzeImageSafety,
    analyzeTextSafety,
    type ContentSafetyFlags,
} from "./utils/azureContentSafety.ts";
import { logGptImageError, logGptImagePrompt } from "./utils/gptImageLogger.ts";
import type { TrackingData } from "./utils/trackingHeaders.ts";
import { callVertexAIGemini } from "./vertexAIImageGenerator.js";
import { writeExifMetadata } from "./writeExifMetadata.ts";

dotenv.config();

// Loggers
const logError = debug("pollinations:error");
const logPerf = debug("pollinations:perf");
const logOps = debug("pollinations:ops");
const logCloudflare = debug("pollinations:cloudflare");

// Constants
const TARGET_PIXEL_COUNT = 1024 * 1024; // 1 megapixel
// Max pixels for GPT Image input to control token costs
// GPT Image 1.5 calculates input tokens as: (width × height) / 750
// At 1536x1536 = 2.36M pixels = ~3,145 input tokens (reasonable cost)
// At 4K (3840x2160) = 8.3M pixels = ~11,000 input tokens (expensive!)
const GPT_IMAGE_MAX_INPUT_PIXELS = 1536 * 1536; // ~2.36 megapixels

// Performance tracking variables
const totalStartTime = Date.now();
let accumulatedFetchDurations = 0;

type ScaledDimensions = {
    scaledWidth: number;
    scaledHeight: number;
    scalingFactor: number;
};

type AzureGPTImageTokenDetails = {
    cached_tokens?: number;
    image_tokens?: number;
    text_tokens?: number;
};

type AzureGPTImageUsage = {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: AzureGPTImageTokenDetails;
    completion_tokens_details?: AzureGPTImageTokenDetails;
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: AzureGPTImageTokenDetails;
    output_tokens_details?: AzureGPTImageTokenDetails;
};

export type ImageGenerationResult = {
    buffer: Buffer;
    isMature: boolean;
    isChild: boolean;
    // Tracking data for enter service headers
    trackingData?: TrackingData;
};

export type AuthResult = {
    authenticated: boolean;
    tokenAuth: boolean;
    referrerAuth: boolean;
    bypass: boolean;
    reason: string;
    userId: string | null;
    username: string | null;
    debugInfo: object;
};

function safeTokenCount(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function mapAzureGPTImageUsage(
    usage: AzureGPTImageUsage | undefined,
    separateCompletionTextTokens: boolean,
) {
    const promptTokens =
        safeTokenCount(usage?.prompt_tokens) ||
        safeTokenCount(usage?.input_tokens);
    const completionTokens =
        safeTokenCount(usage?.completion_tokens) ||
        safeTokenCount(usage?.output_tokens) ||
        safeTokenCount(usage?.total_tokens);

    const promptDetails =
        usage?.prompt_tokens_details || usage?.input_tokens_details;
    const completionDetails =
        usage?.completion_tokens_details || usage?.output_tokens_details;

    const promptCachedTokens = safeTokenCount(promptDetails?.cached_tokens);
    const promptImageTokens = safeTokenCount(promptDetails?.image_tokens);
    const promptTextTokens =
        safeTokenCount(promptDetails?.text_tokens) ||
        Math.max(promptTokens - promptCachedTokens - promptImageTokens, 0);

    const completionTextTokens = separateCompletionTextTokens
        ? safeTokenCount(completionDetails?.text_tokens)
        : 0;
    const completionImageTokens =
        safeTokenCount(completionDetails?.image_tokens) ||
        Math.max(completionTokens - completionTextTokens, 0) ||
        1;

    const totalTokenCount =
        safeTokenCount(usage?.total_tokens) ||
        promptTextTokens +
            promptCachedTokens +
            promptImageTokens +
            completionTextTokens +
            completionImageTokens;

    return {
        promptTextTokens,
        promptCachedTokens,
        promptImageTokens,
        completionTextTokens,
        completionImageTokens,
        totalTokenCount,
    };
}

/**
 * Calculates scaled dimensions while maintaining aspect ratio
 * @param {number} width - Original width
 * @param {number} height - Original height
 * @returns {ScaledDimensions}
 */
export function calculateScaledDimensions(
    width: number,
    height: number,
): ScaledDimensions {
    const currentPixels = width * height;
    if (currentPixels >= TARGET_PIXEL_COUNT) {
        return { scaledWidth: width, scaledHeight: height, scalingFactor: 1 };
    }

    const scalingFactor = Math.sqrt(TARGET_PIXEL_COUNT / currentPixels);
    const scaledWidth = Math.round(width * scalingFactor);
    const scaledHeight = Math.round(height * scalingFactor);

    return { scaledWidth, scaledHeight, scalingFactor };
}

/**
 * Resizes an input image buffer for GPT Image editing to reduce token costs.
 * GPT Image 1.5 calculates input tokens as: (width × height) / 750
 * Large images can result in very high token costs (e.g., 4K = ~11,000 tokens)
 *
 * @param buffer - The input image buffer
 * @returns Resized buffer (PNG format) if image exceeds max pixels, otherwise original
 */
async function resizeInputImageForGptImage(buffer: Buffer): Promise<Buffer> {
    try {
        const metadata = await sharp(buffer).metadata();
        const width = metadata.width || 0;
        const height = metadata.height || 0;
        const currentPixels = width * height;

        if (currentPixels <= GPT_IMAGE_MAX_INPUT_PIXELS) {
            logCloudflare(
                `Input image ${width}x${height} (${currentPixels} pixels) within limit, no resize needed`,
            );
            return buffer;
        }

        // Calculate new dimensions maintaining aspect ratio
        const scalingFactor = Math.sqrt(
            GPT_IMAGE_MAX_INPUT_PIXELS / currentPixels,
        );
        const newWidth = Math.round(width * scalingFactor);
        const newHeight = Math.round(height * scalingFactor);

        logCloudflare(
            `Resizing input image from ${width}x${height} to ${newWidth}x${newHeight} to reduce token costs`,
        );
        logCloudflare(
            `Token reduction: ~${Math.round(currentPixels / 750)} → ~${Math.round((newWidth * newHeight) / 750)} tokens`,
        );

        const resizedBuffer = await sharp(buffer)
            .resize(newWidth, newHeight, { fit: "inside" })
            .png() // Use PNG for lossless quality
            .toBuffer();

        return resizedBuffer;
    } catch (error) {
        logError("Failed to resize input image, using original:", error);
        return buffer;
    }
}

/**
 * Calls self-hosted image generation servers (flux, zimage pools).
 * @param {string} prompt - The prompt for image generation.
 * @param {Object} safeParams - The parameters for image generation.
 * @param {number} concurrentRequests - The number of concurrent requests.
 * @returns {Promise<Array>} - The generated images.
 */
export const callSelfHostedServer = async (
    prompt: string,
    safeParams: ImageParams,
    concurrentRequests: number,
): Promise<ImageGenerationResult> => {
    try {
        logOps(
            "concurrent requests",
            concurrentRequests,
            "safeParams",
            safeParams,
        );

        // Always use max steps (4) - all requests go through enter.pollinations.ai
        const steps = 4;
        logOps("calculated_steps", steps);

        prompt = sanitizeString(prompt);

        // Calculate scaled dimensions
        const { scaledWidth, scaledHeight, scalingFactor } =
            calculateScaledDimensions(safeParams.width, safeParams.height);

        const body = {
            prompts: [prompt],
            width: scaledWidth,
            height: scaledHeight,
            seed: safeParams.seed,
            negative_prompt: safeParams.negative_prompt,
            steps: steps,
        };

        logOps(
            "calling prompt",
            body.prompts,
            "width",
            body.width,
            "height",
            body.height,
        );

        // Start timing for fetch
        const fetchStartTime = Date.now();

        let response = null;

        // Single attempt - no retry logic
        try {
            // Route to appropriate server pool based on model
            const fetchFunction =
                safeParams.model === "zimage"
                    ? (opts: RequestInit) =>
                          fetchFromLeastBusyServer("zimage", opts)
                    : fetchFromLeastBusyFluxServer;
            response = await fetchFunction({
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(process.env.PLN_GPU_TOKEN && {
                        "x-backend-token": process.env.PLN_GPU_TOKEN,
                    }),
                },
                body: JSON.stringify(body),
            });
        } catch (error) {
            logError(`Fetch failed for ${safeParams.model}:`, error.message);
            logError("Request body:", JSON.stringify(body, null, 2));
            throw error;
        }

        const fetchEndTime = Date.now();

        // Calculate the time spent in fetch
        const fetchDuration = fetchEndTime - fetchStartTime;
        logPerf(`Fetch duration: ${fetchDuration}ms`);
        accumulatedFetchDurations += fetchDuration;

        // Calculate the total time the app has been running
        const totalTime = Date.now() - totalStartTime;

        // Calculate and print the percentage of time spent in fetch
        const fetchPercentage = (accumulatedFetchDurations / totalTime) * 100;
        logPerf(`Fetch time percentage: ${fetchPercentage}%`);

        if (!response.ok) {
            logError("Error from server. input was", body);
            throw new Error(`Server responded with ${response.status}`);
        }

        const jsonResponse = await response.json();

        const { image, ...rest } = Array.isArray(jsonResponse)
            ? jsonResponse[0]
            : jsonResponse;

        if (!image) {
            logError("image is null");
            throw new Error("image is null");
        }

        logOps("decoding base64 image");

        const buffer = Buffer.from(image, "base64");

        // Resize back to original dimensions if scaling was applied
        if (scalingFactor > 1) {
            const resizedBuffer = await sharp(buffer)
                .resize(safeParams.width, safeParams.height, {
                    fit: "fill",
                    withoutEnlargement: false,
                })
                .jpeg()
                .toBuffer();
            return {
                buffer: resizedBuffer,
                ...rest,
                trackingData: {
                    actualModel: safeParams.model,
                    usage: {
                        completionImageTokens: 1,
                        totalTokenCount: 1,
                    },
                },
            };
        }

        // Convert to JPEG even if no resize was needed
        const jpegBuffer = await sharp(buffer)
            .jpeg({
                quality: 90,
                mozjpeg: true,
            })
            .toBuffer();

        return {
            buffer: jpegBuffer,
            ...rest,
            trackingData: {
                actualModel: safeParams.model,
                usage: {
                    completionImageTokens: 1,
                    totalTokenCount: 1,
                },
            },
        };
    } catch (e) {
        logError("Error in callSelfHostedServer:", e);
        throw e;
    }
};

/**
 * Converts an image buffer to JPEG format if it's not already a JPEG.
 * @param {Buffer} buffer - The image buffer to convert.
 * @returns {Promise<Buffer>} - The converted image buffer.
 */
export async function convertToJpeg(buffer: Buffer): Promise<Buffer> {
    const fileType = await fileTypeFromBuffer(buffer);
    // no need to check for jpeg here, according to type information
    if (!fileType || fileType.ext !== "jpg") {
        const result = await sharp(buffer).jpeg().toBuffer();
        return result;
    }
    return buffer;
}

interface AzureGPTImageConfig {
    baseUrl: string;
    modelName: string;
    apiKeyEnv: string;
}

const AZURE_GPTIMAGE_API_VERSION = "2025-04-01-preview";

// gpt-image-2 has a 12 RPM per-region subscription quota, so it's deployed across
// 4 regions and selected at random per call to spread load (~48 RPM combined).
const AZURE_GPTIMAGE_CONFIGS: Record<string, AzureGPTImageConfig[]> = {
    gptimage: [
        {
            baseUrl:
                "https://myceli-prod-eastus2.cognitiveservices.azure.com/openai/deployments/gpt-image-1-mini",
            modelName: "gpt-image-1-mini",
            apiKeyEnv: "AZURE_MYCELI_PROD_EASTUS2_API_KEY",
        },
    ],
    "gptimage-large": [
        {
            baseUrl:
                "https://myceli-prod-eastus2.cognitiveservices.azure.com/openai/deployments/gpt-image-1.5",
            modelName: "gpt-image-1.5",
            apiKeyEnv: "AZURE_MYCELI_PROD_EASTUS2_API_KEY",
        },
    ],
    "gpt-image-2": [
        {
            baseUrl:
                "https://myceli-prod-eastus2.cognitiveservices.azure.com/openai/deployments/gpt-image-2",
            modelName: "gpt-image-2",
            apiKeyEnv: "AZURE_MYCELI_PROD_EASTUS2_API_KEY",
        },
        {
            baseUrl:
                "https://swedencentral.api.cognitive.microsoft.com/openai/deployments/gpt-image-2",
            modelName: "gpt-image-2",
            apiKeyEnv: "AZURE_MYCELI_PROD_SWEDEN_API_KEY",
        },
        {
            baseUrl:
                "https://westus3.api.cognitive.microsoft.com/openai/deployments/gpt-image-2",
            modelName: "gpt-image-2",
            apiKeyEnv: "AZURE_MYCELI_PROD_WESTUS3_API_KEY",
        },
        {
            baseUrl:
                "https://polandcentral.api.cognitive.microsoft.com/openai/deployments/gpt-image-2",
            modelName: "gpt-image-2",
            apiKeyEnv: "AZURE_MYCELI_PROD_POLANDCENTRAL_API_KEY",
        },
        {
            baseUrl:
                "https://uaenorth.api.cognitive.microsoft.com/openai/deployments/gpt-image-2",
            modelName: "gpt-image-2",
            apiKeyEnv: "AZURE_MYCELI_PROD_UAENORTH_API_KEY",
        },
    ],
};

function pickGPTImageEndpoint(model: string): AzureGPTImageConfig {
    const endpoints =
        AZURE_GPTIMAGE_CONFIGS[model] || AZURE_GPTIMAGE_CONFIGS.gptimage;
    return endpoints[Math.floor(Math.random() * endpoints.length)];
}

/**
 * Helper function to call Azure GPT Image with specific endpoint
 * @param {string} prompt - The prompt for image generation or editing
 * @param {Object} safeParams - The parameters for image generation or editing
 * @param {Object} userInfo - User authentication info object
 * @param {AzureGPTImageConfig} config - Configuration for the specific GPT Image model
 * @returns {Promise<{buffer: Buffer, isMature: boolean, isChild: boolean}>}
 */
const callAzureGPTImageWithEndpoint = async (
    prompt: string,
    safeParams: ImageParams,
    userInfo: AuthResult,
    config: AzureGPTImageConfig = AZURE_GPTIMAGE_CONFIGS.gptimage[0],
): Promise<ImageGenerationResult> => {
    const apiKey = process.env[config.apiKeyEnv];

    if (!apiKey) {
        throw new Error(
            `${config.apiKeyEnv} not found in environment variables`,
        );
    }

    // Check if we have input images for edit mode
    const isEditMode = safeParams.image && safeParams.image.length > 0;

    // Construct the full endpoint URL based on mode
    const path = isEditMode ? "images/edits" : "images/generations";
    const endpoint = `${config.baseUrl}/${path}?api-version=${AZURE_GPTIMAGE_API_VERSION}`;
    logCloudflare(
        `Using Azure ${config.modelName} in ${isEditMode ? "edit" : "generation"} mode`,
    );

    // Map safeParams to Azure API parameters
    // GPT Image 1.5 only supports: 1024x1024 (1:1), 1024x1536 (2:3), 1536x1024 (3:2)
    // Select the size with the closest aspect ratio to the input
    const inputRatio = safeParams.width / safeParams.height;
    const sizes = [
        { size: "1024x1024", ratio: 1 },
        { size: "1536x1024", ratio: 1.5 },
        { size: "1024x1536", ratio: 1 / 1.5 },
    ];
    const size = sizes.reduce((a, b) =>
        Math.abs(a.ratio - inputRatio) < Math.abs(b.ratio - inputRatio) ? a : b,
    ).size;

    // Use requested quality - enter.pollinations.ai handles tier-based access control
    const quality = safeParams.quality === "high" ? "high" : "medium";

    // Set output format to png if model is gptimage, otherwise jpeg
    const outputFormat = "png";
    // Build request body
    const requestBody = {
        prompt: sanitizeString(prompt),
        size: size, // "auto" for default size, otherwise width×height
        quality,
        output_format: outputFormat,
        // output_compression: outputCompression,
        // moderation: "low",
        n: 1,
        background: safeParams.transparent ? "transparent" : undefined,
    };

    // Add background parameter for transparent images when using gptimage model
    if (safeParams.transparent) {
        logCloudflare(
            "Adding background=transparent parameter for gptimage model",
        );
    }

    // We'll only use the requestBody for generation mode
    // For edit mode, we'll use FormData instead

    // Note: Azure GPT Image API doesn't support the 'seed' parameter
    // We'll log the seed for reference but not include it in the request
    if (safeParams.seed) {
        logCloudflare(
            `Seed value ${safeParams.seed} not supported by Azure GPT Image API, ignoring`,
        );
    }

    logCloudflare("Calling Azure GPT Image API with params:", requestBody);

    let response = null;

    if (isEditMode) {
        // For edit mode, always use FormData (multipart/form-data)
        const formData = new FormData();

        // Add the prompt
        formData.append("prompt", sanitizeString(prompt));

        // Handle images based on their type
        try {
            // Convert to array if it's a string (backward compatible)
            const imageUrls = Array.isArray(safeParams.image)
                ? safeParams.image
                : [safeParams.image];

            if (imageUrls.length === 0) {
                // Handle errors for missing image
                throw new HttpError(
                    "Image URL is required for GPT Image edit mode but was not provided",
                    400,
                );
            }

            // Process each image in the array
            for (let i = 0; i < imageUrls.length; i++) {
                const imageUrl = imageUrls[i];
                try {
                    logCloudflare(
                        `Fetching image ${i + 1}/${imageUrls.length} from URL: ${imageUrl}`,
                    );

                    const imageResponse = await fetch(imageUrl);
                    if (!imageResponse.ok) {
                        throw new Error(
                            `Failed to fetch image from URL: ${imageUrl}`,
                        );
                    }

                    const imageArrayBuffer = await imageResponse.arrayBuffer();
                    const originalBuffer = Buffer.from(imageArrayBuffer);

                    // Resize large input images to reduce token costs
                    // GPT Image 1.5 calculates input tokens as: (width × height) / 750
                    const buffer =
                        await resizeInputImageForGptImage(originalBuffer);

                    // Only check safety after we've successfully fetched the image
                    logCloudflare(
                        `Checking safety of input image ${i + 1}/${imageUrls.length}`,
                    );
                    const imageSafetyResult = await analyzeImageSafety(buffer);

                    if (!imageSafetyResult.safe) {
                        const errorMessage = `Input image ${i + 1} contains unsafe content: ${imageSafetyResult.formattedViolations}`;
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

                    // Determine file extension and MIME type from Content-Type header
                    const contentType =
                        imageResponse.headers.get("content-type") || "";
                    let extension = ".png"; // Default extension
                    let mimeType = "image/png"; // Default MIME type

                    // Extract extension from content type (e.g., "image/jpeg" -> "jpeg")
                    if (contentType.startsWith("image/")) {
                        const mimeExtension = contentType
                            .split("/")[1]
                            .split(";")[0]; // Handle cases like "image/jpeg; charset=utf-8"
                        extension = `.${mimeExtension}`;
                        mimeType = `image/${mimeExtension}`;
                    } else {
                        // If content-type is not image/*, try to detect from URL or default to PNG
                        logCloudflare(
                            `Content-Type not detected as image (${contentType}), defaulting to image/png`,
                        );
                    }

                    // Use the image[] array notation as required by Azure OpenAI API
                    // Create a Blob with explicit MIME type to avoid application/octet-stream
                    const imageBlob = new Blob([imageArrayBuffer], {
                        type: mimeType,
                    });
                    formData.append("image[]", imageBlob, `image${extension}`);
                } catch (error) {
                    // More specific error handling for image processing
                    logError(`Error processing image ${i + 1}:`, error.message);
                    throw new Error(
                        `Failed to process image: ${error.message}`,
                    );
                }
            }
        } catch (error) {
            logError("Error processing image for editing:", error);
            throw new Error(`Failed to process image: ${error.message}`);
        }

        // Add other parameters
        formData.append("quality", quality);
        formData.append("n", "1");

        // Add background parameter for transparent images when using gptimage model
        if (safeParams.transparent) {
            formData.append("background", "transparent");
            logCloudflare(
                "Adding background=transparent parameter for gptimage edit mode",
            );
        }

        // Log the endpoint and headers for debugging
        logCloudflare(`Sending edit request to endpoint: ${endpoint}`);

        // Single attempt - no retry logic
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
        // Standard JSON request for generation - single attempt, no retry logic
        response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(requestBody),
        });
    }

    if (!response.ok) {
        const errorText = await response.text();
        // Azure 403 = provider blocked us (content policy, key disabled,
        // deployment quota) — not a client auth problem. Remap to 502 so the
        // caller sees an upstream failure instead of being told they're
        // forbidden.
        const status = response.status === 403 ? 502 : response.status;
        throw new HttpError(errorText, status);
    }

    const data = await response.json();

    if (!data.data || !data.data[0] || !data.data[0].b64_json) {
        throw new Error("Invalid response from Azure GPT Image API");
    }

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(data.data[0].b64_json, "base64");

    const usage = mapAzureGPTImageUsage(
        data.usage,
        config.modelName === "gpt-image-1.5",
    );

    logCloudflare("GPT Image full usage:", data.usage);
    logCloudflare(
        `GPT Image billable usage: promptText=${usage.promptTextTokens}, promptCached=${usage.promptCachedTokens}, promptImage=${usage.promptImageTokens}, completionText=${usage.completionTextTokens}, completionImage=${usage.completionImageTokens}`,
    );

    // Azure doesn't provide content safety information directly, so we'll set defaults
    // In a production environment, you might want to use a separate content moderation service
    return {
        buffer: imageBuffer,
        isMature: false, // Default assumption
        isChild: false, // Default assumption
        trackingData: {
            actualModel: safeParams.model,
            usage,
        },
    };
};

/**
 * Calls the Azure GPT Image API to generate or edit images
 * @param {string} prompt - The prompt for image generation or editing
 * @param {Object} safeParams - The parameters for image generation or editing
 * @param {Object} userInfo - Complete user authentication info object with authenticated, userId, tier, etc.
 * @param {string} model - Model name (gptimage or gptimage-large)
 * @returns {Promise<{buffer: Buffer, isMature: boolean, isChild: boolean}>}
 */
export const callAzureGPTImage = async (
    prompt: string,
    safeParams: ImageParams,
    userInfo: AuthResult,
    model: string = "gptimage",
): Promise<ImageGenerationResult> => {
    const endpoint = pickGPTImageEndpoint(model);
    try {
        return await callAzureGPTImageWithEndpoint(
            prompt,
            safeParams,
            userInfo,
            endpoint,
        );
    } catch (error) {
        logError(
            `Error calling Azure GPT Image API (${endpoint.modelName} via ${endpoint.apiKeyEnv}):`,
            error,
        );
        throw error;
    }
};

/**
 * Checks prompt safety with Azure Content Safety, logs the result, and throws
 * an HttpError(400) if the prompt is unsafe.
 */
async function requireSafePrompt(
    prompt: string,
    safeParams: ImageParams,
    userInfo: AuthResult,
    progress: ProgressManager,
    requestId: string,
): Promise<void> {
    const promptSafetyResult = await analyzeTextSafety(prompt);

    await logGptImagePrompt(prompt, safeParams, userInfo, promptSafetyResult);

    if (!promptSafetyResult.safe) {
        const errorMessage = `Prompt contains unsafe content: ${promptSafetyResult.formattedViolations}`;
        logError("Azure Content Safety rejected prompt:", errorMessage);
        progress.updateBar(
            requestId,
            100,
            "Error",
            "Prompt contains unsafe content",
        );

        const error = new HttpError(errorMessage, 400);
        await logGptImageError(
            prompt,
            safeParams,
            userInfo,
            error,
            promptSafetyResult,
        );
        throw error;
    }
}

/**
 * Formats user auth info for logging.
 */
function formatAuthInfo(userInfo: AuthResult): string {
    return userInfo
        ? `authenticated=${userInfo.authenticated}, tokenAuth=${userInfo.tokenAuth}, referrerAuth=${userInfo.referrerAuth}, reason=${userInfo.reason}, userId=${userInfo.userId || "none"}`
        : "No userInfo provided";
}

const generateImage = async (
    prompt: string,
    safeParams: ImageParams,
    concurrentRequests: number,
    progress: ProgressManager,
    requestId: string,
    userInfo: AuthResult,
): Promise<ImageGenerationResult> => {
    switch (safeParams.model) {
        case "gptimage":
        case "gptimage-large":
        case "gpt-image-2": {
            const gptModelName =
                AZURE_GPTIMAGE_CONFIGS[safeParams.model][0].modelName;
            logError(
                `GPT Image (${gptModelName}) authentication check:`,
                formatAuthInfo(userInfo),
            );
            progress.updateBar(
                requestId,
                30,
                "Processing",
                "Checking prompt safety...",
            );

            try {
                await requireSafePrompt(
                    prompt,
                    safeParams,
                    userInfo,
                    progress,
                    requestId,
                );

                progress.updateBar(
                    requestId,
                    35,
                    "Processing",
                    `Trying Azure GPT Image (${gptModelName})...`,
                );
                return await callAzureGPTImage(
                    prompt,
                    safeParams,
                    userInfo,
                    safeParams.model,
                );
            } catch (error) {
                logError(
                    "Azure GPT Image generation or safety check failed:",
                    error.message,
                );
                await logGptImageError(prompt, safeParams, userInfo, error);
                progress.updateBar(requestId, 100, "Error", error.message);
                throw error;
            }
        }

        case "nanobanana":
        case "nanobanana-2":
        case "nanobanana-pro": {
            logError(
                "Nano Banana authentication check:",
                formatAuthInfo(userInfo),
            );
            progress.updateBar(
                requestId,
                30,
                "Processing",
                "Checking prompt safety...",
            );

            try {
                if (safeParams.safe) {
                    await requireSafePrompt(
                        prompt,
                        safeParams,
                        userInfo,
                        progress,
                        requestId,
                    );
                }

                const modelDisplayName =
                    safeParams.model === "nanobanana-pro"
                        ? "Nano Banana Pro"
                        : safeParams.model === "nanobanana-2"
                          ? "Nano Banana 2"
                          : "Nano Banana";
                progress.updateBar(
                    requestId,
                    35,
                    "Processing",
                    `Generating with ${modelDisplayName}...`,
                );
                return await callVertexAIGemini(prompt, safeParams, userInfo);
            } catch (error) {
                logError(
                    "Vertex AI Gemini image generation or safety check failed:",
                    error.message,
                );
                await logGptImageError(prompt, safeParams, userInfo, error);
                progress.updateBar(requestId, 100, "Error", error.message);
                throw error;
            }
        }

        case "kontext": {
            try {
                progress.updateBar(
                    requestId,
                    30,
                    "Processing",
                    "Checking prompt safety...",
                );
                progress.updateBar(
                    requestId,
                    35,
                    "Processing",
                    "Generating with Azure Flux Kontext...",
                );
                return await callAzureFluxKontext(prompt, safeParams, userInfo);
            } catch (error) {
                logError(
                    "Azure Flux Kontext generation failed:",
                    error.message,
                );
                await logGptImageError(prompt, safeParams, userInfo, error);
                progress.updateBar(requestId, 100, "Error", error.message);
                throw error;
            }
        }

        case "seedream5": {
            try {
                return await callSeedream5API(
                    prompt,
                    safeParams,
                    progress,
                    requestId,
                );
            } catch (error) {
                logError("Seedream 5.0 generation failed:", error.message);
                progress.updateBar(requestId, 100, "Error", error.message);
                throw error;
            }
        }

        case "seedream": {
            // Hidden legacy model -- routes to real Seedream 4.0 endpoint
            try {
                return await callSeedreamAPI(
                    prompt,
                    safeParams,
                    progress,
                    requestId,
                );
            } catch (error) {
                logError(
                    "Seedream 4.0 (legacy) generation failed:",
                    error.message,
                );
                progress.updateBar(requestId, 100, "Error", error.message);
                throw error;
            }
        }

        case "seedream-pro": {
            // Hidden legacy model -- routes to real Seedream 4.5 endpoint
            try {
                return await callSeedreamProAPI(
                    prompt,
                    safeParams,
                    progress,
                    requestId,
                );
            } catch (error) {
                logError(
                    "Seedream 4.5 Pro (legacy) generation failed:",
                    error.message,
                );
                progress.updateBar(requestId, 100, "Error", error.message);
                throw error;
            }
        }

        case "klein": {
            try {
                return await callFluxKleinAPI(
                    prompt,
                    safeParams,
                    progress,
                    requestId,
                );
            } catch (error) {
                logError("Flux Klein generation failed:", error.message);
                progress.updateBar(requestId, 100, "Error", error.message);
                throw error;
            }
        }

        case "p-image": {
            try {
                return await callPrunaImageAPI(
                    prompt,
                    safeParams,
                    progress,
                    requestId,
                );
            } catch (error) {
                logError("Pruna p-image generation failed:", error.message);
                progress.updateBar(requestId, 100, "Error", error.message);
                throw error;
            }
        }

        case "grok-imagine": {
            try {
                return await callXaiImageAPI(
                    prompt,
                    safeParams,
                    progress,
                    requestId,
                    "grok-imagine-image",
                );
            } catch (error) {
                logError("Grok Imagine generation failed:", error.message);
                progress.updateBar(requestId, 100, "Error", error.message);
                throw error;
            }
        }

        case "grok-imagine-pro": {
            try {
                return await callXaiImageAPI(
                    prompt,
                    safeParams,
                    progress,
                    requestId,
                    "grok-imagine-image-pro",
                );
            } catch (error) {
                logError("Grok Imagine Pro generation failed:", error.message);
                progress.updateBar(requestId, 100, "Error", error.message);
                throw error;
            }
        }

        case "p-image-edit": {
            try {
                return await callPrunaImageEditAPI(
                    prompt,
                    safeParams,
                    progress,
                    requestId,
                );
            } catch (error) {
                logError(
                    "Pruna p-image-edit generation failed:",
                    error.message,
                );
                progress.updateBar(requestId, 100, "Error", error.message);
                throw error;
            }
        }

        case "nova-canvas": {
            try {
                return await callNovaCanvasAPI(
                    prompt,
                    safeParams,
                    progress,
                    requestId,
                );
            } catch (error) {
                logError("Nova Canvas generation failed:", error.message);
                progress.updateBar(requestId, 100, "Error", error.message);
                throw error;
            }
        }

        case "wan-image": {
            try {
                return await callWanImageAPI(
                    prompt,
                    safeParams,
                    progress,
                    requestId,
                    false,
                );
            } catch (error) {
                logError("Wan image generation failed:", error.message);
                progress.updateBar(requestId, 100, "Error", error.message);
                throw error;
            }
        }

        case "wan-image-pro": {
            try {
                return await callWanImageAPI(
                    prompt,
                    safeParams,
                    progress,
                    requestId,
                    true,
                );
            } catch (error) {
                logError("Wan image pro generation failed:", error.message);
                progress.updateBar(requestId, 100, "Error", error.message);
                throw error;
            }
        }

        case "qwen-image": {
            try {
                return await callQwenImageAPI(
                    prompt,
                    safeParams,
                    progress,
                    requestId,
                );
            } catch (error) {
                logError("Qwen image generation failed:", error.message);
                progress.updateBar(requestId, 100, "Error", error.message);
                throw error;
            }
        }

        case "flux":
            progress.updateBar(
                requestId,
                25,
                "Processing",
                "Using registered servers",
            );
            return await callSelfHostedServer(
                prompt,
                safeParams,
                concurrentRequests,
            );

        default:
            // zimage and any unrecognized model fall through to self-hosted servers
            return await callSelfHostedServer(
                prompt,
                safeParams,
                concurrentRequests,
            );
    }
};

// GPT Image logging functions have been moved to utils/gptImageLogger.js

const extractMaturityFlags = (
    result: ImageGenerationResult,
): ContentSafetyFlags => {
    const r = result as ImageGenerationResult & {
        has_nsfw_concept?: boolean;
        concept?: { special_scores?: Record<string, number> };
    };
    const isMature = r.isMature || r.has_nsfw_concept;
    const isChild =
        r.isChild ||
        Object.values(r.concept?.special_scores || {})
            ?.slice(1)
            .some((score) => score > -0.05);
    return { isMature, isChild };
};

/**
 * Prepares metadata object based on prompt information and bad domain status
 * @param {string} prompt - The processed prompt
 * @param {string} originalPrompt - The original prompt before transformations
 * @param {Object} safeParams - Parameters for image generation
 * @param {boolean} wasTransformedForBadDomain - Flag indicating if prompt was transformed
 * @returns {Object} - Metadata object
 */
const prepareMetadata = (
    prompt: string,
    originalPrompt: string,
    safeParams: ImageParams,
    wasTransformedForBadDomain: boolean,
): ImageParams & { prompt: string; originalPrompt: string } => {
    // When a prompt was transformed due to bad domain, always use the original prompt in metadata
    // This ensures clients never see the transformed prompt
    return wasTransformedForBadDomain
        ? { ...safeParams, prompt: originalPrompt, originalPrompt }
        : { prompt, originalPrompt, ...safeParams };
};

/**
 * Processes the image buffer with format conversion and metadata
 * @param {Buffer} buffer - The raw image buffer
 * @param {Object} metadataObj - Metadata to embed in the image
 * @param {Object} maturity - Additional maturity information
 * @param {Object} progress - Progress tracking object
 * @param {string} requestId - Request ID for progress tracking
 * @returns {Promise<Buffer>} - The processed image buffer
 */
const processImageBuffer = async (
    buffer: Buffer,
    metadataObj: object,
    maturity: object,
    progress: ProgressManager,
    requestId: string,
): Promise<Buffer> => {
    // Convert format to JPEG
    progress.updateBar(requestId, 85, "Processing", "Converting to JPEG...");
    const processedBuffer = await convertToJpeg(buffer);

    // Add metadata
    progress.updateBar(requestId, 90, "Processing", "Writing metadata...");
    return await writeExifMetadata(processedBuffer, metadataObj, maturity);
};

/**
 * Creates and returns images with metadata, checking for NSFW content.
 * @param {string} prompt - The prompt for image generation.
 * @param {Object} safeParams - Parameters for image generation.
 * @param {number} concurrentRequests - Number of concurrent requests.
 * @param {string} originalPrompt - The original prompt before any transformations.
 * @param {Object} progress - Progress tracking object.
 * @param {string} requestId - Request ID for progress tracking.
 * @param {boolean} wasTransformedForBadDomain - Flag indicating if the prompt was transformed due to bad domain.
 * @param {Object} userInfo - Complete user authentication info object with authenticated, userId, tier, etc.
 * @returns {Promise<{buffer: Buffer, isChild: boolean, isMature: boolean}>}
 */
export async function createAndReturnImageCached(
    prompt: string,
    safeParams: ImageParams,
    concurrentRequests: number,
    originalPrompt: string,
    progress: ProgressManager,
    requestId: string,
    wasTransformedForBadDomain: boolean = false,
    userInfo: AuthResult,
): Promise<ImageGenerationResult> {
    try {
        // Update generation progress
        progress.updateBar(requestId, 60, "Generation", "Calling API...");

        // Generate the image using the appropriate model
        const result = await generateImage(
            prompt,
            safeParams,
            concurrentRequests,
            progress,
            requestId,
            userInfo,
        );
        progress.updateBar(requestId, 70, "Generation", "API call complete");
        progress.updateBar(requestId, 75, "Processing", "Checking safety...");

        // Extract maturity flags
        const maturityFlags = extractMaturityFlags(result);
        const { isMature, isChild } = maturityFlags;
        logError("isMature", isMature, "concepts", isChild);

        // Safety check
        if (safeParams.safe && isMature) {
            throw new HttpError(
                "NSFW content detected. This request cannot be fulfilled when safe mode is enabled.",
                400,
            );
        }

        // Prepare metadata
        const { buffer: _buffer, ...maturity } = result;
        const metadataObj = prepareMetadata(
            prompt,
            originalPrompt,
            safeParams,
            wasTransformedForBadDomain,
        );

        // Process the image buffer
        const processedBuffer = await processImageBuffer(
            result.buffer,
            metadataObj,
            maturity,
            progress,
            requestId,
        );

        return {
            buffer: processedBuffer,
            isChild,
            isMature,
            trackingData: result.trackingData,
        };
    } catch (error) {
        logError("Error in createAndReturnImageCached:", error);
        throw error;
    }
}
