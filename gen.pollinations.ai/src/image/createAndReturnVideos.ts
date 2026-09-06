import { UpstreamError } from "@shared/error.ts";
/**
 * Video generation handler for Pollinations
 * Separate from image logic - no logo processing, no JPEG conversion, no EXIF metadata
 */

import { getVideoModelIds, IMAGE_SERVICES } from "@shared/registry/image.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";
import debug from "debug";
import { callFalFallbackVideo } from "./models/falFallbackMediaModel.ts";
import { callGeminiOmniAPI } from "./models/geminiOmniVideoModel.ts";
import {
    callMinimaxH3API,
    callMinimaxH3MaxTurboAPI,
} from "./models/minimaxH3Model.ts";
import { callNovaReelAPI } from "./models/novaReelModel.ts";
import {
    callHappyHorseAPI,
    callOpenRouterGrokVideoAPI,
} from "./models/openRouterVideoModel.ts";
import { callPrunaVideoAPI } from "./models/prunaModel.ts";
import { callSeedance25API } from "./models/seedance25VideoModel.ts";
import { callSeedanceProAPI } from "./models/seedanceReplicateVideoModel.ts";
import { callSeedanceV2API } from "./models/seedanceV2VideoModel.ts";
import {
    callVeoAPI,
    type VideoGenerationResult,
} from "./models/veoVideoModel.ts";
import { callWan3FalAPI } from "./models/wan3FalVideoModel.ts";
import {
    callWanAPI,
    callWanFastAPI,
    callWanProAPI,
} from "./models/wanVideoModel.ts";
import type { ImageParams } from "./params.ts";

export type { VideoGenerationResult };

const logOps = debug("pollinations:video:ops");
const VIDEO_MODEL_IDS = new Set(getVideoModelIds());

export function validateVideoFrameCount(safeParams: ImageParams): void {
    const definition = IMAGE_SERVICES[safeParams.model] as ModelDefinition;
    const frameCount = safeParams.image.length;
    const maxFrames = definition.maxReferenceImages ?? 0;

    if (frameCount <= maxFrames) return;

    const supportedFrames =
        maxFrames === 0
            ? "no frame images"
            : maxFrames === 1
              ? "one start-frame image (image[0])"
              : `${maxFrames} frame images (image[0] as the start frame and image[1] as the end frame)`;

    throw UpstreamError.fromProvider(400, {
        message: `${definition.title} supports ${supportedFrames}; received ${frameCount}.`,
    });
}

export async function createAndReturnVideo(
    prompt: string,
    safeParams: ImageParams,
    requestId: string,
): Promise<VideoGenerationResult> {
    logOps("Starting video generation:", { prompt, model: safeParams.model });
    validateVideoFrameCount(safeParams);

    let result: VideoGenerationResult;
    switch (safeParams.model) {
        case "google/gemini-omni-1.1-flash":
            result = await callGeminiOmniAPI(prompt, safeParams);
            break;
        case "veo":
            result = await callVeoAPI(prompt, safeParams);
            break;
        case "seedance-pro":
            result = await callSeedanceProAPI(prompt, safeParams);
            break;
        case "seedance-pro-fal":
        case "wan-fal":
        case "wan-fast-fal":
        case "grok-video-pro-fal":
        case "grok-imagine-video-1.5-fal":
            result = await callFalFallbackVideo(prompt, safeParams);
            break;
        case "seedance-2.0":
        case "seedance-2.0-mini":
        case "seedance-2.0-fast":
            result = await callSeedanceV2API(prompt, safeParams);
            break;
        case "wan":
            result = await callWanAPI(prompt, safeParams);
            break;
        case "wan-fast":
            result = await callWanFastAPI(prompt, safeParams);
            break;
        case "wan-pro":
            result = await callWanProAPI(prompt, safeParams);
            break;
        case "wan-3.0":
            result = await callWan3FalAPI(prompt, safeParams);
            break;
        case "p-video":
            result = await callPrunaVideoAPI(prompt, safeParams);
            break;
        case "nova-reel":
            result = await callNovaReelAPI(prompt, safeParams, requestId);
            break;
        case "grok-video-pro":
        case "grok-imagine-video-1.5":
            result = await callOpenRouterGrokVideoAPI(prompt, safeParams);
            break;
        case "seedance-2.5":
            result = await callSeedance25API(prompt, safeParams);
            break;
        case "happyhorse-1.1":
            result = await callHappyHorseAPI(prompt, safeParams);
            break;
        case "minimax-h3":
            result = await callMinimaxH3API(prompt, safeParams);
            break;
        case "minimax/minimax-h3-max-turbo":
            result = await callMinimaxH3MaxTurboAPI(prompt, safeParams);
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
 * Check if a model is a video model by looking at the shared registry.
 */
export function isVideoModel(model: string): boolean {
    return VIDEO_MODEL_IDS.has(model);
}
