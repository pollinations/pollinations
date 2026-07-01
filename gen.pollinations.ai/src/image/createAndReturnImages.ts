import debug from "debug";
import { fetchFromWeightedServer } from "./availableServers.ts";
import { getImageEnv } from "./env.ts";
import { HttpError } from "./httpError.ts";
import { callAzureFluxKontext } from "./models/azureFluxKontextModel.js";
import { callFireworksFluxSchnellAPI } from "./models/fireworksFluxModel.ts";
import { callFluxKleinAPI } from "./models/fluxKleinModel.ts";
import {
    callIdeogramBalancedAPI,
    callIdeogramQualityAPI,
    callIdeogramTurboAPI,
} from "./models/ideogramReplicateModel.ts";
import { callNovaCanvasAPI } from "./models/novaCanvasModel.ts";
import {
    callPrunaImageAPI,
    callPrunaImageEditAPI,
} from "./models/prunaModel.ts";
import { callQwenImageAPI } from "./models/qwenImageModel.ts";
import { callSeedream5API } from "./models/seedream5ReplicateModel.ts";
import {
    callSeedreamAPI,
    callSeedreamProAPI,
} from "./models/seedreamReplicateModel.ts";
import { callWanImageAPI } from "./models/wanImageModel.ts";
import { callXaiImageAPI } from "./models/xaiModel.ts";
import type { ImageParams } from "./params.ts";
import { sanitizeString } from "./util.ts";
import { closestByRatio } from "./utils/aspectRatio.ts";
import {
    analyzeImageSafety,
    type ContentSafetyFlags,
    requireSafePrompt,
} from "./utils/azureContentSafety.ts";
import { logGptImageError } from "./utils/gptImageLogger.ts";
import {
    base64ToBuffer,
    bufferToUint8Array,
    detectMimeType,
    downloadUserImage,
} from "./utils/imageDownload.ts";
import {
    resizeForGptImage,
    convertToJpeg as transformToJpeg,
} from "./utils/imageTransform.ts";
import type { TrackingData } from "./utils/trackingHeaders.ts";
import { callVertexAIGemini } from "./vertexAIImageGenerator.js";
import { writeExifMetadata } from "./writeExifMetadata.ts";

// Loggers
const logError = debug("pollinations:error");
const logPerf = debug("pollinations:perf");
const logOps = debug("pollinations:ops");
const logCloudflare = debug("pollinations:cloudflare");

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
    tokenAuth: boolean;
    userId: string | null;
    username: string | null;
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
 * Resizes an input image buffer for GPT Image editing to reduce token costs.
 * GPT Image 1.5 calculates input tokens as: (width × height) / 750
 * Large images can result in very high token costs (e.g., 4K = ~11,000 tokens)
 *
 * @param buffer - The input image buffer
 * @returns Resized buffer (PNG format) if image exceeds max pixels, otherwise original
 */
async function resizeInputImageForGptImage(buffer: Buffer): Promise<Buffer> {
    try {
        return await resizeForGptImage(buffer);
    } catch (error) {
        logError("Failed to resize input image, using original:", error);
        return buffer;
    }
}

/**
 * Calls self-hosted image generation servers (zimage pool).
 * @param {string} prompt - The prompt for image generation.
 * @param {Object} safeParams - The parameters for image generation.
 * @returns {Promise<Array>} - The generated images.
 */
