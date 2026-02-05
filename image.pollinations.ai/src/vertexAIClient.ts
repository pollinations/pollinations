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
    model?: string; // Model ID: gemini-2.5-flash-image-preview (default) or gemini-3-pro-image-preview
    imageSize?: string; // "1K", "2K", "4K" - only supported by gemini-3-pro-image-preview
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
    };
}

/**
 * Generate image using Gemini 2.5 Flash Image Preview via direct Vertex AI API
 */
export async function generateImageWithVertexAI(
    request: VertexAIImageRequest,
): Promise<{
    imageData: string | null;
    mimeType: string | null;
    textResponse?: string;
    finishReason?: string;
    safetyRatings?: any[];
    usage: any;
    fullResponse?: any;
}> {
    try {
        log(
            "Starting Vertex AI image generation for prompt:",
            request.prompt.substring(0, 100),
        );

        // Get Google Cloud access token
        const accessToken = await googleCloudAuth.getAccessToken();
        if (!accessToken) {
            throw new Error("Failed to get Google Cloud access token");
        }

        // Build the API endpoint
        const projectId = process.env.GOOGLE_PROJECT_ID;
        if (!projectId) {
            throw new Error("GOOGLE_PROJECT_ID environment variable not set");
        }

        // Use provided model or default to gemini-2.5-flash-image-preview (Nano Banana)
        const modelId = request.model || "gemini-2.5-flash-image-preview";
        const endpoint = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/global/publishers/google/models/${modelId}:generateContent`;

        log("Using endpoint:", endpoint);

        // Calculate aspect ratio from width/height if provided
        let aspectRatio: string | undefined;
        if (request.width && request.height) {
            // Find the closest standard aspect ratio
            const ratio = request.width / request.height;
            const standardRatios: { [key: string]: number } = {
                "1:1": 1,
                "16:9": 16 / 9,
                "9:16": 9 / 16,
                "4:3": 4 / 3,
                "3:4": 3 / 4,
                "3:2": 3 / 2,
                "2:3": 2 / 3,
                "21:9": 21 / 9,
                "4:5": 4 / 5,
                "5:4": 5 / 4,
            };

            let closestRatio = "1:1";
            let minDiff = Math.abs(ratio - 1);

            for (const [name, value] of Object.entries(standardRatios)) {
                const diff = Math.abs(ratio - value);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestRatio = name;
                }
            }
            aspectRatio = closestRatio;
            log(
                `Calculated aspect ratio: ${aspectRatio} from ${request.width}x${request.height}`,
            );
        }

        // Determine image size for nanobanana-pro based on pixel count
        // Only gemini-3-pro-image-preview supports imageSize parameter
        let imageSize: string | undefined;
        if (
            modelId === "gemini-3-pro-image-preview" &&
            request.width &&
            request.height
        ) {
            const totalPixels = request.width * request.height;
            // Pick closest resolution tier based on pixel count
            const tiers = [
                { name: "1K", pixels: 1024 * 1024 }, // ~1.0M
                { name: "2K", pixels: 1920 * 1080 }, // ~2.1M
                { name: "4K", pixels: 3840 * 2160 }, // ~8.3M
            ];
            imageSize = tiers.reduce((closest, tier) =>
                Math.abs(tier.pixels - totalPixels) <
                Math.abs(closest.pixels - totalPixels)
                    ? tier
                    : closest,
            ).name;
            log(
                `Determined image size: ${imageSize} for ${totalPixels} total pixels`,
            );
        }
        // Also use explicit imageSize if provided in request
        if (request.imageSize) {
            imageSize = request.imageSize;
            log(`Using explicit image size from request: ${imageSize}`);
        }

        // Build imageConfig if we have aspect ratio or image size
        const imageConfig: { aspectRatio?: string; imageSize?: string } = {};
        if (aspectRatio) imageConfig.aspectRatio = aspectRatio;
        if (imageSize) imageConfig.imageSize = imageSize;

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
                imageConfig?: { aspectRatio?: string; imageSize?: string };
            };
        } = {
            contents: [
                {
                    role: "user",
                    parts: [
                        {
                            text: request.prompt,
                        },
                    ],
                },
            ],
            generation_config: {
                response_modalities: ["TEXT", "IMAGE"],
                temperature: 0.7,
                top_p: 0.9,
                max_output_tokens: 2048,
                ...(Object.keys(imageConfig).length > 0 && { imageConfig }),
            },
        };

        log(
            "Generation config:",
            JSON.stringify(requestBody.generation_config, null, 2),
        );

        // Add reference images if provided (all images are already processed as base64 data)
        if (request.referenceImages && request.referenceImages.length > 0) {
            log("Adding reference images:", request.referenceImages.length);

            try {
                // Process all reference images (already converted to base64 by vertexAIImageGenerator)
                for (let i = 0; i < request.referenceImages.length; i++) {
                    const imageData = request.referenceImages[i];

                    log(
                        `Adding processed image ${i + 1}/${request.referenceImages.length}: ${imageData.mimeType}, ${imageData.base64.length} chars`,
                    );

                    // Add the image as inlineData to the request
                    requestBody.contents[0].parts.push({
                        inlineData: {
                            mimeType: imageData.mimeType,
                            data: imageData.base64,
                        },
                    });
                }

                log(
                    `Successfully added ${requestBody.contents[0].parts.length - 1} reference images to request`,
                );
            } catch (error) {
                errorLog("Error processing reference images:", error);
                // Add a text fallback if image processing fails
                requestBody.contents[0].parts.unshift({
                    text: `Reference images were provided but could not be processed. Please generate the image without reference images.`,
                });
            }
        }

        log("Making request to Vertex AI API...");

        // Make the API request without artificial timeout
        // Let the underlying fetch timeout handle it naturally
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            errorLog(
                "Vertex AI API error:",
                response.status,
                response.statusText,
                errorText,
            );

            // Try to parse error response for content policy violations
            let errorData = null;
            try {
                errorData = JSON.parse(errorText);
            } catch (parseError) {
                // Ignore parse errors, use raw text
            }

            const error = new Error(
                `Vertex AI API error: ${response.status} ${response.statusText} - ${errorText}`,
            );
            // Attach error response data for logging
            (error as any).responseData = errorData;
            (error as any).statusCode = response.status;
            throw error;
        }

        const data = (await response.json()) as VertexAIResponse;
        log("Received response from Vertex AI");

        // Log response metadata without sensitive image data
        const sanitizedData = {
            candidates: data.candidates?.map((candidate) => ({
                finishReason: candidate.finishReason,
                contentPartsCount: candidate.content?.parts?.length || 0,
                hasImageData:
                    candidate.content?.parts?.some((part) => part.inlineData) ||
                    false,
            })),
            usageMetadata: data.usageMetadata,
        };
        log("Response metadata:", JSON.stringify(sanitizedData, null, 2));

        // Extract image data, text response, and safety information
        let imageData: string | null = null;
        let mimeType: string | null = null;
        let textResponse: string | null = null;
        let finishReason: string | undefined = undefined;
        let safetyRatings: any[] | undefined = undefined;

        log("Response structure check:");
        log("- data.candidates exists:", !!data.candidates);
        log("- candidates length:", data.candidates?.length || 0);

        if (data.candidates && data.candidates.length > 0) {
            const candidate = data.candidates[0];

            // Extract finish reason and safety ratings for error reporting
            finishReason = candidate.finishReason;
            safetyRatings = (candidate as any).safetyRatings;

            log("- candidate.content exists:", !!candidate.content);
            log(
                "- candidate.content.parts exists:",
                !!candidate.content?.parts,
            );
            log("- parts length:", candidate.content?.parts?.length || 0);
            log("- finishReason:", finishReason);

            // Check if content and parts exist before iterating
            // When safety blocks content, candidate.content or parts may be undefined
            if (candidate.content?.parts) {
                for (const part of candidate.content.parts) {
                    if (part.inlineData) {
                        imageData = part.inlineData.data;
                        mimeType = part.inlineData.mimeType;
                        log(
                            "Found image data:",
                            mimeType,
                            "size:",
                            imageData.length,
                        );
                    } else if (part.text) {
                        textResponse = part.text;
                        log(
                            "Found text response:",
                            part.text.substring(0, 100),
                        );
                    } else {
                        log(
                            "Part has no inlineData or text:",
                            Object.keys(part),
                        );
                    }
                }
            } else {
                log(
                    "No content.parts available - likely blocked by safety filters",
                );
            }
        } else {
            log("No candidates found in response");
        }

        if (!imageData || !mimeType) {
            errorLog("No image data found in response");
            // Return all available information even without image data
            // This allows the caller to provide informative error messages
            return {
                imageData: null,
                mimeType: null,
                textResponse: textResponse || undefined,
                finishReason: finishReason,
                safetyRatings: safetyRatings,
                usage: data.usageMetadata,
                fullResponse: data,
            };
        }

        log("Successfully generated image via Vertex AI");

        return {
            imageData,
            mimeType,
            textResponse: textResponse || undefined,
            usage: data.usageMetadata,
            // Include full response for logging purposes
            fullResponse: data,
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
            prompt: "A simple test image of a banana",
        });

        if (!result.imageData) {
            log(
                "Test completed but no image generated (possibly blocked by safety)",
            );
            return false;
        }
        log(
            "Test successful - generated image:",
            result.mimeType,
            "size:",
            result.imageData.length,
        );
        return true;
    } catch (error) {
        errorLog("Test failed:", error);
        return false;
    }
}
