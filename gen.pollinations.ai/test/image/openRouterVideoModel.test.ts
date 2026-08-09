import { afterEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import {
    callHappyHorseAPI,
    callOpenRouterGrokVideoAPI,
    callOpenRouterSeedance25API,
} from "../../src/image/models/openRouterVideoModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const SUBMIT_URL = "https://openrouter.ai/api/v1/videos";
const POLL_URL = "https://openrouter.ai/api/v1/videos/job-happyhorse-test";
const VIDEO_URL = "https://video.example.com/happyhorse-output.mp4";
const GROK_POLL_URL = "https://openrouter.ai/api/v1/videos/job-grok-test";
const GROK_VIDEO_URL = "https://video.example.com/grok-output.mp4";

const baseParams: ImageParams = {
    model: "happyhorse-1.1",
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

function setOpenRouterEnv() {
    syncImageEnv(
        { OPENROUTER_API_KEY: "openrouter-test-key" } as CloudflareBindings,
        ["OPENROUTER_API_KEY"],
    );
}

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("openRouterVideoModel", () => {
    it("retries 429 and 5xx polls without forwarding auth to the download host", async () => {
        vi.useFakeTimers();
        setOpenRouterEnv();

        let pollAttempts = 0;
        let downloadAuthorization: string | null = null;
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
            const href = typeof url === "string" ? url : url.toString();

            if (href === SUBMIT_URL) {
                return new Response(
                    JSON.stringify({
                        id: "job-happyhorse-test",
                        polling_url: POLL_URL,
                        status: "pending",
                    }),
                    { status: 200 },
                );
            }

            if (href === POLL_URL) {
                pollAttempts++;
                if (pollAttempts === 1) {
                    return new Response("rate limited", {
                        status: 429,
                        headers: {
                            "Retry-After": "Thu, 01 Jan 1970 00:00:00 GMT",
                        },
                    });
                }
                if (pollAttempts === 2) {
                    return new Response("temporarily unavailable", {
                        status: 503,
                    });
                }
                return new Response(
                    JSON.stringify({
                        id: "job-happyhorse-test",
                        polling_url: POLL_URL,
                        status: "completed",
                        unsigned_urls: [VIDEO_URL],
                    }),
                    { status: 200 },
                );
            }

            if (href === VIDEO_URL) {
                downloadAuthorization = new Headers(init?.headers).get(
                    "Authorization",
                );
                return new Response(new Uint8Array([0, 0, 0, 24]), {
                    status: 200,
                    headers: { "Content-Type": "video/mp4" },
                });
            }

            return new Response("unexpected URL", { status: 404 });
        });

        const resultPromise = callHappyHorseAPI(
            "a calm ocean at sunrise",
            baseParams,
        );
        await vi.advanceTimersByTimeAsync(6000);
        const result = await resultPromise;

        expect(pollAttempts).toBe(3);
        expect(downloadAuthorization).toBeNull();
        expect(result.trackingData).toEqual({
            actualModel: "happyhorse-1.1",
            usage: { completionVideoSeconds: 5 },
        });
    });

    it("times out after five minutes of rate-limited polls", async () => {
        vi.useFakeTimers();
        setOpenRouterEnv();

        let pollAttempts = 0;
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
            const href = typeof url === "string" ? url : url.toString();

            if (href === SUBMIT_URL) {
                return new Response(
                    JSON.stringify({
                        id: "job-happyhorse-test",
                        polling_url: POLL_URL,
                        status: "pending",
                    }),
                    { status: 200 },
                );
            }

            if (href === POLL_URL) {
                pollAttempts++;
                return new Response("rate limited", {
                    status: 429,
                    headers: { "Retry-After": "30" },
                });
            }

            return new Response("unexpected URL", { status: 404 });
        });

        const resultPromise = callHappyHorseAPI(
            "a calm ocean at sunrise",
            baseParams,
        );
        const rejection = expect(resultPromise).rejects.toMatchObject({
            status: 504,
        });

        await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
        await rejection;
        expect(pollAttempts).toBe(10);
    });

    it("rejects non-integer durations before submitting a job", async () => {
        setOpenRouterEnv();
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            callHappyHorseAPI("a calm ocean at sunrise", {
                ...baseParams,
                duration: 4.5,
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});

function mockGrokFetch(requests: Record<string, unknown>[]) {
    return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url, init) => {
            const href = typeof url === "string" ? url : url.toString();

            if (href === SUBMIT_URL) {
                requests.push(
                    JSON.parse(init?.body as string) as Record<string, unknown>,
                );
                return new Response(
                    JSON.stringify({
                        id: "job-grok-test",
                        polling_url: GROK_POLL_URL,
                        status: "pending",
                    }),
                    { status: 200 },
                );
            }

            if (href === GROK_POLL_URL) {
                return new Response(
                    JSON.stringify({
                        id: "job-grok-test",
                        polling_url: GROK_POLL_URL,
                        status: "completed",
                        unsigned_urls: [GROK_VIDEO_URL],
                        usage: { cost: 0.35 },
                    }),
                    { status: 200 },
                );
            }

            if (href === GROK_VIDEO_URL) {
                return new Response(new Uint8Array([0, 0, 0, 24]), {
                    status: 200,
                    headers: { "Content-Type": "video/mp4" },
                });
            }

            return new Response("unexpected URL", { status: 404 });
        });
}