export const callSelfHostedServer = async (
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> => {
    try {
        logOps("safeParams", safeParams);
        // Always use max steps (4) - every request is an authenticated gateway request
        const steps = 4;
        logOps("calculated_steps", steps);

        prompt = sanitizeString(prompt);

        const body = {
            prompts: [prompt],
            width: safeParams.width,
            height: safeParams.height,
            seed: safeParams.seed,
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
            response = await fetchFromWeightedServer("zimage", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(getImageEnv("PLN_GPU_TOKEN") && {
                        "x-backend-token": getImageEnv("PLN_GPU_TOKEN"),
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

        const buffer = base64ToBuffer(image);

        return {
            buffer,
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
    if (detectMimeType(buffer) !== "image/jpeg") {
        return transformToJpeg(buffer);
    }
    return buffer;
}

interface GPTImageConfig {
    provider: "azure" | "openai";
    baseUrl: string;
    modelName: string;
    apiKeyEnv: string;
}

const AZURE_API_VERSION = "2025-04-01-preview";

const GPTIMAGE_CONFIGS: Record<string, GPTImageConfig> = {
    gptimage: {
        provider: "azure",
        baseUrl:
            "https://myceli-prod-img-westus3.cognitiveservices.azure.com/openai/deployments/gpt-image-1-mini",
        modelName: "gpt-image-1-mini",
        apiKeyEnv: "AZURE_MYCELI_PROD_IMG_WESTUS3_API_KEY",
    },
    "gptimage-large": {
        provider: "azure",
        baseUrl:
            "https://myceli-prod-img-westus3.cognitiveservices.azure.com/openai/deployments/gpt-image-1.5",
        modelName: "gpt-image-1.5",
        apiKeyEnv: "AZURE_MYCELI_PROD_IMG_WESTUS3_API_KEY",
    },
    "gpt-image-2": {
        provider: "openai",
        baseUrl: "https://api.openai.com/v1",
        modelName: "gpt-image-2",
        apiKeyEnv: "OPENAI_API_KEY",
    },
};

const callGPTImageWithEndpoint = async (
    prompt: string,
    safeParams: ImageParams,
    userInfo: AuthResult,
    config: GPTImageConfig = GPTIMAGE_CONFIGS.gptimage,
): Promise<ImageGenerationResult> => {
    const apiKey = getImageEnv(config.apiKeyEnv);

    if (!apiKey) {
        throw new Error(
            `${config.apiKeyEnv} not found in environment variables`,
        );
    }

    const isEditMode = safeParams.image && safeParams.image.length > 0;
    const path = isEditMode ? "images/edits" : "images/generations";
    const endpoint =
        config.provider === "azure"
            ? `${config.baseUrl}/${path}?api-version=${AZURE_API_VERSION}`
            : `${config.baseUrl}/${path}`;
    logCloudflare(
        `Using ${config.provider} ${config.modelName} in ${isEditMode ? "edit" : "generation"} mode`,
    );

    // Map safeParams to Azure API parameters
    // GPT Image 1.5 only supports: 1024x1024 (1:1), 1024x1536 (2:3), 1536x1024 (3:2)
    // Select the size with the closest aspect ratio to the input.
    // Table order preserves the historical tie behavior (e.g. a 5:4 input,
    // equidistant from 1:1 and 3:2, picks 1536x1024).
    const size = closestByRatio(safeParams.width, safeParams.height, [
        { size: "1536x1024", ratio: 1.5 },
        { size: "1024x1536", ratio: 1 / 1.5 },
        { size: "1024x1024", ratio: 1 },
    ]).size;

    // Use requested quality - access control runs in this worker's auth/balance middleware
    const quality = safeParams.quality === "hd" ? "high" : safeParams.quality;

    // Set output format to png if model is gptimage, otherwise jpeg
    const outputFormat = "png";
    // Build request body. OpenAI's direct API requires model in body; Azure
    // routes by deployment name in the URL path so model is implicit there.
    const requestBody = {
        ...(config.provider === "openai" ? { model: config.modelName } : {}),
        prompt: sanitizeString(prompt),
        size,
        quality,
        output_format: outputFormat,
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

    if (safeParams.seed) {
        logCloudflare(
            `Seed value ${safeParams.seed} not supported by GPT Image API, ignoring`,
        );
    }

    logCloudflare("Calling GPT Image API with params:", requestBody);

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

                    const { buffer: originalBuffer, mimeType } =
                        await downloadUserImage(imageUrl);

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

                    // Use the image[] array notation as required by Azure OpenAI API
                    // Create a Blob with explicit MIME type to avoid application/octet-stream
                    const extension = `.${mimeType.split("/")[1]}`;
                    const imageBlob = new Blob([bufferToUint8Array(buffer)], {
                        type: mimeType,
                    });
                    formData.append("image[]", imageBlob, `image${extension}`);
                } catch (error) {
                    // Preserve HttpError status (e.g. 400 from downloadUserImage);
                    // wrap other errors as generic processing failures.
                    logError(`Error processing image ${i + 1}:`, error.message);
                    if (error instanceof HttpError) throw error;
                    throw new Error(
                        `Failed to process image: ${error.message}`,
                    );
                }
            }
        } catch (error) {
            logError("Error processing image for editing:", error);
            if (error instanceof HttpError) throw error;
            throw new Error(`Failed to process image: ${error.message}`);
        }

        // OpenAI direct requires model in form data; Azure uses URL deployment.
        if (config.provider === "openai") {
            formData.append("model", config.modelName);
        }
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
        // Provider 403 on Azure means content/quota block, not client auth.
        // Remap to 502 so callers see it as upstream. OpenAI 403 is genuine
        // auth failure, leave as-is.
        const status =
            config.provider === "azure" && response.status === 403
                ? 502
                : response.status;
        throw new HttpError(errorText, status, undefined, endpoint);
    }

    const data = (await response.json()) as {
        data?: Array<{ b64_json?: string }>;
        usage?: AzureGPTImageUsage;
    };

    if (!data.data?.[0]?.b64_json) {
        throw new Error("Invalid response from GPT Image API");
    }

    // Convert base64 to buffer
    const imageBuffer = base64ToBuffer(data.data[0].b64_json);

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

export const callGPTImage = async (
    prompt: string,
    safeParams: ImageParams,
    userInfo: AuthResult,
    model: string = "gptimage",
): Promise<ImageGenerationResult> => {
    const config = GPTIMAGE_CONFIGS[model] || GPTIMAGE_CONFIGS.gptimage;
    try {
        return await callGPTImageWithEndpoint(
            prompt,
            safeParams,
            userInfo,
            config,
        );
    } catch (error) {
        logError(
            `Error calling ${config.provider} GPT Image API (${config.modelName}):`,
            error,
        );
        throw error;
    }
};

/**
 * Formats user auth info for logging.
 */
function formatAuthInfo(userInfo: AuthResult): string {
    return userInfo
        ? `tokenAuth=${userInfo.tokenAuth}, userId=${userInfo.userId || "none"}`
        : "No userInfo provided";
}

const generateImage = async (
    prompt: string,
    safeParams: ImageParams,
    userInfo: AuthResult,
): Promise<ImageGenerationResult> => {
    switch (safeParams.model) {
        case "gptimage":
        case "gptimage-large":
        case "gpt-image-2": {
            const gptConfig = GPTIMAGE_CONFIGS[safeParams.model];
            logError(
                `GPT Image (${gptConfig.modelName}) authentication check:`,
                formatAuthInfo(userInfo),
            );

            try {
                await requireSafePrompt(prompt, safeParams, userInfo);
                return await callGPTImage(
                    prompt,
                    safeParams,
                    userInfo,
                    safeParams.model,
                );
            } catch (error) {
                logError(
                    `${gptConfig.provider} GPT Image generation or safety check failed:`,
                    error.message,
                );
                await logGptImageError(prompt, safeParams, userInfo, error);
                throw error;
            }
        }

        case "nanobanana":
        case "nanobanana-2":
        case "nanobanana-2-lite":
        case "nanobanana-pro": {
            logError(
                "Nano Banana authentication check:",
                formatAuthInfo(userInfo),
            );

            try {
                if (safeParams.safe) {
                    await requireSafePrompt(prompt, safeParams, userInfo);
                }

                return await callVertexAIGemini(prompt, safeParams);
            } catch (error) {
                logError(
                    "Vertex AI Gemini image generation or safety check failed:",
                    error.message,
                );
                await logGptImageError(prompt, safeParams, userInfo, error);
                throw error;
            }
        }

        case "kontext": {
            try {
                return await callAzureFluxKontext(prompt, safeParams, userInfo);
            } catch (error) {
                logError(
                    "Azure Flux Kontext generation failed:",
                    error.message,
                );
                await logGptImageError(prompt, safeParams, userInfo, error);
                throw error;
            }
        }

        case "seedream5":
            return await callSeedream5API(prompt, safeParams);

        case "seedream":
            return await callSeedreamAPI(prompt, safeParams);

        case "seedream-pro":
            return await callSeedreamProAPI(prompt, safeParams);

        case "ideogram-v4-turbo":
            return await callIdeogramTurboAPI(prompt, safeParams);

        case "ideogram-v4-balanced":
            return await callIdeogramBalancedAPI(prompt, safeParams);

        case "ideogram-v4-quality":
            return await callIdeogramQualityAPI(prompt, safeParams);

        case "klein":
            return await callFluxKleinAPI(prompt, safeParams);

        case "p-image":
            return await callPrunaImageAPI(prompt, safeParams);

        case "grok-imagine":
            return await callXaiImageAPI(
                prompt,
                safeParams,
                "grok-imagine-image",
            );

        case "grok-imagine-pro":
            return await callXaiImageAPI(
                prompt,
                safeParams,
                "grok-imagine-image-pro",
            );

        case "p-image-edit":
            return await callPrunaImageEditAPI(prompt, safeParams);

        case "nova-canvas":
            return await callNovaCanvasAPI(prompt, safeParams);

        case "wan-image":
            return await callWanImageAPI(prompt, safeParams, false);

        case "wan-image-pro":
            return await callWanImageAPI(prompt, safeParams, true);

        case "qwen-image":
            return await callQwenImageAPI(prompt, safeParams);

        case "flux":
            return await callFireworksFluxSchnellAPI(prompt, safeParams);

        default:
            // zimage is the only model that reaches the default branch
            // (the model enum is closed and every other model is dispatched above)
            return await callSelfHostedServer(prompt, safeParams);
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
    const isMature = Boolean(r.isMature || r.has_nsfw_concept);
    const isChild =
        Boolean(r.isChild) ||
        Object.values(r.concept?.special_scores || {})
            ?.slice(1)
            .some((score) => score > -0.05);
    return { isMature, isChild };
};

const prepareMetadata = (
    prompt: string,
    originalPrompt: string,
    safeParams: ImageParams,
): ImageParams & { prompt: string; originalPrompt: string } => {
    return { prompt, originalPrompt, ...safeParams };
};

/**
 * Processes the image buffer with format conversion and metadata
 * @param {Buffer} buffer - The raw image buffer
 * @param {Object} metadataObj - Metadata to embed in the image
 * @param {Object} maturity - Additional maturity information
 * @returns {Promise<Buffer>} - The processed image buffer
 */
const processImageBuffer = async (
    buffer: Buffer,
    metadataObj: object,
    maturity: object,
): Promise<Buffer> => {
    const processedBuffer = await convertToJpeg(buffer);
    return await writeExifMetadata(processedBuffer, metadataObj, maturity);
};

/**
 * Creates and returns images with metadata, checking for NSFW content.
 * @param {string} prompt - The prompt for image generation.
 * @param {Object} safeParams - Parameters for image generation.
 * @param {string} originalPrompt - The original prompt before any transformations.
 * @param {Object} userInfo - User authentication info for safety logging.
 * @returns {Promise<{buffer: Buffer, isChild: boolean, isMature: boolean}>}
 */
export async function createAndReturnImageCached(
    prompt: string,
    safeParams: ImageParams,
    originalPrompt: string,
    userInfo: AuthResult,
): Promise<ImageGenerationResult> {
    try {
        // Generate the image using the appropriate model
        const result = await generateImage(prompt, safeParams, userInfo);

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
        const metadataObj = prepareMetadata(prompt, originalPrompt, safeParams);

        // Process the image buffer
        const processedBuffer = await processImageBuffer(
            result.buffer,
            metadataObj,
            maturity,
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
