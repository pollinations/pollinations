/**
 * Vertex AI Image Generator Integration
 * Handles the complete flow from request to image generation using Gemini
 */

import debug from "debug";
import { generateImageWithVertexAI } from "./vertexAIClient.ts";
import { writeExifMetadata } from "./writeExifMetadata.js";
import type { ImageParams } from "./params.js";
import type { ImageGenerationResult } from "./createAndReturnImages.js";

const log = debug("pollinations:vertex-ai-generator");
const errorLog = debug("pollinations:vertex-ai-generator:error");

/**
 * Generate image using Vertex AI Gemini and return formatted response
 */
export async function callVertexAIGemini(
    prompt: string,
    safeParams: ImageParams,
    userInfo: any
): Promise<ImageGenerationResult> {
    try {
        log("Starting Vertex AI Gemini image generation");
        log("Prompt:", prompt.substring(0, 100));
        log("Parameters:", {
            width: safeParams.width,
            height: safeParams.height,
            model: safeParams.model,
            hasReferenceImages: !!(safeParams.image && safeParams.image.length > 0)
        });

        // Prepare the request
        const vertexRequest = {
            prompt,
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
        
        if (!result.imageData) {
            errorLog("ERROR: No imageData in result from generateImageWithVertexAI");
            throw new Error("No image data returned from Vertex AI");
        }

        // Convert base64 to buffer
        const imageBuffer = Buffer.from(result.imageData, 'base64');
        
        log("Converted to buffer, size:", imageBuffer.length);

        // Add EXIF metadata to the image
        let finalImageBuffer: Buffer;
        try {
            finalImageBuffer = await writeExifMetadata(
                imageBuffer, 
                {
                    prompt,
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
        throw new Error(`Vertex AI Gemini image generation failed: ${error.message}`);
    }
}
