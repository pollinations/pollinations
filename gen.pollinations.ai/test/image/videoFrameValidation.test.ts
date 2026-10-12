import {
    getVideoModelIds,
    IMAGE_SERVICES,
    type ImageModelName,
} from "@shared/registry/image.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";
import { describe, expect, it } from "vitest";

const VIDEO_FRAME_LIMITS = [
    ["google/gemini-omni-1.1-flash", 2],
    ["google/veo-3.1-fast", 2],
    ["google/veo-3.1-fast:replicate", 2],
    ["bytedance/seedance-1-pro-fast", 1],
    ["bytedance/seedance-1-pro-fast:fal", 1],
    ["bytedance/seedance-2.0", 2],
    ["bytedance/seedance-2.0-mini", 2],
    ["bytedance/seedance-2.0-fast", 2],
    ["alibaba/wan-2.6", 1],
    ["alibaba/wan-2.6:replicate", 1],
    ["alibaba/wan-2.6:fal", 1],
    ["alibaba/wan-3.0", 2],
    ["alibaba/wan-3.0:fal", 2],
    ["alibaba/wan-2.2-fast", 2],
    ["alibaba/wan-2.2-fast:fal", 2],
    ["alibaba/wan-2.7", 2],
    ["x-ai/grok-imagine-video", 1],
    ["x-ai/grok-imagine-video:openrouter", 1],
    ["x-ai/grok-imagine-video-1.5", 1],
    ["x-ai/grok-imagine-video-1.5:fal", 1],
    ["x-ai/grok-imagine-video-1.5-lite", 1],
    ["x-ai/grok-imagine-video-1.5-lite:openrouter", 1],
    ["bytedance/seedance-2.5", 2],
    ["alibaba/happyhorse-1.1", 1],
    ["heygen/heygen-video-1", 1],
    ["minimax/minimax-h3", 0],
    ["minimax/minimax-h3-max", 2],
    ["minimax/minimax-h3-max-turbo", 2],
    ["prunaai/p-video", 1],
] as const satisfies readonly (readonly [ImageModelName, number])[];

describe("video frame capabilities", () => {
    it("keeps the explicit test matrix in sync with every deployed video model", () => {
        expect(getVideoModelIds().sort()).toEqual(
            VIDEO_FRAME_LIMITS.map(([model]) => model).sort(),
        );

        for (const [model, maxFrames] of VIDEO_FRAME_LIMITS) {
            const definition = IMAGE_SERVICES[model] as ModelDefinition;
            const capabilities = definition.videoCapabilities ?? [];

            expect(definition.maxReferenceImages ?? 0, model).toBe(maxFrames);
            expect(capabilities.includes("start_frame"), model).toBe(
                maxFrames >= 1,
            );
            expect(capabilities.includes("end_frame"), model).toBe(
                maxFrames >= 2,
            );
        }
    });
});
