import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import { callKlingVideoAPI } from "../../src/image/models/klingVideoModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const TEXT_ENDPOINT =
    "https://queue.fal.run/fal-ai/kling-video/v3/standard/text-to-video";
const IMAGE_ENDPOINT =
    "https://queue.fal.run/fal-ai/kling-video/v3/standard/image-to-video";
const STATUS_URL =
    "https://queue.fal.run/fal-ai/kling-video/requests/test/status";
const RESULT_URL = "https://queue.fal.run/fal-ai/kling-video/requests/test";
const VIDEO_URL = "https://fal.media/kling-test.mp4";
const VIDEO_BYTES = new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112]);

const baseParams: ImageParams = {
    model: "kwaivgi/kling-v3.0-std",
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

type ProviderRequest = {
    url: string;
    body?: Record<string, unknown>;
};

function mockKlingFetch(
    requests: ProviderRequest[],
    status: "COMPLETED" | "FAILED" = "COMPLETED",
) {
    return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url, init) => {
            const href = typeof url === "string" ? url : url.toString();
            requests.push({
                url: href,
                body: init?.body
                    ? (JSON.parse(init.body as string) as Record<
                          string,
                          unknown
                      >)
                    : undefined,
            });
            if (href === TEXT_ENDPOINT || href === IMAGE_ENDPOINT) {
                return Response.json({
                    status_url: STATUS_URL,
                    response_url: RESULT_URL,
                });
            }
            if (href === STATUS_URL) {
                return Response.json({
                    status,
                    error: "provider rejected prompt",
                });
            }
            if (href === RESULT_URL) {
                return Response.json({
                    video: { url: VIDEO_URL, content_type: "video/mp4" },
                });
            }
            if (href === VIDEO_URL) {
                return new Response(VIDEO_BYTES, {
                    headers: { "Content-Type": "video/mp4" },
                });
            }
            return new Response("unexpected URL", { status: 404 });
        });
}

beforeEach(() => {
    syncImageEnv({ FAL_KEY: "test-fal-key" } as CloudflareBindings, [
        "FAL_KEY",
    ]);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("callKlingVideoAPI", () => {
    it("routes text-to-video with the aspect ratio and bills exactly the requested silent seconds (no 5s minimum)", async () => {
        const requests: ProviderRequest[] = [];
        mockKlingFetch(requests);

        const result = await callKlingVideoAPI("a slow dolly shot", {
            ...baseParams,
            width: 720,
            height: 1280,
            audio: false,
            duration: 3,
        });

        expect(requests[0]).toMatchObject({
            url: TEXT_ENDPOINT,
            body: {
                prompt: "a slow dolly shot",
                duration: "3",
                aspect_ratio: "9:16",
                generate_audio: false,
                seed: 42,
            },
        });
        expect(result.durationSeconds).toBe(3);
        expect(result.trackingData).toEqual({
            actualModel: "kwaivgi/kling-v3.0-std",
            usage: { completionVideoSeconds: 3 },
        });
    });

    it("bills video and audio seconds separately when audio is on", async () => {
        const requests: ProviderRequest[] = [];
        mockKlingFetch(requests);

        const result = await callKlingVideoAPI("a quiet scene", {
            ...baseParams,
            audio: true,
            duration: 3,
        });

        expect(requests[0].body).toMatchObject({
            duration: "3",
            generate_audio: true,
        });
        expect(result.trackingData?.usage).toEqual({
            completionVideoSeconds: 3,
            completionAudioSeconds: 3,
        });
    });

    it("routes image-to-video with start and end frames and omits aspect_ratio", async () => {
        const requests: ProviderRequest[] = [];
        mockKlingFetch(requests);

        await callKlingVideoAPI("animate these frames", {
            ...baseParams,
            image: [
                "https://example.com/start.png",
                "https://example.com/end.png",
            ],
        });

        expect(requests[0]).toMatchObject({
            url: IMAGE_ENDPOINT,
            body: {
                start_image_url: "https://example.com/start.png",
                end_image_url: "https://example.com/end.png",
            },
        });
        expect(requests[0].body?.aspect_ratio).toBeUndefined();
    });

    it("routes image-to-video with only a start frame", async () => {
        const requests: ProviderRequest[] = [];
        mockKlingFetch(requests);

        await callKlingVideoAPI("animate this frame", {
            ...baseParams,
            image: ["https://example.com/start.png"],
        });

        expect(requests[0].url).toBe(IMAGE_ENDPOINT);
        expect(requests[0].body).toMatchObject({
            start_image_url: "https://example.com/start.png",
        });
        expect(requests[0].body?.end_image_url).toBeUndefined();
    });

    it("rejects durations outside 3-15 seconds before calling fal", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            callKlingVideoAPI("too long", { ...baseParams, duration: 16 }),
        ).rejects.toMatchObject({ status: 400 });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("surfaces a failed generation as an upstream error", async () => {
        mockKlingFetch([], "FAILED");

        await expect(
            callKlingVideoAPI("will fail", baseParams),
        ).rejects.toMatchObject({ status: 502 });
    });
});
