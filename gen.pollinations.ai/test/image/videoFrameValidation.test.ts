import {
    getVideoModelIds,
    IMAGE_SERVICES,
    type ImageModelName,
} from "@shared/registry/image.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    createAndReturnVideo,
    validateVideoFrameCount,
} from "../../src/image/createAndReturnVideos.ts";
import type { ImageParams } from "../../src/image/params.ts";

const VIDEO_FRAME_LIMITS = [
    ["google/gemini-omni-1.1-flash", 2],
    ["veo", 2],
    ["seedance-pro", 1],
    ["seedance-2.0", 2],
    ["seedance-2.0-mini", 2],
    ["seedance-2.0-fast", 2],
    ["wan", 1],
    ["wan-3.0", 2],
    ["wan-fast", 2],
    ["wan-pro", 2],
    ["grok-video-pro", 1],
    ["grok-imagine-video-1.5", 1],
    ["seedance-2.5", 2],
    ["happyhorse-1.1", 1],
    ["minimax-h3", 0],
    ["p-video", 1],
    ["nova-reel", 1],
] as const satisfies readonly (readonly [ImageModelName, number])[];

function params(model: ImageModelName, frameCount: number): ImageParams {
    return {
        model,
        width: 1280,
        height: 720,
        dimensionsExplicit: true,
        seed: 42,
        safe: false,
        quality: "medium",
        image: Array.from(
            { length: frameCount },
            (_, index) => `https://example.com/frame-${index}.png`,
        ),
        transparent: false,
        reasoning: "balanced",
        audio: false,
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("video frame validation", () => {
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

    it.each(
        VIDEO_FRAME_LIMITS,
    )("%s accepts every advertised frame count through %i", (model, maxFrames) => {
        for (let frameCount = 0; frameCount <= maxFrames; frameCount++) {
            expect(() =>
                validateVideoFrameCount(params(model, frameCount)),
            ).not.toThrow();
        }
    });

    it.each(
        VIDEO_FRAME_LIMITS,
    )("%s rejects more than its advertised %i frame limit before dispatch", async (model, maxFrames) => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            createAndReturnVideo(
                "animate these frames",
                params(model, maxFrames + 1),
                "test-request-id",
            ),
        ).rejects.toMatchObject({ status: 400 });
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
