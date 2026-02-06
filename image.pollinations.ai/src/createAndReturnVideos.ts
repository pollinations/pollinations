/**
 * Video generation handler for Pollinations
 * Separate from image logic - no logo processing, no JPEG conversion, no EXIF metadata
 */

import debug from "debug";
import { callAirforceVideoAPI } from "./models/airforceModel.ts";
import {
    callSeedanceAPI,
    callSeedanceProAPI,
} from "./models/seedanceVideoModel.ts";
import {
    callVeoAPI,
    type VideoGenerationResult,
} from "./models/veoVideoModel.ts";
import { callWanAPI } from "./models/wanVideoModel.ts";
import type { ImageParams } from "./params.ts";
import type { ProgressManager } from "./progressBar.ts";
export type { VideoGenerationResult };

import type { ImageServiceId } from "../../shared/registry/image.ts";
import { incrementModelCounter } from "./modelCounter.ts";
import { IMAGE_CONFIG } from "./models.ts";

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
        const result = await routeToVideoModel(
            prompt,
            safeParams,
            progress,
            requestId,
        );

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

async function routeToVideoModel(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<VideoGenerationResult> {
    switch (safeParams.model) {
        case "veo":
            return callVeoAPI(prompt, safeParams, progress, requestId);
        case "seedance":
            return callSeedanceAPI(prompt, safeParams, progress, requestId);
        case "seedance-pro":
            return callSeedanceProAPI(prompt, safeParams, progress, requestId);
        case "wan":
            return callWanAPI(prompt, safeParams, progress, requestId);
        case "grok-video":
            return callAirforceVideoAPI(
                prompt,
                safeParams,
                progress,
                requestId,
                "grok-imagine-video",
            );
        default:
            throw new Error(
                `Video generation not supported for model: ${safeParams.model}`,
            );
    }
}

/**
 * Check if a model is a video model by looking at the IMAGE_CONFIG
 */
export function isVideoModel(model: string): boolean {
    const config = IMAGE_CONFIG[model as ImageServiceId];
    return config?.isVideo === true;
}
