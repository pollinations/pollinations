import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import {
    callFalFallbackImage,
    callFalFallbackVideo,
} from "../../src/image/models/falFallbackMediaModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const STATUS_URL = "https://queue.fal.run/requests/test/status";
const RESULT_URL = "https://queue.fal.run/requests/test";
const MEDIA_URL = "https://fal.media/output";
const MEDIA_BYTES = new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112]);

const baseParams: ImageParams = {
    model: "seedream5-fal",
    width: 1024,
    height: 1024,
    dimensionsExplicit: false,
    seed: 42,
    safe: false,
    quality: "medium",
    image: [],
    transparent: false,
    reasoning: "balanced",
    audio: true,
};

function mockFal(output: Record<string, unknown>) {
    const requests: { url: string; body?: Record<string, unknown> }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        const href = typeof url === "string" ? url : url.toString();
        requests.push({
            url: href,
            body:
                typeof init?.body === "string"
                    ? (JSON.parse(init.body) as Record<string, unknown>)
                    : undefined,
        });
        if (href === STATUS_URL) {
            return Response.json({ status: "COMPLETED" });
        }
        if (href === RESULT_URL) return Response.json(output);
        if (href === MEDIA_URL) {
            return new Response(MEDIA_BYTES, {
                headers: { "content-type": "video/mp4" },
            });
        }
        return Response.json({
            request_id: "test",
            status_url: STATUS_URL,
            response_url: RESULT_URL,
        });
    });
    return requests;
}

beforeEach(() => {
    syncImageEnv({ FAL_KEY: "test-fal-key" } as CloudflareBindings, [
        "FAL_KEY",
    ]);
    vi.useFakeTimers();
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe("Fal fallback media models", () => {
    it("sends Seedream 5 through the exact Fal endpoint", async () => {
        const requests = mockFal({
            images: [{ url: MEDIA_URL, content_type: "image/jpeg" }],
        });
        const resultPromise = callFalFallbackImage("a blue circle", baseParams);
        await vi.advanceTimersByTimeAsync(5_000);
        const result = await resultPromise;

        expect(requests[0]).toEqual({
            url: "https://queue.fal.run/bytedance/seedream/v5/lite/text-to-image",
            body: {
                prompt: "a blue circle",
                image_size: { width: 1024, height: 1024 },
                num_images: 1,
                seed: 42,
            },
        });
        expect(result.trackingData).toEqual({
            actualModel: "seedream5-fal",
            usage: { completionImageTokens: 1 },
        });
    });

    it.each([
        [
            "grok-video-pro-fal",
            "xai/grok-imagine-video/text-to-video",
            { duration: 1, resolution: "720p", aspect_ratio: "1:1" },
        ],
        [
            "wan-fal",
            "wan/v2.6/text-to-video",
            { duration: 10, resolution: "720p", aspect_ratio: "1:1" },
        ],
        [
            "seedance-pro-fal",
            "fal-ai/bytedance/seedance/v1/pro/fast/text-to-video",
            {
                duration: 5,
                resolution: "480p",
                aspect_ratio: "1:1",
                camera_fixed: false,
            },
        ],
    ] as const)("sends %s through its exact Fal endpoint", async (model, endpoint, input) => {
        const requests = mockFal({
            video: { url: MEDIA_URL, content_type: "video/mp4" },
        });
        const resultPromise = callFalFallbackVideo("a blue circle", {
            ...baseParams,
            model,
            duration: input.duration,
            resolution: model === "seedance-pro-fal" ? "480p" : undefined,
        });
        await vi.advanceTimersByTimeAsync(5_000);
        const result = await resultPromise;

        expect(requests[0]).toEqual({
            url: `https://queue.fal.run/${endpoint}`,
            body: { prompt: "a blue circle", ...input, seed: 42 },
        });
        expect(result.durationSeconds).toBe(input.duration);
        expect(result.trackingData.usage.completionVideoSeconds).toBe(
            input.duration,
        );
    });

    it("omits aspect ratio where Grok 1.5 image-to-video follows the source", async () => {
        const requests = mockFal({
            video: { url: MEDIA_URL, content_type: "video/mp4" },
        });
        const resultPromise = callFalFallbackVideo("move", {
            ...baseParams,
            model: "grok-imagine-video-1.5-fal",
            duration: 5,
            resolution: "720p",
            image: ["https://example.com/input.png"],
        });
        await vi.advanceTimersByTimeAsync(5_000);
        await resultPromise;

        expect(requests[0].body).toEqual({
            prompt: "move",
            duration: 5,
            resolution: "720p",
            image_url: "https://example.com/input.png",
            seed: 42,
        });
    });
});