describe("OpenRouter Grok Video Pro", () => {
    it("submits the exact 720p route and honors an explicit aspect ratio", async () => {
        setOpenRouterEnv();
        const requests: Record<string, unknown>[] = [];
        mockGrokFetch(requests);

        const result = await callOpenRouterGrokVideoAPI(
            "a calm ocean at sunrise",
            {
                ...baseParams,
                model: "grok-video-pro",
                dimensionsExplicit: false,
                width: 1024,
                height: 1024,
                aspectRatio: "16:9",
            },
        );

        expect(requests).toEqual([
            {
                model: "x-ai/grok-imagine-video",
                prompt: "a calm ocean at sunrise",
                resolution: "720p",
                duration: 5,
                aspect_ratio: "16:9",
            },
        ]);
        expect(result).toMatchObject({
            buffer: Buffer.from([0, 0, 0, 24]),
            mimeType: "video/mp4",
            durationSeconds: 5,
            trackingData: {
                actualModel: "grok-video-pro",
                usage: { completionVideoSeconds: 5 },
            },
        });
    });

    it.each([
        [undefined, "720p"],
        ["480p", "480p"],
        ["1080p", "1080p"],
    ] as const)("routes 1.5 resolution %s as %s", async (resolution, expectedResolution) => {
        setOpenRouterEnv();
        const requests: Record<string, unknown>[] = [];
        mockGrokFetch(requests);

        const result = await callOpenRouterGrokVideoAPI(
            "a calm ocean at sunrise",
            {
                ...baseParams,
                model: "grok-imagine-video-1.5",
                resolution,
            },
        );

        expect(requests[0]).toMatchObject({
            model: "x-ai/grok-imagine-video-1.5",
            resolution: expectedResolution,
        });
        expect(result.trackingData?.actualModel).toBe("grok-imagine-video-1.5");
    });

    it("forwards one start frame and derives ratio from explicit dimensions", async () => {
        setOpenRouterEnv();
        const requests: Record<string, unknown>[] = [];
        mockGrokFetch(requests);

        const result = await callOpenRouterGrokVideoAPI(
            "animate this opening frame",
            {
                ...baseParams,
                model: "grok-video-pro",
                width: 1080,
                height: 720,
                dimensionsExplicit: true,
                aspectRatio: "9:16",
                duration: 15,
                image: ["https://example.com/start.png"],
            },
        );

        expect(requests[0]).toEqual({
            model: "x-ai/grok-imagine-video",
            prompt: "animate this opening frame",
            resolution: "720p",
            duration: 15,
            aspect_ratio: "3:2",
            frame_images: [
                {
                    type: "image_url",
                    image_url: { url: "https://example.com/start.png" },
                    frame_type: "first_frame",
                },
            ],
        });
        expect(result.trackingData?.usage).toEqual({
            promptImageTokens: 1,
            completionVideoSeconds: 15,
        });
    });

    it("keeps the existing 1-15 second duration clamping", async () => {
        setOpenRouterEnv();
        const requests: Record<string, unknown>[] = [];
        mockGrokFetch(requests);

        const result = await callOpenRouterGrokVideoAPI(
            "a calm ocean at sunrise",
            {
                ...baseParams,
                model: "grok-video-pro",
                duration: 99,
            },
        );

        expect(requests[0].duration).toBe(15);
        expect(result.durationSeconds).toBe(15);
    });

    it("enforces a three-minute timeout", async () => {
        vi.useFakeTimers();
        setOpenRouterEnv();

        let pollAttempts = 0;
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
            const href = typeof url === "string" ? url : url.toString();

            if (href === SUBMIT_URL) {
                return new Response(
                    JSON.stringify({
                        id: "job-grok-test",
                        polling_url: GROK_POLL_URL,
                        status: "pending",
                    }),
                    { status: 200 },
                );
            }

            if (href === GROK_POLL_URL) {
                pollAttempts++;
                return new Response("rate limited", {
                    status: 429,
                    headers: { "Retry-After": "30" },
                });
            }

            return new Response("unexpected URL", { status: 404 });
        });

        const resultPromise = callOpenRouterGrokVideoAPI(
            "a calm ocean at sunrise",
            { ...baseParams, model: "grok-video-pro" },
        );
        const rejection = expect(resultPromise).rejects.toMatchObject({
            status: 504,
        });

        await vi.advanceTimersByTimeAsync(3 * 60 * 1000);
        await rejection;
        expect(pollAttempts).toBe(6);
    });

    it.each([
        0.5, 4.5, 15.5,
    ])("rejects non-integer duration %s before submitting a job", async (duration) => {
        setOpenRouterEnv();
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            callOpenRouterGrokVideoAPI("a calm ocean at sunrise", {
                ...baseParams,
                model: "grok-video-pro",
                duration,
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});

describe("OpenRouter Seedance 2.5", () => {
    it.each([
        [undefined, "480p"],
        ["480p", "480p"],
        ["720p", "720p"],
    ] as const)("routes resolution %s as %s", async (resolution, expected) => {
        setOpenRouterEnv();
        const requests: Record<string, unknown>[] = [];
        mockGrokFetch(requests);

        const result = await callOpenRouterSeedance25API(
            "a paper boat on calm water",
            {
                ...baseParams,
                model: "seedance-2.5",
                duration: 4,
                resolution,
                aspectRatio: "4:3",
                audio: true,
                image: [
                    "https://example.com/start.png",
                    "https://example.com/end.png",
                ],
            },
        );

        expect(requests).toEqual([
            {
                model: "bytedance/seedance-2.5",
                prompt: "a paper boat on calm water",
                resolution: expected,
                aspect_ratio: "4:3",
                duration: 4,
                generate_audio: true,
                seed: 42,
                provider: { only: ["Seed"], allow_fallbacks: false },
                frame_images: [
                    {
                        type: "image_url",
                        image_url: {
                            url: "https://example.com/start.png",
                        },
                        frame_type: "first_frame",
                    },
                    {
                        type: "image_url",
                        image_url: {
                            url: "https://example.com/end.png",
                        },
                        frame_type: "last_frame",
                    },
                ],
            },
        ]);
        expect(result).toMatchObject({
            mimeType: "video/mp4",
            durationSeconds: 4,
            trackingData: {
                actualModel: "seedance-2.5",
                usage: { completionVideoSeconds: 4 },
            },
        });
    });

    it.each([
        3, 5, 4.5,
    ])("rejects unsupported duration %s before submitting", async (duration) => {
        setOpenRouterEnv();
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            callOpenRouterSeedance25API("a paper boat", {
                ...baseParams,
                model: "seedance-2.5",
                duration,
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
