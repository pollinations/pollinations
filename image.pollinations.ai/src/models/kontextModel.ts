import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import type { ImageParams } from "../params.ts";
import { withTimeoutSignal } from "../util.ts";

// Logger
const logOps = debug("pollinations:kontext:ops");
const logError = debug("pollinations:kontext:error");

/**
 * Calls the external Flux Kontext API to generate images
 * @param {string} prompt - The prompt for image generation
 * @param {Object} safeParams - The parameters for image generation
 * @returns {Promise<{buffer: Buffer, isMature: boolean, isChild: boolean}>}
 */
export const callKontextAPI = async (
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> => {
    try {
        logOps("Calling Kontext API with prompt:", prompt);

        const formData = new FormData();
        formData.append("prompt", prompt);
        formData.append("guidance_scale", "2.5");
        formData.append("num_inference_steps", "17"); // Hard-coded for consistent performance
        formData.append("width", safeParams.width.toString());
        formData.append("height", safeParams.height.toString());

        // If there's an image in safeParams (array format), download and add it to the form data
        if (safeParams.image && safeParams.image.length > 0) {
            try {
                const imageUrl = safeParams.image[0]; // Use first image from array
                const imageResponse = await fetch(imageUrl);
                if (imageResponse.ok) {
                    const imageBlob = await imageResponse.blob();
                    formData.append("image", imageBlob, "jpg");
                    logOps(
                        "Added input image to Kontext API request:",
                        imageUrl,
                    );
                } else {
                    logError(
                        "Failed to fetch input image:",
                        imageUrl,
                        imageResponse.status,
                    );
                }
            } catch (error) {
                logError("Error processing input image:", error.message);
                // Continue without image if there's an error
            }
        }

        const headers = {};

        // Add Bearer token if SCALEWAY_KONTEXT_KEY is available
        if (process.env.SCALEWAY_KONTEXT_KEY) {
            headers["Authorization"] =
                `Bearer ${process.env.SCALEWAY_KONTEXT_KEY}`;
        }

        const response = await withTimeoutSignal(
            (signal) =>
                fetch("http://51.159.184.240:8000/generate", {
                    method: "POST",
                    headers,
                    body: formData,
                    signal,
                }),
            120000, // 2 minute timeout
        );

        if (!response.ok) {
            throw new Error(
                `Kontext API error: ${response.status} ${response.statusText}`,
            );
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        logOps("Kontext API response received, buffer size:", buffer.length);

        // Return with default maturity flags (assuming generated art is safe)
        return {
            buffer,
            isMature: false,
            isChild: false,
            trackingData: {
                actualModel: "kontext",
                usage: {
                    completionImageTokens: 1,
                    totalTokenCount: 1,
                },
            },
        };
    } catch (error) {
        logError("Error calling Kontext API:", error);
        throw new Error(`Kontext API generation failed: ${error.message}`);
    }
};
