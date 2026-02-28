/**
 * Video generation handler for Pollinations
 * Separate from image logic - no logo processing, no JPEG conversion, no EXIF metadata
 */

import debug from "debug";
import { callAirforceVideoAPI } from "./models/airforceModel.ts";
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

import type { ImageServiceId } from "../../shared/registry/image.ts";
import { IMAGE_CONFIG } from "./models.ts";

const logOps = debug("pollinations:video:ops");

export async function createAndReturnVideo(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<VideoGenerationResult> {
    logOps("Starting video generation:", { prompt, model: safeParams.model });
    progress.updateBar(
        requestId,
        20,
        "Processing",
        "Starting video generation...",
    );

    let result: VideoGenerationResult;
    switch (safeParams.model) {
        case "veo":
            result = await callVeoAPI(prompt, safeParams, progress, requestId);
            break;
        case "seedance":
            result = await callSeedanceAPI(
                prompt,
                safeParams,
                progress,
                requestId,
            );
            break;
        case "seedance-pro":
            result = await callSeedanceProAPI(
                prompt,
                safeParams,
                progress,
                requestId,
            );
            break;
        case "wan":
            result = await callWanAPI(prompt, safeParams, progress, requestId);
            break;
        case "ltx-2":
            result = await callLtx2API(prompt, safeParams, progress, requestId);
            break;
        case "grok-video":
            result = await callAirforceVideoAPI(
                prompt,
                safeParams,
                progress,
                requestId,
                "grok-imagine-video",
            );
            break;
        default:
            throw new Error(
                `Video generation not supported for model: ${safeParams.model}`,
            );
    }

    logOps("Video generation complete:", {
        durationSeconds: result.durationSeconds,
        bufferSize: result.buffer.length,
    });
    return result;
}

/**
 * Check if a model is a video model by looking at the IMAGE_CONFIG
 */
export function isVideoModel(model: string): boolean {
    const config = IMAGE_CONFIG[model as ImageServiceId] as {
        isVideo?: boolean;
    };
    return config?.isVideo === true;
}
