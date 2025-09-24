/**
 * Vertex AI Image Generator Integration
 * Handles the complete flow from request to image generation using Gemini
 */

import debug from "debug";
import { generateImageWithVertexAI } from "./vertexAIClient.ts";
import { writeExifMetadata } from "./writeExifMetadata.js";
import type { ImageParams } from "./params.js";
import type { ImageGenerationResult, AuthResult } from "./createAndReturnImages.js";
import { logNanoBananaError, logNanoBananaErrorsOnly, logNanoBananaPrompt } from "./utils/nanoBananaLogger.ts";
import { userStatsTracker } from "./utils/userStatsTracker.ts";
import { getOrCreateResolutionUrl } from "./utils/resolutionCache.ts";

const log = debug("pollinations:vertex-ai-generator");
const errorLog = debug("pollinations:vertex-ai-generator:error");

/**
 * Check if user is blocked from using nano-banana model
 * @param {AuthResult} userInfo - User authentication information
 * @returns {boolean} - True if user is blocked
 */
function isUserBlockedFromGemini(userInfo: AuthResult): boolean {
    const blockedUsers = process.env.BLOCKED_USERS_GEMINI?.split(',').map(u => u.trim()) || [];
    const username = userInfo?.username;
    return username ? blockedUsers.includes(username) : false;
}

/**
 * Throw blocking error for banned users
 * @param {string} username - Username of blocked user
 * @param {string} prompt - The prompt they tried to use
 * @param {ImageParams} safeParams - Parameters for image generation
 * @param {AuthResult} userInfo - User authentication information
 */
async function throwBlockingError(
    username: string,
    prompt: string,
    safeParams: ImageParams,
    userInfo: AuthResult
): Promise<never> {
    const blockError = new Error(`Sorry, you are blocked from using the nano-banana model due to content violations`);
    errorLog(`Blocked user ${username} attempted to use nano-banana model`);
    
    // Don't log administrative blocks to the violations file - only log to console/debug
    // The violations log should only contain actual Vertex AI content policy violations
    
    throw blockError;
}

/**
 * Convert number to ordinal word (1st, 2nd, 3rd, etc.)
 * @param {number} position - Position number to convert
 * @returns {string} - Ordinal word representation
 */
function getOrdinalWord(position: number): string {
    if (position < 1) {
        throw new Error(`Invalid ordinal position: ${position}. Must be 1 or greater.`);
    }

    const ordinalRules: Record<number, string> = {
        1: "first",
        2: "second",
        3: "third",
        4: "fourth",
        5: "fifth",
        6: "sixth",
        7: "seventh",
        8: "eighth",
        9: "ninth",
        10: "tenth",
        11: "eleventh"
    };

    if (position <= 11) {
        return ordinalRules[position];
    }

    // Handle numbers 11-19 (teens) - always end with "th"
    if (position >= 11 && position <= 19) {
        return `${position}th`;
    }

    // For positions > 19, determine suffix based on last digit
    const lastDigit = position % 10;

    switch (lastDigit) {
        case 1:
            return `${position}st`;
        case 2:
            return `${position}nd`;
        case 3:
            return `${position}rd`;
        default:
            return `${position}th`;
    }
}

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
 * @returns {Promise<{processedPrompt: string, processedParams: ImageParams}>} - Processed prompt and parameters
 */
