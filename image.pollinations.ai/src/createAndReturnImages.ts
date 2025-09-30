import debug from "debug";
import dotenv from "dotenv";
import { fileTypeFromBuffer } from "file-type";

// Import shared authentication utilities
import sharp from "sharp";
import { hasSufficientTier } from "../../shared/tier-gating.js";
import {
    fetchFromLeastBusyFluxServer,
    getNextTurboServerUrl,
} from "./availableServers.ts";
import {
    addPollinationsLogoWithImagemagick,
    getLogoPath,
} from "./imageOperations.ts";
import { sanitizeString } from "./translateIfNecessary.ts";
import {
    analyzeImageSafety,
    analyzeTextSafety,
    type ContentSafetyFlags,
} from "./utils/azureContentSafety.ts";
import type { TrackingData } from "./utils/trackingHeaders.ts";

// Import GPT Image logging utilities
import { logGptImageError, logGptImagePrompt } from "./utils/gptImageLogger.ts";
// Import Vertex AI Gemini image generator
import { callVertexAIGemini } from "./vertexAIImageGenerator.js";
import { writeExifMetadata } from "./writeExifMetadata.ts";
import type { ImageParams } from "./params.ts";
import { withTimeoutSignal } from "./util.ts";
import type { ProgressManager } from "./progressBar.ts";

// Import model handlers
import { callBPAIGenWithKontextFallback } from "./models/bpaigenModel.ts";
import { callSeedreamAPI } from "./models/seedreamModel.ts";

dotenv.config();

// Loggers
const logError = debug("pollinations:error");
const logPerf = debug("pollinations:perf");
const logOps = debug("pollinations:ops");
const logCloudflare = debug("pollinations:cloudflare");

// Constants
const TARGET_PIXEL_COUNT = 1024 * 1024; // 1 megapixel

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
    tier: string;
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

async function fetchFromTurboServer(params: object) {
    const host = await getNextTurboServerUrl();
    return fetch(`${host}/generate`, params);
}

/**
 * Calls the ComfyUI API to generate images.
 * @param {string} prompt - The prompt for image generation.
 * @param {Object} safeParams - The parameters for image generation.
 * @param {number} concurrentRequests - The number of concurrent requests.
 * @returns {Promise<Array>} - The generated images.
 */
export const callComfyUI = async (
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

        // Linear scaling of steps between 6 (at concurrentRequests=2) and 1 (at concurrentRequests=36)
        const steps = Math.max(
            1,
            Math.round(4 - ((concurrentRequests - 2) * (3 - 1)) / (10 - 2)),
        );
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
            const fetchFunction =
                safeParams.model === "turbo"
                    ? fetchFromTurboServer
                    : fetchFromLeastBusyFluxServer;
            response = await fetchFunction({
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });
        } catch (error) {
            logError(`Fetch failed: ${error.message}`);
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
                    actualModel: 'comfyui',
                    usage: {
                        candidatesTokenCount: 1,
                        totalTokenCount: 1
                    }
                }
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
                actualModel: 'comfyui',
                usage: {
                    candidatesTokenCount: 1,
                    totalTokenCount: 1
                }
            }
        };
    } catch (e) {
        logError("Error in callComfyUI:", e);
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
        seed: safeParams.seed || Math.floor(Math.random() * 1000000),
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
        const data = await response.json();
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
            actualModel: modelPath,
            usage: {
                candidatesTokenCount: 1,
                totalTokenCount: 1
            }
        }
    };
}

/**
 * Calls the Cloudflare Flux API to generate images
 * @param {string} prompt - The prompt for image generation
 * @param {ImageParams} safeParams - The parameters for image generation
 * @returns {Promise<ImageGenerationResult>}
 */
