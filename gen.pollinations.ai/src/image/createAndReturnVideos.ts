/**
 * Video generation handler for Pollinations
 * Separate from image logic - no logo processing, no JPEG conversion, no EXIF metadata
 */

import { getVideoModelIds } from "@shared/registry/image.ts";
import debug from "debug";
import { callMinimaxH3API } from "./models/minimaxH3Model.ts";
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
import {
    callWanAPI,
    callWanFastAPI,
    callWanProAPI,
} from "./models/wanVideoModel.ts";
import type { ImageParams } from "./params.ts";

export type { VideoGenerationResult };

const logOps = debug("pollinations:video:ops");
const VIDEO_MODEL_IDS = new Set(getVideoModelIds());

export async function createAndReturnVideo(
    prompt: string,
    safeParams: ImageParams,
    requestId: string,
): Promise<VideoGenerationResult> {
    logOps("Starting video generation:", { prompt, model: safeParams.model });

    let result: VideoGenerationResult;
    switch (safeParams.model) {
        case "google/veo-3.1-fast":
            result = await callVeoAPI(prompt, safeParams);
            break;
        case "bytedance/seedance-1-pro-fast":
            result = await callSeedanceProAPI(prompt, safeParams);
            break;
        case "bytedance/seedance-2.0":
        case "bytedance/seedance-2.0-mini":
        case "bytedance/seedance-2.0-fast":
            result = await callSeedanceV2API(prompt, safeParams);
            break;
        case "alibaba/wan-2.6":
            result = await callWanAPI(prompt, safeParams);
            break;
        case "wan-video/wan-2.2-fast":
            result = await callWanFastAPI(prompt, safeParams);
            break;
        case "alibaba/wan-2.7":
            result = await callWanProAPI(prompt, safeParams);
            break;
        case "prunaai/p-video":
            result = await callPrunaVideoAPI(prompt, safeParams);
            break;
        case "amazon.nova-reel-v1:1":
            result = await callNovaReelAPI(prompt, safeParams, requestId);
            break;
        case "x-ai/grok-imagine-video-1.5":
        case "x-ai/grok-imagine-video":
            result = await callOpenRouterGrokVideoAPI(prompt, safeParams);
            break;
        case "bytedance/seedance-2.5":
            result = await callSeedance25API(prompt, safeParams);
            break;
        case "alibaba/happyhorse-1.1":
            result = await callHappyHorseAPI(prompt, safeParams);
            break;
        case "minimax/minimax-h3":
            result = await callMinimaxH3API(prompt, safeParams);
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
