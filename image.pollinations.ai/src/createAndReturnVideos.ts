/**
 * Video generation handler for Pollinations
 * Separate from image logic - no logo processing, no JPEG conversion, no EXIF metadata
 */

import debug from "debug";
import type { ImageParams } from "./params.ts";
import type { ProgressManager } from "./progressBar.ts";
import {
    callVeoAPI,
    type VideoGenerationResult,
} from "./models/veoVideoModel.ts";
import { callSeedanceAPI } from "./models/seedanceVideoModel.ts";
export type { VideoGenerationResult };
import { incrementModelCounter } from "./modelCounter.ts";

const logOps = debug("pollinations:video:ops");
const logError = debug("pollinations:video:error");

/**
 * Creates and returns video content using the appropriate model
 * @param {string} prompt - The prompt for video generation
 * @param {ImageParams} safeParams - Parameters for video generation
 * @param {ProgressManager} progress - Progress tracking object
 * @param {string} requestId - Request ID for progress tracking
 * @returns {Promise<VideoGenerationResult>}
 */
export async function createAndReturnVideo(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<VideoGenerationResult> {
    try {
        logOps("Starting video generation:", {
            prompt,
            model: safeParams.model,
        });

        // Log model usage
        incrementModelCounter(safeParams.model).catch(() => {});

        // Update progress
        progress.updateBar(
            requestId,
            20,
            "Processing",
            "Starting video generation...",
        );

        // Route to appropriate video model
        let result: VideoGenerationResult;

        if (safeParams.model === "veo") {
            // Google Veo 3.1 Fast
            result = await callVeoAPI(prompt, safeParams, progress, requestId);
        } else if (safeParams.model === "seedance") {
            // BytePlus Seedance Lite
            result = await callSeedanceAPI(
                prompt,
                safeParams,
                progress,
                requestId,
            );
        } else {
            throw new Error(
                `Video generation not supported for model: ${safeParams.model}`,
            );
        }

        logOps("Video generation complete:", {
            durationSeconds: result.durationSeconds,
            bufferSize: result.buffer.length,
        });

        return result;
    } catch (error) {
        logError("Error in createAndReturnVideo:", error);
        throw error;
    }
}

/**
 * Check if a model is a video model
 * @param {string} model - Model name
 * @returns {boolean}
 */
export function isVideoModel(model: string): boolean {
    return model === "veo" || model === "seedance";
}
