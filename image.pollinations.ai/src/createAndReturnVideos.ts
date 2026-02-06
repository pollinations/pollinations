/**
 * Video generation handler for Pollinations
 * Separate from image logic - no logo processing, no JPEG conversion, no EXIF metadata
 */

import debug from "debug";
import { callLtx2API } from "./models/ltx2VideoModel.ts";
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
        const modelHandlers: Record<string, typeof callVeoAPI> = {
            veo: callVeoAPI,
            seedance: callSeedanceAPI,
            "seedance-pro": callSeedanceProAPI,
            wan: callWanAPI,
            "ltx-2": callLtx2API,
        };

        const handler = modelHandlers[safeParams.model];
        if (!handler) {
            throw new Error(
                `Video generation not supported for model: ${safeParams.model}`,
            );
        }

        const result = await handler(prompt, safeParams, progress, requestId);

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

// List of supported video models
const VIDEO_MODELS = [
    "veo",
    "seedance",
    "seedance-pro",
    "wan",
    "ltx-2",
] as const;

/**
 * Check if a model is a video model
 * @param {string} model - Model name
 * @returns {boolean}
 */
export function isVideoModel(model: string): boolean {
    return VIDEO_MODELS.includes(model as (typeof VIDEO_MODELS)[number]);
}
