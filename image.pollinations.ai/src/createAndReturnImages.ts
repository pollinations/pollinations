import debug from "debug";
import dotenv from "dotenv";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import {
    fetchFromLeastBusyFluxServer,
    fetchFromLeastBusyServer,
} from "./availableServers.ts";
import { HttpError } from "./httpError.ts";
import { incrementModelCounter } from "./modelCounter.ts";
import { callAirforceImageAPI } from "./models/airforceModel.ts";
import { callAzureFluxKontext } from "./models/azureFluxKontextModel.js";
import { callFluxKleinAPI } from "./models/fluxKleinModel.ts";
import { callSeedreamAPI, callSeedreamProAPI } from "./models/seedreamModel.ts";
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
                    ...(process.env.PLN_IMAGE_BACKEND_TOKEN && {
                        "x-backend-token": process.env.PLN_IMAGE_BACKEND_TOKEN,
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
 * Calls the Cloudflare AI API to generate images using the specified model
 * @param {string} prompt - The prompt for image generation
 * @param {Object} safeParams - The parameters for image generation
 * @param {string} modelPath - The Cloudflare AI model path
 * @param {Object} [additionalParams={}] - Additional parameters specific to the model
 * @returns {Promise<{buffer: Buffer, isMature: boolean, isChild: boolean}>}
 */
async function callCloudflareModel(
    prompt: string,
    safeParams: ImageParams,
    modelPath: string,
    additionalParams: object = {},
): Promise<ImageGenerationResult> {
    // Use the registry model name from safeParams, not the internal Cloudflare model path
    const registryModelName = safeParams.model;
    const { accountId, apiToken } = getCloudflareCredentials();

    if (!accountId || !apiToken) {
        throw new Error("Cloudflare credentials not configured");
    }

    // Limit prompt to 2048 characters
    const truncatedPrompt = prompt.slice(0, 2048);

    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/${modelPath}`;
    logCloudflare(`Calling Cloudflare model: ${modelPath}`, url);

    // Round width and height to nearest multiple of 8
    const width = roundToMultipleOf8(safeParams.width || 1024);
    const height = roundToMultipleOf8(safeParams.height || 1024);

    const requestBody = {
        prompt: truncatedPrompt,
        width: width,
        height: height,
        seed: safeParams.seed,
        ...additionalParams,
    };

    logCloudflare(
        `Cloudflare ${modelPath} request body:`,
        JSON.stringify(requestBody, null, 2),
    );

    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
    });

    // Check if response is successful
    if (!response.ok) {
        const errorText = await response.text();
        logError(
            `Cloudflare ${modelPath} API request failed, status:`,
            response.status,
            "response:",
            errorText,
        );
        logError(
            `Cloudflare ${modelPath} API request headers:`,
            JSON.stringify(Object.fromEntries([...response.headers]), null, 2),
        );
        throw new Error(
            `Cloudflare ${modelPath} API request failed with status ${response.status}: ${errorText}`,
        );
    }

    // Check content type to determine how to handle the response
    const contentType = response.headers.get("content-type");
    let imageBuffer = null;

    if (contentType?.includes("image/")) {
        // Direct binary image response (typical for SDXL)
        logCloudflare(
            `Received binary image from Cloudflare ${modelPath} with content type: ${contentType}`,
        );
        imageBuffer = Buffer.from(await response.arrayBuffer());
        logCloudflare(`Image buffer size: ${imageBuffer.length} bytes`);
    } else {
        // JSON response with base64 encoded image (typical for Flux)
        const data = (await response.json()) as {
            success?: boolean;
            errors?: Array<{ message?: string }>;
            result?: { image?: string };
        };
        logCloudflare(
            `Received JSON response from Cloudflare ${modelPath}:`,
            JSON.stringify(data, null, 2),
        );
        if (!data.success) {
            logError(
                `Cloudflare ${modelPath} API request failed, full response:`,
                data,
            );
            throw new Error(
                data.errors?.[0]?.message ||
                    `Cloudflare ${modelPath} API request failed`,
            );
        }
        if (!data.result?.image) {
            throw new Error("No image in response");
        }
        imageBuffer = Buffer.from(data.result.image, "base64");
    }

    return {
        buffer: imageBuffer,
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel: registryModelName,
            usage: {
                completionImageTokens: 1,
                totalTokenCount: 1,
            },
        },
    };
}

/**
 * Calls the Cloudflare Flux API to generate images
 * @param {string} prompt - The prompt for image generation
 * @param {ImageParams} safeParams - The parameters for image generation
 * @returns {Promise<ImageGenerationResult>}
 */
async function _callCloudflareFlux(
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> {
    return callCloudflareModel(
        prompt,
        safeParams,
        "black-forest-labs/flux-1-schnell",
        { steps: 4 },
    );
}

/**
 * Calls the Cloudflare SDXL API to generate images
 * @param {string} prompt - The prompt for image generation
 * @param {ImageParams} safeParams - The parameters for image generation
 * @returns {Promise<ImageGenerationResult>}
 */
async function _callCloudflareSDXL(
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> {
    return callCloudflareModel(
        prompt,
        safeParams,
        "bytedance/stable-diffusion-xl-lightning",
    );
}

/**
 * Calls the Cloudflare Dreamshaper API to generate images
 * @param {string} prompt - The prompt for image generation
 * @param {ImageParams} safeParams - The parameters for image generation
 * @returns {Promise<ImageGenerationResult>}
 */
async function _callCloudflareDreamshaper(
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> {
    try {
        // Append seed to prompt if it's non-default
        let modifiedPrompt = prompt;
        if (safeParams.seed && safeParams.seed !== 42) {
            modifiedPrompt = `${prompt}, seed:${safeParams.seed}`;
        }

        // Create a minimal params object with only width and height
        const dreamshaperParams = {
            width: safeParams.width || 1024,
            height: safeParams.height || 1024,
        };

        // Create a modified safeParams without the seed
        const modifiedSafeParams = { ...safeParams };
        delete modifiedSafeParams.seed;

        // Call the model with the minimal parameters
        logCloudflare(
            `Using Dreamshaper with prompt: ${modifiedPrompt} and parameters:`,
            JSON.stringify(dreamshaperParams, null, 2),
        );
        const result = await callCloudflareModel(
            modifiedPrompt,
            modifiedSafeParams,
            "lykon/dreamshaper-8-lcm",
            dreamshaperParams,
        );
        return result;
    } catch (error) {
        // Log detailed error information
        logError("Dreamshaper detailed error:", error);
        if (error.response) {
            try {
                const responseText = await error.response.text();
                logError("Dreamshaper response text:", responseText);
            } catch (textError) {
                logError("Could not get response text:", textError.message);
            }
        }
        throw error;
    }
}

/**
 * Rounds a number to the nearest multiple of 8
 * @param {number} n - Number to round
 * @returns {number} - Nearest multiple of 8
 */
function roundToMultipleOf8(n: number): number {
    return Math.round(n / 8) * 8;
}

/**
 * Common Cloudflare API configuration
 * @returns {{accountId: string, apiToken: string}} Cloudflare credentials
 */
function getCloudflareCredentials(): { accountId: string; apiToken: string } {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    return { accountId, apiToken };
}

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

/**
 * Configuration for Azure GPT Image endpoints
 */
interface AzureGPTImageConfig {
    apiKeyEnvVar: string;
    endpointEnvVar: string;
    modelName: string;
}

const AZURE_GPTIMAGE_CONFIGS: Record<string, AzureGPTImageConfig> = {
    gptimage: {
        apiKeyEnvVar: "AZURE_PF_GPTIMAGE_API_KEY",
        endpointEnvVar: "AZURE_PF_GPTIMAGE_ENDPOINT",
        modelName: "gpt-image-1-mini",
    },
    "gptimage-large": {
        apiKeyEnvVar: "AZURE_MYCELI_GPTIMAGE_LARGE_API_KEY",
        endpointEnvVar: "AZURE_MYCELI_GPTIMAGE_LARGE_ENDPOINT",
        modelName: "gpt-image-1.5",
    },
};

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
    config: AzureGPTImageConfig = AZURE_GPTIMAGE_CONFIGS.gptimage,
): Promise<ImageGenerationResult> => {
    const apiKey = process.env[config.apiKeyEnvVar];
    let endpoint = process.env[config.endpointEnvVar];

    if (!apiKey || !endpoint) {
        throw new Error(
            `Azure API key or endpoint 1 not found in environment variables`,
        );
    }

    // Check if we have input images for edit mode
    const isEditMode = safeParams.image && safeParams.image.length > 0;

    // GPT Image models support both generation and editing
    // Edit API uses /images/edits endpoint with multipart/form-data
    if (isEditMode) {
        endpoint = endpoint.replace("/images/generations", "/images/edits");
        logCloudflare(`Using Azure ${config.modelName} in edit mode (img2img)`);
    } else {
        logCloudflare(
            `Using Azure ${config.modelName} in generation mode (text2img)`,
        );
    }

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
    // Default compression to 100 (best quality)
    // const outputCompression = 70;

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
        throw new HttpError(errorText, response.status);
    }

    const data = await response.json();

    if (!data.data || !data.data[0] || !data.data[0].b64_json) {
        throw new Error("Invalid response from Azure GPT Image API");
    }

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(data.data[0].b64_json, "base64");

    // Extract token usage from Azure OpenAI response
    // Azure returns usage in format: { prompt_tokens, completion_tokens, total_tokens }
    // Log full usage breakdown for debugging high token counts
    logCloudflare(
        `GPT Image full usage: prompt_tokens=${data.usage?.prompt_tokens}, completion_tokens=${data.usage?.completion_tokens}, total_tokens=${data.usage?.total_tokens}`,
    );

    const outputTokens =
        data.usage?.completion_tokens || data.usage?.total_tokens || 1;

    logCloudflare(
        `GPT Image token usage: ${outputTokens} completion tokens (used for billing)`,
    );

    // Azure doesn't provide content safety information directly, so we'll set defaults
    // In a production environment, you might want to use a separate content moderation service
    return {
        buffer: imageBuffer,
        isMature: false, // Default assumption
        isChild: false, // Default assumption
        trackingData: {
            actualModel: safeParams.model,
            usage: {
                completionImageTokens: outputTokens,
                totalTokenCount: outputTokens,
            },
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
    const config =
        AZURE_GPTIMAGE_CONFIGS[model] || AZURE_GPTIMAGE_CONFIGS.gptimage;
    try {
        return await callAzureGPTImageWithEndpoint(
            prompt,
            safeParams,
            userInfo,
            config,
        );
    } catch (error) {
        logError(
            `Error calling Azure GPT Image API (${config.modelName}):`,
            error,
        );
        throw error;
    }
};

/**
 * Generates an image using the appropriate model based on safeParams
 * @param {string} prompt - The prompt for image generation
 * @param {Object} safeParams - Parameters for image generation
 * @param {number} concurrentRequests - Number of concurrent requests
 * @param {Object} progress - Progress tracking object
 * @param {string} requestId - Request ID for progress tracking
 * @param {Object} userInfo - Complete user authentication info object with authenticated, userId, tier, etc.
 * @returns {Promise<{buffer: Buffer, isMature: boolean, isChild: boolean, [key: string]: any}>}
 */
const generateImage = async (
    prompt: string,
    safeParams: ImageParams,
    concurrentRequests: number,
    progress: ProgressManager,
    requestId: string,
    userInfo: AuthResult,
): Promise<ImageGenerationResult> => {
    // Log model usage
    incrementModelCounter(safeParams.model).catch(() => {});

    // Model selection strategy using a more functional approach

    // GPT Image models - gpt-image-1-mini and gpt-image-1.5
    if (
        safeParams.model === "gptimage" ||
        safeParams.model === "gptimage-large"
    ) {
        const gptConfig = AZURE_GPTIMAGE_CONFIGS[safeParams.model];
        // Detailed logging of authentication info for GPT image access
        logError(
            `GPT Image (${gptConfig.modelName}) authentication check:`,
            userInfo
                ? `authenticated=${userInfo.authenticated}, tokenAuth=${userInfo.tokenAuth}, referrerAuth=${userInfo.referrerAuth}, reason=${userInfo.reason}, userId=${userInfo.userId || "none"}`
                : "No userInfo provided",
        );
        // For gptimage models, always throw errors instead of falling back
        progress.updateBar(
            requestId,
            30,
            "Processing",
            "Checking prompt safety...",
        );

        try {
            // Check prompt safety with Azure Content Safety
            const promptSafetyResult = await analyzeTextSafety(prompt);

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
                progress.updateBar(
                    requestId,
                    100,
                    "Error",
                    "Prompt contains unsafe content",
                );

                // Log the error with safety analysis results
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

            progress.updateBar(
                requestId,
                35,
                "Processing",
                `Trying Azure GPT Image (${gptConfig.modelName})...`,
            );
            return await callAzureGPTImage(
                prompt,
                safeParams,
                userInfo,
                safeParams.model,
            );
        } catch (error) {
            // Log the error but don't fall back - propagate it to the caller
            logError(
                "Azure GPT Image generation or safety check failed:",
                error.message,
            );

            await logGptImageError(prompt, safeParams, userInfo, error);

            progress.updateBar(requestId, 100, "Error", error.message);
            throw error;
        }
    }

    // Nano Banana / Nano Banana Pro - Gemini Image generation using Vertex AI
    if (
        safeParams.model === "nanobanana" ||
        safeParams.model === "nanobanana-pro"
    ) {
        // Detailed logging of authentication info for Nano Banana access
        logError(
            "Nano Banana authentication check:",
            userInfo
                ? `authenticated=${userInfo.authenticated}, tokenAuth=${userInfo.tokenAuth}, referrerAuth=${userInfo.referrerAuth}, reason=${userInfo.reason}, userId=${userInfo.userId || "none"}`
                : "No userInfo provided",
        );

        // All requests assumed to come from enter.pollinations.ai
        // For nanobanana model, always throw errors instead of falling back
        progress.updateBar(
            requestId,
            30,
            "Processing",
            "Checking prompt safety...",
        );

        try {
            // Check prompt safety with Azure Content Safety
            const promptSafetyResult = await analyzeTextSafety(prompt);

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
                progress.updateBar(
                    requestId,
                    100,
                    "Error",
                    "Prompt contains unsafe content",
                );

                // Log the error with safety analysis results
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

            const modelDisplayName =
                safeParams.model === "nanobanana-pro"
                    ? "Nano Banana Pro"
                    : "Nano Banana";
            progress.updateBar(
                requestId,
                35,
                "Processing",
                `Generating with ${modelDisplayName}...`,
            );
            return await callVertexAIGemini(prompt, safeParams, userInfo);
        } catch (error) {
            // Log the error but don't fall back - propagate it to the caller
            logError(
                "Vertex AI Gemini image generation or safety check failed:",
                error.message,
            );

            await logGptImageError(prompt, safeParams, userInfo, error);

            progress.updateBar(requestId, 100, "Error", error.message);
            throw error;
        }
    }

    if (safeParams.model === "kontext") {
        // All requests assumed to come from enter.pollinations.ai - tier checks bypassed
        try {
            // Check prompt safety
            progress.updateBar(
                requestId,
                30,
                "Processing",
                "Checking prompt safety...",
            );

            // Use Azure Flux Kontext for image generation/editing
            progress.updateBar(
                requestId,
                35,
                "Processing",
                "Generating with Azure Flux Kontext...",
            );
            return await callAzureFluxKontext(prompt, safeParams, userInfo);
        } catch (error) {
            logError("Azure Flux Kontext generation failed:", error.message);
            await logGptImageError(prompt, safeParams, userInfo, error);
            progress.updateBar(requestId, 100, "Error", error.message);
            throw error;
        }
    }

    if (safeParams.model === "seedream") {
        // Seedream 4.0 - better quality (default)
        try {
            return await callSeedreamAPI(
                prompt,
                safeParams,
                progress,
                requestId,
            );
        } catch (error) {
            logError("Seedream 4.0 generation failed:", error.message);
            progress.updateBar(requestId, 100, "Error", error.message);
            throw error;
        }
    }

    if (safeParams.model === "seedream-pro") {
        // Seedream 4.5 Pro - 4K, multi-image
        try {
            return await callSeedreamProAPI(
                prompt,
                safeParams,
                progress,
                requestId,
            );
        } catch (error) {
            logError("Seedream 4.5 Pro generation failed:", error.message);
            progress.updateBar(requestId, 100, "Error", error.message);
            throw error;
        }
    }

    if (safeParams.model === "klein") {
        // Klein - Fast 4B model on Modal (text-to-image + image editing)
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

    if (safeParams.model === "klein-large") {
        // Klein Large - Higher quality 9B model on Modal (text-to-image + image editing)
        try {
            return await callFluxKleinAPI(
                prompt,
                safeParams,
                progress,
                requestId,
                "klein-large",
            );
        } catch (error) {
            logError("Flux Klein Large generation failed:", error.message);
            progress.updateBar(requestId, 100, "Error", error.message);
            throw error;
        }
    }

    // api.airforce models (imagen)
    if (safeParams.model === "imagen") {
        return await callAirforceImageAPI(
            prompt,
            safeParams,
            progress,
            requestId,
            "imagen-3",
        );
    }

    if (safeParams.model === "flux") {
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
    }

    return await callSelfHostedServer(prompt, safeParams, concurrentRequests);
};

// GPT Image logging functions have been moved to utils/gptImageLogger.js

// TODO: Check if this type is still used and where @voodohop
// see https://github.com/pollinations/pollinations/issues/3276
interface NSFWContentSafetyFlags {
    has_nsfw_concept?: boolean;
    concept?: {
        special_scores?: Record<string, number>;
    };
}

/**
 * Extracts and normalizes maturity flags from image generation result
 * @param {Object} result - The image generation result
 * @returns {{isMature: boolean, isChild: boolean}}
 */
const extractMaturityFlags = (
    result: ImageGenerationResult & NSFWContentSafetyFlags,
): ContentSafetyFlags => {
    const isMature = result?.isMature || result?.has_nsfw_concept;
    const concept = result?.concept;
    const isChild =
        result?.isChild ||
        Object.values(concept?.special_scores || {})
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
