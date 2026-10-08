import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { calculateUsageBilling } from "@shared/registry/registry.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAndReturnVideo } from "../../src/image/createAndReturnVideos.ts";
import { syncImageEnv } from "../../src/image/env.ts";
import type { ImageParams } from "../../src/image/params.ts";

const SUBMIT_URL = "https://api.x.ai/v1/videos/generations";
const POLL_URL = "https://api.x.ai/v1/videos/req-lite-test";
const VIDEO_URL = "https://vidgen.x.ai/lite-test/video.mp4";

const baseParams: ImageParams = {
    model: "x-ai/grok-imagine-video-1.5-lite",
    width: 1280,
    height: 720,
    dimensionsExplicit: true,
    seed: 42,
    safe: false,
    quality: "medium",
    image: [],
    transparent: false,
    reasoning: "balanced",
    audio: false,
    duration: 5,
};

function mockXai(
    requests: Record<string, unknown>[],
    done: Record<string, unknown> = {
        status: "done",
        video: { url: VIDEO_URL, duration: 5, respect_moderation: true },
    },
    headers: Array<string | null> = [],
) {
    return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url, init) => {
            const href = typeof url === "string" ? url : url.toString();
            if (href === SUBMIT_URL) {
                requests.push(
                    JSON.parse(init?.body as string) as Record<string, unknown>,
                );
                headers.push(new Headers(init?.headers).get("Authorization"));
                return Response.json({ request_id: "req-lite-test" });
            }
            if (href === POLL_URL) return Response.json(done);
            if (href === VIDEO_URL) {
                return new Response(new Uint8Array([0, 0, 0, 24]), {
                    headers: { "Content-Type": "video/mp4" },
                });
            }
            return new Response("unexpected URL", { status: 404 });
        });
}

function setXaiEnv() {
    syncImageEnv({ XAI_API_KEY: "xai-test-key" } as CloudflareBindings, [
        "XAI_API_KEY",
    ]);
}

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("xAI Grok Imagine Video 1.5 Lite", () => {
    it.each([
        [undefined, "720p"],
        ["480p", "480p"],
        ["1080p", "1080p"],
    ] as const)("sends resolution %s as %s with an aspect ratio for text-to-video", async (resolution, expected) => {
        setXaiEnv();
        const requests: Record<string, unknown>[] = [];
        const headers: Array<string | null> = [];
        mockXai(requests, undefined, headers);

        const result = await createAndReturnVideo("a calm ocean", {
            ...baseParams,
            resolution,
        });

        expect(headers[0]).toBe("Bearer xai-test-key");
        expect(requests[0]).toEqual({
            model: "grok-imagine-video-1.5-lite",
            prompt: "a calm ocean",
            duration: 5,
            resolution: expected,
            aspect_ratio: "16:9",
        });
        expect(result).toMatchObject({
            buffer: Buffer.from([0, 0, 0, 24]),
            mimeType: "video/mp4",
            durationSeconds: 5,
            trackingData: {
                actualModel: "x-ai/grok-imagine-video-1.5-lite",
                usage: { completionVideoSeconds: 5 },
            },
        });
    });

    it("forwards one start frame without an aspect ratio and bills the image", async () => {
        setXaiEnv();
        const requests: Record<string, unknown>[] = [];
        mockXai(requests);

        const result = await createAndReturnVideo("animate this", {
            ...baseParams,
            image: ["https://example.com/start.png"],
        });

        expect(requests[0]).toEqual({
            model: "grok-imagine-video-1.5-lite",
            prompt: "animate this",
            duration: 5,
            resolution: "720p",
            image: { url: "https://example.com/start.png" },
        });
        expect(result.trackingData?.usage).toEqual({
            promptImageTokens: 1,
            completionVideoSeconds: 5,
        });
    });

    it("bills the duration xAI reports and prices it per resolution", async () => {
        setXaiEnv();
        mockXai([], {
            status: "done",
            video: { url: VIDEO_URL, duration: 4, respect_moderation: true },
        });

        const result = await createAndReturnVideo("a calm ocean", {
            ...baseParams,
            duration: 5,
            resolution: "1080p",
        });

        expect(result.trackingData?.usage).toEqual({
            completionVideoSeconds: 4,
        });
        const billing = calculateUsageBilling({
            model: "x-ai/grok-imagine-video-1.5-lite",
            usage: result.trackingData.usage,
            servedBy: IMAGE_SERVICES["x-ai/grok-imagine-video-1.5-lite"],
            input: { resolution: "1080p" },
        });
        expect(billing.cost.totalCost).toBeCloseTo(4 * 0.14, 10);
    });

    it("rejects a video xAI filtered by moderation", async () => {
        setXaiEnv();
        mockXai([], {
            status: "done",
            video: { url: VIDEO_URL, duration: 5, respect_moderation: false },
        });

        await expect(
            createAndReturnVideo("a calm ocean", baseParams),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("maps an invalid_argument failure to a 400", async () => {
        setXaiEnv();
        mockXai([], {
            status: "failed",
            error: { code: "invalid_argument", message: "bad input" },
        });

        await expect(
            createAndReturnVideo("a calm ocean", baseParams),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("times out after three minutes of pending status", async () => {
        vi.useFakeTimers();
        setXaiEnv();
        mockXai([], { status: "pending" });

        const resultPromise = createAndReturnVideo("a calm ocean", baseParams);
        const settled = expect(resultPromise).rejects.toMatchObject({
            status: 504,
        });
        await vi.advanceTimersByTimeAsync(3 * 60 * 1000 + 5000);
        await settled;
    });
});
