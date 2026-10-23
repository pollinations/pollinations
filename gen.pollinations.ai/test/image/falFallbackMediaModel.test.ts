import { UpstreamError } from "@shared/error.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAndReturnVideo } from "../../src/image/createAndReturnVideos.ts";
import { syncImageEnv } from "../../src/image/env.ts";
import {
    callFalFallbackImage,
    callFalFallbackVideo,
    callMireloSfxAPI,
} from "../../src/image/models/falFallbackMediaModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const STATUS_URL = "https://queue.fal.run/requests/test/status";
const RESULT_URL = "https://queue.fal.run/requests/test";
const MEDIA_URL = "https://fal.media/output";
const MEDIA_BYTES = new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112]);

const baseParams: ImageParams = {
    model: "bytedance/seedream-5.0-lite:fal",
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

function mockFal(output: Record<string, unknown>, status = 200) {
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
        if (href.startsWith("https://api.fal.ai/v1/models/pricing")) {
            const endpoint_id = new URL(href).searchParams.get("endpoint_id");
            return Response.json({
                prices: [{ endpoint_id, unit_price: 0.17, currency: "USD" }],
            });
        }
        if (href === RESULT_URL) {
            return Response.json(output, {
                status,
                headers: { "x-fal-billable-units": "1" },
            });
        }
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
    it.each([
        [undefined, "16:9", false, 1024, 1024, 5, "16:9"],
        [0, "9:16", true, 1080, 720, 5, "3:2"],
        [99, "9:16", false, 1024, 1024, 15, "9:16"],
        [-1, undefined, true, 1024, 1024, 1, "1:1"],
    ] as const)(
        "routes Grok duration %s through Fal with unchanged parameters",
        async (duration, aspectRatio, dimensionsExplicit, width, height, expectedDuration, expectedRatio) => {
            const requests = mockFal({ video: { url: MEDIA_URL } });
            const resultPromise = createAndReturnVideo("move", {
                ...baseParams,
                model: "x-ai/grok-imagine-video",
                duration,
                aspectRatio,
                dimensionsExplicit,
                width,
                height,
                image: ["https://example.com/start.png"],
            });
            await vi.advanceTimersByTimeAsync(5_000);
            const result = await resultPromise;
            expect(requests[0]).toEqual({
                url: "https://queue.fal.run/xai/grok-imagine-video/image-to-video",
                body: {
                    prompt: "move",
                    duration: expectedDuration,
                    resolution: "720p",
                    aspect_ratio: expectedRatio,
                    image_url: "https://example.com/start.png",
                    seed: 42,
                },
            });
            expect(result.trackingData).toEqual({
                actualModel: "x-ai/grok-imagine-video",
                usage: {
                    promptImageTokens: 1,
                    completionVideoSeconds: expectedDuration,
                },
            });
        },
    );

    it.each([
        [
            "charges a Grok video rejected after generation",
            {
                prompt: "move",
                duration: 5,
                resolution: "720p",
                aspect_ratio: "16:9",
                image_url: "https://example.com/start.png",
            },
            { promptImageTokens: 1, completionVideoSeconds: 5 },
        ],
        [
            "does not charge a Grok request rejected before generation",
            { text: ["move"], image_url: ["https://example.com/start.png"] },
            undefined,
        ],
    ])("%s", async (_, echoedInput, billedUsage) => {
        mockFal(
            {
                detail: [
                    {
                        loc: ["body"],
                        msg: "Content flagged by the content checker.",
                        type: "content_policy_violation",
                        input: echoedInput,
                    },
                ],
            },
            422,
        );
        const errorPromise = callFalFallbackVideo("move", {
            ...baseParams,
            model: "x-ai/grok-imagine-video",
            duration: 5,
            image: ["https://example.com/start.png"],
        }).catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(5_000);
        const error = await errorPromise;

        expect(error).toBeInstanceOf(UpstreamError);
        expect(error).toMatchObject({ status: 422 });
        expect((error as UpstreamError).billedUsage).toEqual(billedUsage);
    });

    it.each([0.5, 4.5, 15.5])(
        "rejects fractional Grok duration %s before Fal submission",
        async (duration) => {
            const fetchSpy = vi.spyOn(globalThis, "fetch");
            await expect(
                createAndReturnVideo("move", {
                    ...baseParams,
                    model: "x-ai/grok-imagine-video",
                    duration,
                }),
            ).rejects.toMatchObject({ status: 400 });
            expect(fetchSpy).not.toHaveBeenCalled();
        },
    );

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
            actualModel: "bytedance/seedream-5.0-lite:fal",
            usage: { completionImageTokens: 1 },
        });
    });

    it.each([
        [
            "x-ai/grok-imagine-video",
            "xai/grok-imagine-video/text-to-video",
            { duration: 1, resolution: "720p", aspect_ratio: "1:1" },
        ],
        [
            "alibaba/wan-2.6:fal",
            "wan/v2.6/text-to-video",
            { duration: 10, resolution: "720p", aspect_ratio: "1:1" },
        ],
        [
            "bytedance/seedance-1-pro-fast:fal",
            "fal-ai/bytedance/seedance/v1/pro/fast/text-to-video",
            {
                duration: 5,
                resolution: "480p",
                aspect_ratio: "1:1",
                camera_fixed: false,
            },
        ],
    ] as const)(
        "sends %s through its exact Fal endpoint",
        async (model, endpoint, input) => {
            const requests = mockFal({
                video: { url: MEDIA_URL, content_type: "video/mp4" },
            });
            const resultPromise = callFalFallbackVideo("a blue circle", {
                ...baseParams,
                model,
                duration: input.duration,
                resolution:
                    model === "bytedance/seedance-1-pro-fast:fal"
                        ? "480p"
                        : undefined,
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
        },
    );

    it("sends Wan 2.2 text-to-video through Fal Turbo", async () => {
        const requests = mockFal({
            video: { url: MEDIA_URL, content_type: "video/mp4" },
        });
        const resultPromise = callFalFallbackVideo("a blue circle", {
            ...baseParams,
            model: "alibaba/wan-2.2-fast:fal",
        });
        await vi.advanceTimersByTimeAsync(5_000);
        const result = await resultPromise;

        expect(requests[0]).toEqual({
            url: "https://queue.fal.run/fal-ai/wan/v2.2-a14b/text-to-video/turbo",
            body: {
                prompt: "a blue circle",
                resolution: "480p",
                aspect_ratio: "1:1",
                seed: 42,
            },
        });
        expect(result.durationSeconds).toBe(5);
        expect(result.trackingData.usage.completionVideoSeconds).toBe(5);
    });

    it("maps unsupported 4:3 input to a Wan 2.2 Turbo ratio", async () => {
        const requests = mockFal({
            video: { url: MEDIA_URL, content_type: "video/mp4" },
        });
        const resultPromise = callFalFallbackVideo("a blue circle", {
            ...baseParams,
            model: "alibaba/wan-2.2-fast:fal",
            width: 1024,
            height: 768,
        });
        await vi.advanceTimersByTimeAsync(5_000);
        await resultPromise;

        expect(requests[0].body?.aspect_ratio).toBe("1:1");
    });

    it.each([
        ["x-ai/grok-imagine-video-1.5:fal", "9:16", false, "9:16"],
        ["alibaba/wan-2.6:fal", "16:9", false, "16:9"],
        ["alibaba/wan-2.2-fast:fal", "16:9", false, "16:9"],
        ["bytedance/seedance-1-pro-fast:fal", "21:9", false, "21:9"],
        // Wan 2.2 Turbo has no 4:3, so the default 1024×1024 decides.
        ["alibaba/wan-2.2-fast:fal", "4:3", false, "1:1"],
        // Explicit dimensions win over the requested ratio.
        ["alibaba/wan-2.6:fal", "16:9", true, "1:1"],
    ] as const)(
        "sends %s aspectRatio %s (explicit dimensions: %s) as %s",
        async (model, aspectRatio, dimensionsExplicit, expected) => {
            const requests = mockFal({ video: { url: MEDIA_URL } });
            const resultPromise = callFalFallbackVideo("a blue circle", {
                ...baseParams,
                model,
                aspectRatio,
                dimensionsExplicit,
            });
            await vi.advanceTimersByTimeAsync(5_000);
            await resultPromise;

            expect(requests[0].body?.aspect_ratio).toBe(expected);
        },
    );

    it("omits aspect ratio where Grok 1.5 image-to-video follows the source", async () => {
        const requests = mockFal({
            video: { url: MEDIA_URL, content_type: "video/mp4" },
        });
        const resultPromise = callFalFallbackVideo("move", {
            ...baseParams,
            model: "x-ai/grok-imagine-video-1.5:fal",
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

    it.each([
        [
            [],
            undefined,
            "fal-ai/kandinsky6-lite/text-to-video",
            { generate_audio: true, aspect_ratio: "1:1" },
        ],
        [
            [],
            "16:9",
            "fal-ai/kandinsky6-lite/text-to-video",
            { generate_audio: true, aspect_ratio: "16:9" },
        ],
        [
            ["https://example.com/start.png"],
            undefined,
            "fal-ai/kandinsky6-lite/image-to-video",
            {
                generate_audio: true,
                image_url: "https://example.com/start.png",
            },
        ],
    ] as const)(
        "bills Kandinsky 6.0 Lite (%j, %s) from fal's units and live price",
        async (image, ratio, endpoint, input) => {
            const requests = mockFal({
                video: { url: MEDIA_URL, content_type: "video/mp4" },
            });
            const resultPromise = callFalFallbackVideo("move", {
                ...baseParams,
                model: "kandinskylab/kandinsky-6.0-lite",
                duration: 10,
                aspectRatio: ratio,
                image: [...image],
            });
            await vi.advanceTimersByTimeAsync(5_000);
            const result = await resultPromise;

            expect(requests[0].url).toBe(
                `https://api.fal.ai/v1/models/pricing?endpoint_id=${encodeURIComponent(endpoint)}`,
            );
            expect(requests[1]).toEqual({
                url: `https://queue.fal.run/${endpoint}`,
                body: { prompt: "move", ...input, seed: 42 },
            });
            expect(result.durationSeconds).toBe(5);
            expect(result.trackingData.providerBilling).toEqual({
                units: 1,
                unitCost: 0.17,
            });
        },
    );

    it.each([
        [undefined, 120],
        [8, 8],
    ] as const)(
        "adds Mirelo SFX 2.0 sound to the source video (duration %s) at fal's live price",
        async (duration, sentDuration) => {
            const requests = mockFal({
                video: [
                    {
                        url: MEDIA_URL,
                        content_type: "application/octet-stream",
                    },
                ],
            });
            const resultPromise = createAndReturnVideo("whoosh", {
                ...baseParams,
                model: "mirelo/sfx-2.0",
                duration,
                reference_videos: ["https://example.com/source.mp4"],
            });
            await vi.advanceTimersByTimeAsync(5_000);
            const result = await resultPromise;

            expect(requests[0].url).toBe(
                "https://api.fal.ai/v1/models/pricing?endpoint_id=mirelo-ai%2Fsfx2.0%2Fvideo-to-video",
            );
            expect(requests[1]).toEqual({
                url: "https://queue.fal.run/mirelo-ai/sfx2.0/video-to-video",
                body: {
                    video_url: "https://example.com/source.mp4",
                    text_prompt: "whoosh",
                    num_samples: 1,
                    duration: sentDuration,
                    seed: 42,
                },
            });
            expect(result.mimeType).toBe("video/mp4");
            expect(result.trackingData.usage).toEqual({
                completionVideoSeconds: 1,
            });
            expect(result.trackingData.providerBilling).toEqual({
                units: 1,
                unitCost: 0.17,
            });
        },
    );

    it.each([
        [[], []],
        [["https://example.com/a.mp4", "https://example.com/b.mp4"], []],
        [["https://example.com/a.mp4"], ["https://example.com/a.png"]],
    ])(
        "refuses Mirelo SFX 2.0 videos %j with images %j instead of dropping inputs",
        async (reference_videos, image) => {
            const fetch = vi.spyOn(globalThis, "fetch");
            await expect(
                callMireloSfxAPI("whoosh", {
                    ...baseParams,
                    model: "mirelo/sfx-2.0",
                    reference_videos,
                    image,
                }),
            ).rejects.toMatchObject({ status: 400 });
            expect(fetch).not.toHaveBeenCalled();
        },
    );

    it("maps Wan 2.2 start and end frames to the Fal turbo endpoint", async () => {
        const requests = mockFal({
            video: { url: MEDIA_URL, content_type: "video/mp4" },
        });
        const resultPromise = callFalFallbackVideo("move", {
            ...baseParams,
            model: "alibaba/wan-2.2-fast:fal",
            image: [
                "https://example.com/start.png",
                "https://example.com/end.png",
            ],
        });
        await vi.advanceTimersByTimeAsync(5_000);
        const result = await resultPromise;

        expect(requests[0]).toEqual({
            url: "https://queue.fal.run/fal-ai/wan/v2.2-a14b/image-to-video/turbo",
            body: {
                prompt: "move",
                resolution: "480p",
                end_image_url: "https://example.com/end.png",
                image_url: "https://example.com/start.png",
                seed: 42,
            },
        });
        expect(result.durationSeconds).toBe(5);
        expect(result.trackingData).toEqual({
            actualModel: "alibaba/wan-2.2-fast:fal",
            usage: { promptImageTokens: 2, completionVideoSeconds: 5 },
        });
    });
});