async function processNanobananaRequest(
    prompt: string,
    safeParams: ImageParams
): Promise<{ processedPrompt: string, processedParams: ImageParams }> {
    // Check if this is a nanobanana request with height/width parameters
    if (safeParams.model !== "nanobanana" || !safeParams.width || !safeParams.height) {
        // Return original values for non-nanobanana models or when dimensions are missing
        return { processedPrompt: prompt, processedParams: safeParams };
    }

    log("Processing nanobanana request with height/width parameters");
    log(`Dimensions: ${safeParams.width}x${safeParams.height}`);

    try {
        // Get or create resolution URL for the specified dimensions
        const resolutionUrl = await getOrCreateResolutionUrl(safeParams.width, safeParams.height);
        log(`Obtained resolution URL: ${resolutionUrl}`);

        // Append resolution URL to image parameter array
        const updatedImageArray = [...(safeParams.image || []), resolutionUrl];
        log(`Updated image array: ${updatedImageArray.length} images`);

        // Add post-prompt after user prompt with ordinal positioning
        let postPrompt = "";
        try {
            const userImageCount = safeParams.image?.length || 0;
            const ordinalPosition = userImageCount + 1; // Resolution URL is added as last image
            const ordinalWord = getOrdinalWord(ordinalPosition);

            postPrompt = ` Redraw the content from image's onto ${ordinalWord} image , and adjust image's by adding content so that its aspect ratio matches ${ordinalWord} image. At the same time completely remove the content of ${ordinalWord} image, keeping only its aspect ratio. Make sure no blank areas are left`;
        } catch (ordinalError) {
            errorLog("Error generating ordinal word for post-prompt:", ordinalError);
            // Use fallback post-prompt without ordinal positioning
            postPrompt = " Redraw the content from image's onto last image , and adjust image's by adding content so that its aspect ratio matches last image. At the same time completely remove the content of last image, keeping only its aspect ratio. Make sure no blank areas are left";
        }

        const processedPrompt = `${prompt}${postPrompt}`;

        // Return processed values
        const processedParams = {
            ...safeParams,
            image: updatedImageArray
        };

        return { processedPrompt, processedParams };

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
    userInfo: AuthResult
): Promise<ImageGenerationResult> {
    try {
        log("Starting Vertex AI Gemini image generation");
        
        // Track user request
        userStatsTracker.recordRequest(userInfo?.username);
        
        // Log the original prompt to simple text file (before prefix)
        await logNanoBananaPrompt(prompt, safeParams, userInfo);
        
        // Check if user is blocked from using nano-banana
        if (isUserBlockedFromGemini(userInfo)) {
            await throwBlockingError(userInfo.username, prompt, safeParams, userInfo);
        }

        // Process nanobanana request with special logic if needed
        const { processedPrompt, processedParams } = await processNanobananaRequest(prompt, safeParams);

        // Add Nano Banana optimized prefix to the processed prompt
        const enhancedPrompt = addNanoBananaPrefix(processedPrompt);
        
        log("Original prompt:", prompt.substring(0, 100));
        log("Enhanced prompt:", enhancedPrompt.substring(0, 100));
        log("Parameters:", {
            width: processedParams.width,
            height: processedParams.height,
            model: processedParams.model,
            hasReferenceImages: !!(processedParams.image && processedParams.image.length > 0)
        });

        // Prepare the request with enhanced prompt
        const vertexRequest = {
            prompt: enhancedPrompt,
            width: processedParams.width,
            height: processedParams.height,
            referenceImages: processedParams.image || []
        };

        // Generate image using Vertex AI
        const result = await generateImageWithVertexAI(vertexRequest);
        
        log("Vertex AI generation successful");
        log("Result object:", JSON.stringify({
            hasImageData: !!result.imageData,
            imageDataType: typeof result.imageData,
            imageDataLength: result.imageData?.length || 0,
            mimeType: result.mimeType,
            hasTextResponse: !!result.textResponse,
            usage: result.usage
        }, null, 2));

        // Check for content policy violations in successful response
        const hasContentViolation = result.fullResponse?.candidates?.some(c => 
            c.finishReason === 'SAFETY' || 
            c.finishReason === 'PROHIBITED_CONTENT' ||
            c.finishReason === 'SPII'
        );

        if (hasContentViolation) {
            // Track violation and log as content policy violation even though request "succeeded"
            userStatsTracker.recordViolation(userInfo?.username);
            const violationError = new Error("Content policy violation detected in response");
            await logNanoBananaError(prompt, safeParams, userInfo, violationError, result.fullResponse);
            throw violationError;
        }

        // Don't log successful generations anymore - only errors
        
        if (!result.imageData) {
            errorLog("ERROR: No imageData in result from generateImageWithVertexAI - likely content policy violation");
            // Track violation for "No image data" cases (likely content policy violations)
            userStatsTracker.recordViolation(userInfo?.username);
            // Use the specialized error-only logger for "No image data" cases
            await logNanoBananaErrorsOnly(prompt, safeParams, userInfo, result.fullResponse);
            const noDataError = new Error("No image data returned from Vertex AI");
            throw noDataError;
        }

        // Convert base64 to buffer
        const imageBuffer = Buffer.from(result.imageData, 'base64');
        
        log("Converted to buffer, size:", imageBuffer.length);

        // Add EXIF metadata to the image (use original prompt, not enhanced)
        let finalImageBuffer: Buffer;
        try {
            finalImageBuffer = await writeExifMetadata(
                imageBuffer,
                {
                    prompt, // Original user prompt, not enhanced
                    model: processedParams.model,
                    width: processedParams.width,
                    height: processedParams.height,
                },
                {
                    generator: "Vertex AI Gemini 2.5 Flash Image Preview",
                    textResponse: result.textResponse,
                    usage: result.usage
                }
            );
            log("EXIF metadata added successfully");
        } catch (exifError) {
            errorLog("Failed to add EXIF metadata, using original image:", exifError);
            finalImageBuffer = imageBuffer;
        }

        // Return in the expected ImageGenerationResult format
        return {
            buffer: finalImageBuffer,
            isMature: false, // Gemini has built-in safety, assume safe
            isChild: false   // Gemini has built-in safety, assume not child content
        };

    } catch (error) {
        errorLog("Error in callVertexAIGemini:", error);
        
        // Extract response data from error if available
        const errorResponseData = (error as any).responseData || null;
        
        // Log error for analysis (especially content policy violations) - use original prompt
        await logNanoBananaError(prompt, processedParams, userInfo, error, errorResponseData);
        
        throw new Error(`Vertex AI Gemini image generation failed: ${error.message}`);
    }
}
