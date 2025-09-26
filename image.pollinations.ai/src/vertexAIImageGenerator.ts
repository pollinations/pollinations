/**
 * Vertex AI Image Generator Integration
 * Handles the complete flow from request to image generation using Gemini
 */

import debug from "debug";
import fetch from "node-fetch";
import { generateImageWithVertexAI } from "./vertexAIClient.ts";
import { writeExifMetadata } from "./writeExifMetadata.js";
import type { ImageParams } from "./params.js";
import type { ImageGenerationResult, AuthResult } from "./createAndReturnImages.js";
import { logNanoBananaError, logNanoBananaErrorsOnly, logNanoBananaPrompt } from "./utils/nanoBananaLogger.ts";
import { userStatsTracker } from "./utils/userStatsTracker.ts";
import { generateTransparentImage } from "./utils/transparentImage.ts";
import type { VertexAIImageData } from "./vertexAIClient.ts";

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
    return `Generate an image but only if the prompt and input images are safe. Else return an error: ${userPrompt}`;
}


/**
 * Process nanobanana requests with special logic for height/width parameters
 * @param {string} prompt - Original user prompt
 * @param {ImageParams} safeParams - Parameters for image generation
 * @returns {Promise<{processedPrompt: string, processedParams: ImageParams, transparentImage?: VertexAIImageData}>} - Processed prompt, parameters, and optional transparent image
 */
async function processNanobananaRequest(
    prompt: string,
    safeParams: ImageParams
): Promise<{ processedPrompt: string, processedParams: ImageParams, transparentImage?: VertexAIImageData }> {
    // Check if this is a nanobanana request with height/width parameters
    if (safeParams.model !== "nanobanana" || !safeParams.width || !safeParams.height) {
        // Return original values for non-nanobanana models or when dimensions are missing
        return { processedPrompt: prompt, processedParams: safeParams };
    }

    // Skip transparent image generation for 1:1 aspect ratio (default behavior works fine)
    const aspectRatio = safeParams.width / safeParams.height;
    if (Math.abs(aspectRatio - 1.0) < 0.001) { // Use small epsilon for floating point comparison
        log(`Skipping transparent image generation for 1:1 aspect ratio (${safeParams.width}x${safeParams.height})`);
        return { processedPrompt: prompt, processedParams: safeParams };
    }

    log("Processing nanobanana request with height/width parameters");
    log(`Dimensions: ${safeParams.width}x${safeParams.height}, aspect ratio: ${aspectRatio.toFixed(3)}`);

    try {
        // Generate transparent image for the specified dimensions
        const transparentImage = await generateTransparentImage(safeParams.width, safeParams.height);
        log(`Generated transparent image: ${transparentImage.base64.length} base64 chars`);

        // Add post-prompt after user prompt
        const postPrompt = " The last image defines the aspect ratio. Generate the content to match that aspect ratio, completely replacing the last image while keeping its dimensions. Make sure no blank areas are left";

        const processedPrompt = `${prompt}${postPrompt}`;

        return { processedPrompt, processedParams: safeParams, transparentImage };

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
        const { processedPrompt, processedParams, transparentImage: generatedTransparentImage } = await processNanobananaRequest(prompt, safeParams);

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

        // Process all reference images (URLs + transparent image) into base64 format
        const processedImages: any[] = [];
        
        // Process URL-based reference images
        if (processedParams.image && processedParams.image.length > 0) {
            log(`Processing ${processedParams.image.length} reference image URLs`);
            
            for (let i = 0; i < processedParams.image.length; i++) {
                const imageUrl = processedParams.image[i];
                try {
                    log(`Fetching reference image ${i + 1}/${processedParams.image.length}: ${imageUrl}`);
                    
                    const imageResponse = await fetch(imageUrl, {
                        headers: { 'User-Agent': 'Pollinations/1.0' }
                    });
                    
                    if (!imageResponse.ok) {
                        errorLog(`Failed to fetch reference image ${i + 1}: ${imageResponse.status} ${imageResponse.statusText}`);
                        continue; // Skip this image but continue with others
                    }
                    
                    const imageBuffer = await imageResponse.arrayBuffer();
                    const base64Data = Buffer.from(imageBuffer).toString('base64');
                    
                    // Determine MIME type from response headers or URL
                    let mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';
                    if (!mimeType.startsWith('image/')) {
                        // Fallback based on URL extension
                        const urlLower = imageUrl.toLowerCase();
                        if (urlLower.includes('.png')) mimeType = 'image/png';
                        else if (urlLower.includes('.webp')) mimeType = 'image/webp';
                        else if (urlLower.includes('.gif')) mimeType = 'image/gif';
                        else mimeType = 'image/jpeg'; // Default fallback
                    }
                    
                    processedImages.push({
                        base64: base64Data,
                        mimeType: mimeType
                    });
                    
                    log(`Successfully processed reference image ${i + 1}: ${mimeType}, ${base64Data.length} chars`);
                } catch (error) {
                    errorLog(`Error processing reference image ${i + 1}:`, error);
                    // Continue with other images
                }
            }
        }
        
        // Add transparent image if it was generated for nanobanana
        if (generatedTransparentImage) {
            processedImages.push({
                base64: generatedTransparentImage.base64,
                mimeType: generatedTransparentImage.mimeType
            });
            log(`Added transparent image to processed images. Total images: ${processedImages.length}`);
        }
        
        const vertexRequest = {
            prompt: enhancedPrompt,
            width: processedParams.width,
            height: processedParams.height,
            referenceImages: processedImages
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
            isChild: false,  // Gemini has built-in safety, assume not child content
            // Include tracking data for enter service headers
            trackingData: {
                actualModel: 'nanobanana',
                usage: result.usage // Vertex AI usage metadata
            }
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
