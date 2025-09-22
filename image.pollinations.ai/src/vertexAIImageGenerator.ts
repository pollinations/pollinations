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
 * Add simple prefix to help Nano Banana understand the prompt better
 * @param {string} userPrompt - Original user prompt
 * @returns {string} - Enhanced prompt with prefix
 */
function addNanoBananaPrefix(userPrompt: string): string {
    // Simple prefix to help Nano Banana interpret prompts as image generation requests
    return `Create a detailed image: ${userPrompt}`;
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
        
        // Add Nano Banana optimized prefix to the prompt
        const enhancedPrompt = addNanoBananaPrefix(prompt);
        
        log("Original prompt:", prompt.substring(0, 100));
        log("Enhanced prompt:", enhancedPrompt.substring(0, 100));
        log("Parameters:", {
            width: safeParams.width,
            height: safeParams.height,
            model: safeParams.model,
            hasReferenceImages: !!(safeParams.image && safeParams.image.length > 0)
        });

        // Prepare the request with enhanced prompt
        const vertexRequest = {
            prompt: enhancedPrompt,
            width: safeParams.width,
            height: safeParams.height,
            referenceImages: safeParams.image || []
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
                    model: safeParams.model,
                    width: safeParams.width,
                    height: safeParams.height,
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
        await logNanoBananaError(prompt, safeParams, userInfo, error, errorResponseData);
        
        throw new Error(`Vertex AI Gemini image generation failed: ${error.message}`);
    }
}
