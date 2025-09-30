/**
 * Vertex AI Client for Gemini Image Generation
 * Direct integration with Google Vertex AI API bypassing Portkey issues
 */

import fetch from "node-fetch";
import debug from "debug";
import googleCloudAuth from "../auth/googleCloudAuth.ts";

const log = debug("pollinations:vertex-ai");
const errorLog = debug("pollinations:vertex-ai:error");

export interface VertexAIImageData {
    base64: string;
    mimeType: string;
}

export interface VertexAIImageRequest {
    prompt: string;
    width?: number;
    height?: number;
    referenceImages?: VertexAIImageData[];
}

export interface VertexAIPart {
    text?: string;
    inlineData?: {
        mimeType: string;
        data: string;
    };
}

export interface VertexAIResponse {
    candidates: Array<{
        content: {
            parts: Array<VertexAIPart>;
        };
        finishReason: string;
    }>;
    usageMetadata: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
        candidatesTokensDetails: Array<{
            modality: string;
            tokenCount: number;
        }>;
    };
}

/**
 * Generate image using Gemini 2.5 Flash Image Preview via direct Vertex AI API
 */
export async function generateImageWithVertexAI(
    request: VertexAIImageRequest
): Promise<{ imageData: string; mimeType: string; textResponse?: string; usage: any; fullResponse?: any }> {
    try {
        log("Starting Vertex AI image generation for prompt:", request.prompt.substring(0, 100));

        // Get Google Cloud access token
        const accessToken = await googleCloudAuth.getAccessToken();
        if (!accessToken) {
            throw new Error("Failed to get Google Cloud access token");
        }

        // Build the API endpoint
        const projectId = process.env.GCLOUD_PROJECT_ID;
        if (!projectId) {
            throw new Error("GCLOUD_PROJECT_ID environment variable not set");
        }

        const endpoint = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/global/publishers/google/models/gemini-2.5-flash-image-preview:generateContent`;
        
        log("Using endpoint:", endpoint);

        // Build the request body in Vertex AI format
        const requestBody: {
            contents: Array<{
                role: string;
                parts: Array<VertexAIPart>;
            }>;
            generation_config: {
                response_modalities: string[];
                temperature: number;
                top_p: number;
                max_output_tokens: number;
            };
        } = {
            contents: [
                {
                    role: "user",
                    parts: [
                        {
                            text: request.prompt
                        }
                    ]
                }
            ],
            generation_config: {
                response_modalities: ["TEXT", "IMAGE"],
                temperature: 0.7,
                top_p: 0.9,
                max_output_tokens: 2048
            }
        };

        // Add reference images if provided (all images are already processed as base64 data)
        if (request.referenceImages && request.referenceImages.length > 0) {
            log("Adding reference images:", request.referenceImages.length);
            
            try {
                // Process all reference images (already converted to base64 by vertexAIImageGenerator)
                for (let i = 0; i < request.referenceImages.length; i++) {
                    const imageData = request.referenceImages[i];
                    
                    log(`Adding processed image ${i + 1}/${request.referenceImages.length}: ${imageData.mimeType}, ${imageData.base64.length} chars`);
                    
                    // Add the image as inlineData to the request
                    requestBody.contents[0].parts.push({
                        inlineData: {
                            mimeType: imageData.mimeType,
                            data: imageData.base64
                        }
                    });
                }
                
                log(`Successfully added ${requestBody.contents[0].parts.length - 1} reference images to request`);
            } catch (error) {
                errorLog("Error processing reference images:", error);
                // Add a text fallback if image processing fails
                requestBody.contents[0].parts.unshift({
                    text: `Reference images were provided but could not be processed. Please generate the image without reference images.`
                });
            }
        }

        log("Making request to Vertex AI API...");

        // Create a timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error("Vertex AI request timed out after 25 seconds"));
            }, 25000); // 25 seconds timeout
        });

        // Make the API request with timeout
        const fetchPromise = fetch(endpoint, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
        });

        const response = await Promise.race([fetchPromise, timeoutPromise]);

        if (!response.ok) {
            const errorText = await response.text();
            errorLog("Vertex AI API error:", response.status, response.statusText, errorText);
            
            // Try to parse error response for content policy violations
            let errorData = null;
            try {
                errorData = JSON.parse(errorText);
            } catch (parseError) {
                // Ignore parse errors, use raw text
            }
            
            const error = new Error(`Vertex AI API error: ${response.status} ${response.statusText} - ${errorText}`);
            // Attach error response data for logging
            (error as any).responseData = errorData;
            (error as any).statusCode = response.status;
            throw error;
        }

        const data = await response.json() as VertexAIResponse;
        log("Received response from Vertex AI");
        
        // Log complete response structure for debugging
        log("Full response structure:", JSON.stringify(data, null, 2));
        
        // Log response metadata without sensitive image data
        const sanitizedData = {
            candidates: data.candidates?.map(candidate => ({
                finishReason: candidate.finishReason,
                contentPartsCount: candidate.content?.parts?.length || 0,
                hasImageData: candidate.content?.parts?.some(part => part.inlineData) || false
            })),
            usageMetadata: data.usageMetadata
        };
        log("Response metadata:", JSON.stringify(sanitizedData, null, 2));

        // Extract image data and text response
        let imageData: string | null = null;
        let mimeType: string | null = null;
        let textResponse: string | null = null;

        log("Response structure check:");
        log("- data.candidates exists:", !!data.candidates);
        log("- candidates length:", data.candidates?.length || 0);

        if (data.candidates && data.candidates.length > 0) {
            const candidate = data.candidates[0];
            log("First candidate:", JSON.stringify(candidate, null, 2));
            
            log("- candidate.content exists:", !!candidate.content);
            log("- candidate.content.parts exists:", !!candidate.content?.parts);
            log("- parts length:", candidate.content?.parts?.length || 0);
            
            for (const part of candidate.content.parts) {
                log("Processing part:", JSON.stringify(part, null, 2));
                if (part.inlineData) {
                    imageData = part.inlineData.data;
                    mimeType = part.inlineData.mimeType;
                    log("Found image data:", mimeType, "size:", imageData.length);
                } else if (part.text) {
                    textResponse = part.text;
                    log("Found text response:", part.text.substring(0, 100));
                } else {
                    log("Part has no inlineData or text:", Object.keys(part));
                }
            }
        } else {
            log("No candidates found in response");
        }

        if (!imageData || !mimeType) {
            errorLog("No image data found in response");
            throw new Error("No image data returned from Vertex AI");
        }

        log("Successfully generated image via Vertex AI");
        
        return {
            imageData,
            mimeType,
            textResponse: textResponse || undefined,
            usage: data.usageMetadata,
            // Include full response for logging purposes
            fullResponse: data
        };

    } catch (error) {
        errorLog("Error in generateImageWithVertexAI:", error);
        throw error;
    }
}

/**
 * Test function to verify Vertex AI integration
 */
export async function testVertexAIConnection(): Promise<boolean> {
    try {
        log("Testing Vertex AI connection...");
        
        const result = await generateImageWithVertexAI({
            prompt: "A simple test image of a banana"
        });
        
        log("Test successful - generated image:", result.mimeType, "size:", result.imageData.length);
        return true;
    } catch (error) {
        errorLog("Test failed:", error);
        return false;
    }
}