async function callCloudflareFlux(
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
async function callCloudflareSDXL(
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
async function callCloudflareDreamshaper(
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
 * Helper function to call Azure GPT Image with specific endpoint
 * @param {string} prompt - The prompt for image generation or editing
 * @param {Object} safeParams - The parameters for image generation or editing
 * @param {Object} userInfo - User authentication info object
 * @param {number} endpointIndex - The endpoint index to use (1 or 2)
 * @returns {Promise<{buffer: Buffer, isMature: boolean, isChild: boolean}>}
 */
const callAzureGPTImageWithEndpoint = async (
    prompt: string,
    safeParams: ImageParams,
    userInfo: AuthResult,
    endpointIndex: number,
): Promise<ImageGenerationResult> => {
    const apiKey = process.env[`GPT_IMAGE_${endpointIndex}_AZURE_API_KEY`];
    let endpoint = process.env[`GPT_IMAGE_${endpointIndex}_ENDPOINT`];

    if (!apiKey || !endpoint) {
        throw new Error(
            `Azure API key or endpoint ${endpointIndex} not found in environment variables`,
        );
    }

    // Check if we need to use the edits endpoint instead of generations
    const isEditMode = safeParams.image && safeParams.image.length > 0;
    if (isEditMode) {
        // Replace 'generations' with 'edits' in the endpoint URL
        endpoint = endpoint.replace("/images/generations", "/images/edits");
        logCloudflare(`Using Azure endpoint ${endpointIndex} in edit mode`);
    } else {
        logCloudflare(
            `Using Azure endpoint ${endpointIndex} in generation mode`,
        );
    }

    // Map safeParams to Azure API parameters
    const size = `${safeParams.width}x${safeParams.height}`;

    // Determine quality based on safeParams or use medium as default
    const quality = safeParams.quality || "medium";

    // Set output format to png if model is gptimage, otherwise jpeg
    const outputFormat = "png";
    // Default compression to 100 (best quality)
    // const outputCompression = 70;

    // Build request body
    const requestBody = {
        prompt: sanitizeString(prompt),
        size: "auto",
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
                throw new Error(
                    "Image URL is required for GPT Image edit mode but was not provided",
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
                    const buffer = Buffer.from(imageArrayBuffer);

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

                    // Determine file extension from Content-Type header
                    const contentType =
                        imageResponse.headers.get("content-type") || "";
                    let extension = ".png"; // Default extension

                    // Extract extension from content type (e.g., "image/jpeg" -> "jpeg")
                    if (contentType.startsWith("image/")) {
                        const mimeExtension = contentType
                            .split("/")[1]
                            .split(";")[0]; // Handle cases like "image/jpeg; charset=utf-8"
                        extension = `.${mimeExtension}`;
                    }

                    // Use the image[] array notation as required by Azure OpenAI API
                    // Create a Blob from the already-read arrayBuffer instead of calling blob() again
                    const imageBlob = new Blob([imageArrayBuffer], { type: contentType });
                    formData.append(
                        "image[]",
                        imageBlob,
                        extension,
                    );
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
        // Clone the response before consuming its body
        const errorResponse = response.clone();
        const errorText = await errorResponse.text();
        throw new Error(
            `Azure GPT Image API error: ${response.status} - error ${errorText}`,
        );
    }

    const data = await response.json();

    if (!data.data || !data.data[0] || !data.data[0].b64_json) {
        throw new Error("Invalid response from Azure GPT Image API");
    }

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(data.data[0].b64_json, "base64");

    // Azure doesn't provide content safety information directly, so we'll set defaults
    // In a production environment, you might want to use a separate content moderation service
    return {
        buffer: imageBuffer,
        isMature: false, // Default assumption
        isChild: false, // Default assumption
    };
};

/**
 * Calls the Azure GPT Image API to generate or edit images
 * @param {string} prompt - The prompt for image generation or editing
 * @param {Object} safeParams - The parameters for image generation or editing
 * @param {Object} userInfo - Complete user authentication info object with authenticated, userId, tier, etc.
 * @returns {Promise<{buffer: Buffer, isMature: boolean, isChild: boolean}>}
 */
export const callAzureGPTImage = async (
    prompt: string,
    safeParams: ImageParams,
    userInfo: AuthResult,
): Promise<ImageGenerationResult> => {
    try {
        // Extract user tier with fallback to 'seed'
        const userTier = userInfo.tier || "seed";

        // Stage-based endpoint selection instead of random
        // seed stage → GPT_IMAGE_1_ENDPOINT (standard endpoint)
        // flower/nectar stage → GPT_IMAGE_2_ENDPOINT (advanced endpoint)
        // const endpointIndex = (userTier === 'seed') ? 1 : 2;

        const endpointIndex = Math.random() < 0.5 ? 1 : 2;
        logCloudflare(
            `Using Azure GPT Image endpoint ${endpointIndex} for user tier: ${userTier}`,
            userInfo.userId ? `(userId: ${userInfo.userId})` : "(anonymous)",
        );

        return await callAzureGPTImageWithEndpoint(
            prompt,
            safeParams,
            userInfo,
            endpointIndex,
        );
    } catch (error) {
        logError("Error calling Azure GPT Image API:", error);
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
    // Model selection strategy using a more functional approach
    
    // GPT Image model (temporarily disabled - uncomment to reactivate)
    // if (safeParams.model === "gptimage") {
    //     // Detailed logging of authentication info for GPT image access
    //     logError(
    //         "GPT Image authentication check:",
    //         userInfo
    //             ? `authenticated=${userInfo.authenticated}, tokenAuth=${userInfo.tokenAuth}, referrerAuth=${userInfo.referrerAuth}, reason=${userInfo.reason}, userId=${userInfo.userId || "none"}, tier=${userInfo.tier || "none"}`
    //             : "No userInfo provided",
    //     );

    //     // Restrict GPT Image model to users with valid authentication
    //     if (!hasSufficientTier(userInfo.tier, "seed")) {
    //         const errorText =
    //             "Access to gpt-image-1 is currently limited to users in the seed tier. We will be opening up access gradually. Please authenticate at https://auth.pollinations.ai for tier upgrade information.";
    //         logError(errorText);
    //         progress.updateBar(
    //             requestId,
    //             35,
    //             "Auth",
    //             "GPT Image requires authorization",
    //         );
    //         throw new Error(errorText);
    //     } else {
    //         // For gptimage model, always throw errors instead of falling back
    //         progress.updateBar(
    //             requestId,
    //             30,
    //             "Processing",
    //             "Checking prompt safety...",
    //         );

    //         try {
    //             // Check prompt safety with Azure Content Safety
    //             const promptSafetyResult = await analyzeTextSafety(prompt);

    //             // Log the prompt with safety analysis results
    //             await logGptImagePrompt(
    //                 prompt,
    //                 safeParams,
    //                 userInfo,
    //                 promptSafetyResult,
    //             );

    //             if (!promptSafetyResult.safe) {
    //                 const errorMessage = `Prompt contains unsafe content: ${promptSafetyResult.formattedViolations}`;
    //                 logError(
    //                     "Azure Content Safety rejected prompt:",
    //                     errorMessage,
    //                 );
    //                 progress.updateBar(
    //                     requestId,
    //                     100,
    //                     "Error",
    //                     "Prompt contains unsafe content",
    //                 );

    //                 // Log the error with safety analysis results
    //                 const error = new Error(errorMessage);
    //                 await logGptImageError(
    //                     prompt,
    //                     safeParams,
    //                     userInfo,
    //                     error,
    //                     promptSafetyResult,
    //                 );
    //                 throw error;
    //             }

    //             progress.updateBar(
    //                 requestId,
    //                 35,
    //                 "Processing",
    //                 "Trying Azure GPT Image...",
    //             );
    //             return await callAzureGPTImage(prompt, safeParams, userInfo);
    //         } catch (error) {
    //             // Log the error but don't fall back - propagate it to the caller
    //             logError(
    //                 "Azure GPT Image generation or safety check failed:",
    //                 error.message,
    //             );

    //             await logGptImageError(prompt, safeParams, userInfo, error);

    //             progress.updateBar(requestId, 100, "Error", error.message);
    //             throw error;
    //         }
    //     }
    // }

    // Nano Banana - Gemini Image generation using Vertex AI
    if (safeParams.model === "nanobanana") {
        // Detailed logging of authentication info for Nano Banana access
        logError(
            "Nano Banana authentication check:",
            userInfo
                ? `authenticated=${userInfo.authenticated}, tokenAuth=${userInfo.tokenAuth}, referrerAuth=${userInfo.referrerAuth}, reason=${userInfo.reason}, userId=${userInfo.userId || "none"}, tier=${userInfo.tier || "none"}`
                : "No userInfo provided",
        );

        // Restrict Nano Banana model to users with valid authentication (seed tier)
        if (!hasSufficientTier(userInfo.tier, "seed")) {
            const errorText =
                "Access to nanobanana is currently limited to users in the seed tier or higher. Please authenticate at https://auth.pollinations.ai for tier upgrade information.";
            logError(errorText);
            progress.updateBar(
                requestId,
                35,
                "Auth",
                "Nano Banana requires authorization",
            );
            throw new Error(errorText);
        } else {
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
                    logError(
                        "Azure Content Safety rejected prompt:",
                        errorMessage,
                    );
                    progress.updateBar(
                        requestId,
                        100,
                        "Error",
                        "Prompt contains unsafe content",
                    );

                    // Log the error with safety analysis results
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

                progress.updateBar(
                    requestId,
                    35,
                    "Processing",
                    "Generating with Nano Banana...",
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
    }

    if (safeParams.model === "kontext") {
        // BPAIGen+Kontext hybrid model requires seed tier or higher
        if (!hasSufficientTier(userInfo.tier, "seed")) {
            const errorText =
                "Access to kontext model is limited to users in the seed tier or higher. Please authenticate at https://auth.pollinations.ai to get a token or add a referrer.";
            logError(errorText);
            progress.updateBar(
                requestId,
                35,
                "Auth",
                "Kontext model requires seed tier",
            );
            throw new Error(errorText);
        }

        try {
            // Use BPAIGen with Kontext fallback for enhanced reliability and quality
            return await callBPAIGenWithKontextFallback(prompt, safeParams, progress, requestId);
        } catch (error) {
            logError("Both BPAIGen and Kontext failed:", error.message);
            progress.updateBar(requestId, 100, "Error", error.message);
            throw error;
        }
    }

    if (safeParams.model === "seedream") {
        // Seedream model requires seed tier or higher
        if (!hasSufficientTier(userInfo.tier, "seed")) {
            const errorText =
                "Access to seedream model is limited to users in the seed tier or higher. Please authenticate at https://auth.pollinations.ai to get a token or add a referrer.";
            logError(errorText);
            progress.updateBar(
                requestId,
                35,
                "Auth",
                "Seedream model requires seed tier",
            );
            throw new Error(errorText);
        }

        try {
            // Use ByteDance ARK Seedream API for high-quality image generation
            return await callSeedreamAPI(prompt, safeParams, progress, requestId);
        } catch (error) {
            logError("Seedream generation failed:", error.message);
            progress.updateBar(requestId, 100, "Error", error.message);
            throw error;
        }
    }

    if (safeParams.model === "flux") {
        progress.updateBar(requestId, 25, "Processing", "Using registered servers");
        try {
            return await callComfyUI(prompt, safeParams, concurrentRequests);
        } catch (error) {
            progress.updateBar(
                requestId,
                30,
                "Processing",
                `Registered servers failed: ${error}. Falling back to Cloudflare Flux...`,
            );
            // Fallback to Cloudflare Flux
            progress.updateBar(requestId, 35, "Processing", "Generating image with Cloudflare Flux...");
            try {
                return await callCloudflareFlux(prompt, safeParams);
            } catch (error) {
                progress.updateBar(
                    requestId,
                    40,
                    "Processing",
                    `Cloudflare Flux failed: ${error}. Falling back to Dreamshaper...`,
                );
                // Final fallback to Dreamshaper
                return await callCloudflareDreamshaper(prompt, safeParams);
            }
        }
    }

    try {
        return await callComfyUI(prompt, safeParams, concurrentRequests);
    } catch (_error) {
        progress.updateBar(
            requestId,
            35,
            "Processing",
            "Trying Cloudflare Dreamshaper...",
        );
        return await callCloudflareDreamshaper(prompt, safeParams);
    }
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
 * Processes the image buffer with logo, format conversion, and metadata
 * @param {Buffer} buffer - The raw image buffer
 * @param {Object} maturityFlags - Object containing isMature and isChild flags
 * @param {Object} safeParams - Parameters for image generation
 * @param {Object} metadataObj - Metadata to embed in the image
 * @param {Object} maturity - Additional maturity information
 * @param {Object} progress - Progress tracking object
 * @param {string} requestId - Request ID for progress tracking
 * @returns {Promise<Buffer>} - The processed image buffer
 */
const processImageBuffer = async (
    buffer: Buffer,
    maturityFlags: ContentSafetyFlags,
    safeParams: ImageParams,
    metadataObj: object,
    maturity: object,
    progress: ProgressManager,
    requestId: string,
): Promise<Buffer> => {
    const { isMature, isChild } = maturityFlags;

    // Add logo
    progress.updateBar(requestId, 80, "Processing", "Adding logo...");
    const logoPath = getLogoPath(safeParams, isChild, isMature);
    let processedBuffer = !logoPath
        ? buffer
        : await addPollinationsLogoWithImagemagick(
              buffer,
              logoPath,
              safeParams,
          );

    // Convert format to JPEG (gptimage PNG support temporarily disabled)
    progress.updateBar(
        requestId,
        85,
        "Processing",
        "Converting to JPEG...",
    );
    processedBuffer = await convertToJpeg(processedBuffer);
    
    // GPT Image PNG format support (temporarily disabled - uncomment to reactivate)
    // if (safeParams.model !== "gptimage") {
    //     progress.updateBar(
    //         requestId,
    //         85,
    //         "Processing",
    //         "Converting to JPEG...",
    //     );
    //     processedBuffer = await convertToJpeg(processedBuffer);
    // } else {
    //     progress.updateBar(
    //         requestId,
    //         85,
    //         "Processing",
    //         "Keeping PNG format for gptimage...",
    //     );
    // }

    // Add metadata
    progress.updateBar(requestId, 90, "Processing", "Writing metadata...");
    return await writeExifMetadata(processedBuffer, metadataObj, maturity);
};

/**
 * Creates and returns images with optional logo and metadata, checking for NSFW content.
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
            throw new Error(
                "NSFW content detected. This request cannot be fulfilled when safe mode is enabled.",
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
            maturityFlags,
            safeParams,
            metadataObj,
            maturity,
            progress,
            requestId,
        );

        return { 
            buffer: processedBuffer, 
            isChild, 
            isMature,
            trackingData: result.trackingData
        };
    } catch (error) {
        logError("Error in createAndReturnImageCached:", error);
        throw error;
    }
}
