import debug from "debug";
import { withTimeoutSignal } from "../util.ts";
import type { ImageParams } from "../params.ts";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import type { ProgressManager } from "../progressBar.ts";
import { callKontextAPI } from "./kontextModel.ts";

// Logger
const logOps = debug("pollinations:bpaigen:ops");
const logError = debug("pollinations:bpaigen:error");

interface BPAIGenJobResponse {
    job_id: string;
    status?: string;
    message?: string;
}

interface BPAIGenStatusResponse {
    status: "processing" | "done" | "failed";
    result?: string[];
    error?: string;
}

/**
 * Calls BPAIGen API with Kontext fallback for reliable image generation
 * @param {string} prompt - The prompt for image generation
 * @param {Object} safeParams - The parameters for image generation
 * @param {ProgressManager} progress - Progress manager for updates
 * @param {string} requestId - Request ID for progress tracking
 * @returns {Promise<ImageGenerationResult>}
 */
export const callBPAIGenWithKontextFallback = async (
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<ImageGenerationResult> => {
    // Primary: Try BPAIGen API first
    try {
        progress.updateBar(requestId, 30, "Processing", "Generating with BPAIGen...");
        return await callBPAIGenAPI(prompt, safeParams, progress, requestId);
    } catch (bpaigenError) {
        logError("BPAIGen failed, falling back to Kontext:", bpaigenError.message);
        
        // Fallback: Use Kontext if BPAIGen fails
        progress.updateBar(requestId, 40, "Fallback", "BPAIGen failed, trying Kontext...");
        try {
            const result = await callKontextAPI(prompt, safeParams);
            progress.updateBar(requestId, 90, "Success", "Generated with Kontext fallback");
            return result;
        } catch (kontextError) {
            logError("Both BPAIGen and Kontext failed:", { bpaigenError: bpaigenError.message, kontextError: kontextError.message });
            // Both failed - throw combined error
            throw new Error(`Both services failed. BPAIGen: ${bpaigenError.message}, Kontext: ${kontextError.message}`);
        }
    }
};

/**
 * Calls the BPAIGen API for image generation
 * @param {string} prompt - The prompt for image generation
 * @param {Object} safeParams - The parameters for image generation
 * @param {ProgressManager} progress - Progress manager for updates
 * @param {string} requestId - Request ID for progress tracking
 * @returns {Promise<ImageGenerationResult>}
 */
const callBPAIGenAPI = async (
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<ImageGenerationResult> => {
    try {
        logOps("Calling BPAIGen API with prompt:", prompt);

        const baseUrl = process.env.BPAIGEN_API_URL || "https://bpaigen.com";
        const password = process.env.BPAIGEN_PASSWORD;

        if (!password) {
            throw new Error("BPAIGEN_PASSWORD environment variable is required");
        }

        // Prepare form data for job submission
        const formData = new FormData();
        formData.append("prompt", prompt);
        formData.append("password", password);
        formData.append("width", safeParams.width.toString());
        formData.append("height", safeParams.height.toString());
        formData.append("upscale_value", "2"); // Default 2x upscaling
        
        // Add guidance scale if provided
        if (safeParams.guidance_scale) {
            formData.append("guidance_scale", safeParams.guidance_scale.toString());
        }

        // Handle input image if provided (image-to-image)
        if (safeParams.image && safeParams.image.length > 0) {
            try {
                const imageUrl = safeParams.image[0]; // Use first image from array
                
                // Check if it's a base64 image or URL
                if (imageUrl.startsWith('data:image/')) {
                    // Base64 image - convert to blob
                    const response = await fetch(imageUrl);
                    const imageBlob = await response.blob();
                    formData.append("image", imageBlob, "input.jpg");
                    logOps("Added base64 input image to BPAIGen API request");
                } else {
                    // URL - download and add
                    const imageResponse = await fetch(imageUrl);
                    if (imageResponse.ok) {
                        const imageBlob = await imageResponse.blob();
                        formData.append("image", imageBlob, "input.jpg");
                        logOps("Added input image to BPAIGen API request:", imageUrl);
                    } else {
                        logError("Failed to fetch input image:", imageUrl, imageResponse.status);
                        throw new Error(`Failed to fetch input image: ${imageResponse.status}`);
                    }
                }
            } catch (error) {
                logError("Error processing input image for BPAIGen:", error.message);
                throw new Error(`Image processing failed: ${error.message}`);
            }
        }

        // Submit job to BPAIGen
        progress.updateBar(requestId, 35, "Submitting", "Submitting job to BPAIGen...");
        
        const submitResponse = await withTimeoutSignal(
            (signal) =>
                fetch(`${baseUrl}/generate`, {
                    method: "POST",
                    body: formData,
                    signal,
                }),
            30000, // 30 second timeout for job submission
        );

        if (!submitResponse.ok) {
            const errorText = await submitResponse.text();
            throw new Error(`BPAIGen job submission failed: ${submitResponse.status} ${submitResponse.statusText} - ${errorText}`);
        }

        const jobResponse: BPAIGenJobResponse = await submitResponse.json();
        
        if (!jobResponse.job_id) {
            throw new Error(`BPAIGen job submission failed: No job_id received - ${jobResponse.message || 'Unknown error'}`);
        }

        logOps("BPAIGen job submitted successfully, job_id:", jobResponse.job_id);

        // Poll for job completion
        return await pollBPAIGenJob(baseUrl, jobResponse.job_id, progress, requestId);

    } catch (error) {
        logError("Error calling BPAIGen API:", error);
        throw new Error(`BPAIGen API generation failed: ${error.message}`);
    }
};

/**
 * Polls BPAIGen job status until completion
 * @param {string} baseUrl - BPAIGen base URL
 * @param {string} jobId - Job ID to poll
 * @param {ProgressManager} progress - Progress manager for updates
 * @param {string} requestId - Request ID for progress tracking
 * @returns {Promise<ImageGenerationResult>}
 */
const pollBPAIGenJob = async (
    baseUrl: string,
    jobId: string,
    progress: ProgressManager,
    requestId: string,
): Promise<ImageGenerationResult> => {
    const maxPolls = 30; // 30 polls = 1 minute max (faster fallback)
    const pollInterval = 2000; // 2 seconds between polls
    
    for (let poll = 0; poll < maxPolls; poll++) {
        try {
            // Update progress
            const progressPercent = 40 + (poll / maxPolls) * 40; // 40-80% during polling
            progress.updateBar(requestId, progressPercent, "Processing", `BPAIGen processing... (${poll + 1}/${maxPolls})`);

            const statusResponse = await withTimeoutSignal(
                (signal) =>
                    fetch(`${baseUrl}/job_status?job_id=${jobId}`, {
                        method: "GET",
                        signal,
                    }),
                10000, // 10 second timeout for status checks
            );

            if (!statusResponse.ok) {
                throw new Error(`Status check failed: ${statusResponse.status} ${statusResponse.statusText}`);
            }

            const statusData: BPAIGenStatusResponse = await statusResponse.json();
            logOps(`BPAIGen job ${jobId} status:`, statusData.status);

            if (statusData.status === "done") {
                if (!statusData.result || statusData.result.length === 0) {
                    throw new Error("Job completed but no result images received");
                }

                // Get the first result image (base64)
                const base64Image = statusData.result[0];
                
                // Convert base64 to buffer
                const buffer = Buffer.from(base64Image, 'base64');
                
                logOps("BPAIGen job completed successfully, buffer size:", buffer.length);
                progress.updateBar(requestId, 90, "Success", "BPAIGen generation completed");

                return {
                    buffer,
                    isMature: false,
                    isChild: false,
                };
            } else if (statusData.status === "failed") {
                throw new Error(`BPAIGen job failed: ${statusData.error || 'Unknown error'}`);
            }

            // Job still processing, wait before next poll
            if (poll < maxPolls - 1) {
                await new Promise(resolve => setTimeout(resolve, pollInterval));
            }

        } catch (error) {
            logError(`Error polling BPAIGen job ${jobId} (poll ${poll + 1}):`, error.message);
            
            // If this is not the last poll, continue trying
            if (poll < maxPolls - 1) {
                await new Promise(resolve => setTimeout(resolve, pollInterval));
                continue;
            }
            
            // Last poll failed, throw error
            throw new Error(`Job polling failed after ${maxPolls} attempts: ${error.message}`);
        }
    }

    // Timeout reached
    throw new Error(`BPAIGen job ${jobId} timed out after ${maxPolls} polls (${maxPolls * pollInterval / 1000} seconds)`);
};
