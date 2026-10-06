/**
 * Video generation handler for Pollinations
 * Separate from image logic - no logo processing, no JPEG conversion, no EXIF metadata
 */

import { getVideoModelIds } from "@shared/registry/image.ts";
import debug from "debug";
import { callAlibabaVideo } from "./models/alibabaVideoModel.ts";
import { callFalFallbackVideo } from "./models/falFallbackMediaModel.ts";
import { callGeminiOmniAPI } from "./models/geminiOmniVideoModel.ts";
import {
    callMinimaxH3API,
    callMinimaxH3MaxAPI,
    callMinimaxH3MaxTurboAPI,
} from "./models/minimaxH3Model.ts";
import {
    callHappyHorseAPI,
    callHeyGenVideoAPI,
    callOpenRouterGrokVideoAPI,
} from "./models/openRouterVideoModel.ts";
import { callPrunaVideoAPI } from "./models/prunaModel.ts";
import { callSeedance25API } from "./models/seedance25VideoModel.ts";
import { callSeedanceProAPI } from "./models/seedanceReplicateVideoModel.ts";
import { callSeedanceV2API } from "./models/seedanceV2VideoModel.ts";
import {
    callVeoAPI,
    callVeoReplicateAPI,
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

export async function createAndReturnVideo(
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> {
    logOps("Starting video generation:", { prompt, model: safeParams.model });

    let result: VideoGenerationResult;
    switch (safeParams.model) {
        case "google/gemini-omni-1.1-flash":
            result = await callGeminiOmniAPI(prompt, safeParams);
            break;
        case "google/veo-3.1-fast":
            result = await callVeoAPI(prompt, safeParams);
            break;
        case "google/veo-3.1-fast:replicate":
            result = await callVeoReplicateAPI(prompt, safeParams);
            break;
        case "bytedance/seedance-1-pro-fast":
            result = await callSeedanceProAPI(prompt, safeParams);
            break;
        case "bytedance/seedance-1-pro-fast:fal":
        case "alibaba/wan-2.6:fal":
        case "alibaba/wan-2.2-fast:fal":
        case "x-ai/grok-imagine-video":
        case "x-ai/grok-imagine-video-1.5:fal":
            result = await callFalFallbackVideo(prompt, safeParams);
            break;
        case "bytedance/seedance-2.0":
        case "bytedance/seedance-2.0-mini":
        case "bytedance/seedance-2.0-fast":
            result = await callSeedanceV2API(prompt, safeParams);
            break;
        case "alibaba/wan-2.6":
            result = await callAlibabaVideo(prompt, safeParams, "2.6");
            break;
        case "alibaba/wan-2.6:replicate":
            result = await callWanAPI(prompt, safeParams);
            break;
        case "alibaba/wan-2.2-fast":
            result = await callWanFastAPI(prompt, safeParams);
            break;
        case "alibaba/wan-2.7":
            result = await callWanProAPI(prompt, safeParams);
            break;
        case "alibaba/wan-3.0":
            result = await callAlibabaVideo(prompt, safeParams, "3.0");
            break;
        case "alibaba/wan-3.0:fal":
            result = await callWan3FalAPI(prompt, safeParams);
            break;
        case "prunaai/p-video":
            result = await callPrunaVideoAPI(prompt, safeParams);
            break;
        case "x-ai/grok-imagine-video:openrouter":
        case "x-ai/grok-imagine-video-1.5":
            result = await callOpenRouterGrokVideoAPI(prompt, safeParams);
            break;
        case "bytedance/seedance-2.5":
            result = await callSeedance25API(prompt, safeParams);
            break;
        case "alibaba/happyhorse-1.1":
            result = await callHappyHorseAPI(prompt, safeParams);
            break;
        case "heygen/heygen-video-1":
            result = await callHeyGenVideoAPI(prompt, safeParams);
            break;
        case "minimax/minimax-h3":
            result = await callMinimaxH3API(prompt, safeParams);
            break;
        case "minimax/minimax-h3-max":
            result = await callMinimaxH3MaxAPI(prompt, safeParams);
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
