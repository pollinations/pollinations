import { afterEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import {
    callHappyHorseAPI,
    callOpenRouterGrokVideoAPI,
    callOpenRouterVeo1080pAPI,
    callOpenRouterVeoAPI,
} from "../../src/image/models/openRouterVideoModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const SUBMIT_URL = "https://openrouter.ai/api/v1/videos";
const POLL_URL = "https://openrouter.ai/api/v1/videos/job-happyhorse-test";
const VIDEO_URL = "https://video.example.com/happyhorse-output.mp4";
const GROK_POLL_URL = "https://openrouter.ai/api/v1/videos/job-grok-test";
const GROK_VIDEO_URL = "https://video.example.com/grok-output.mp4";
const VEO_POLL_URL = "https://openrouter.ai/api/v1/videos/job-veo-test";
const VEO_VIDEO_URL =
    "https://openrouter.ai/api/v1/videos/job-veo-test/content";
const START_FRAME_URL = "https://example.com/start.png";
const END_FRAME_URL = "https://example.com/end.png";
const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
);
const PNG_DATA_URI = `data:image/png;base64,${PNG.toString("base64")}`;

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

function mockVeoFetch(
    requests: Record<string, unknown>[],
    onDownload?: (authorization: string | null) => void,
) {
    return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url, init) => {
            const href = typeof url === "string" ? url : url.toString();

            if (href === START_FRAME_URL || href === END_FRAME_URL) {
                return new Response(PNG, {
                    status: 200,
                    headers: { "Content-Type": "image/png" },
                });
            }

            if (href === SUBMIT_URL) {
                requests.push(
                    JSON.parse(init?.body as string) as Record<string, unknown>,
                );
                return Response.json({
                    id: "job-veo-test",
                    polling_url: VEO_POLL_URL,
                    status: "pending",
                });
            }

            if (href === VEO_POLL_URL) {
                return Response.json({
                    id: "job-veo-test",
                    polling_url: VEO_POLL_URL,
                    status: "completed",
                    unsigned_urls: [VEO_VIDEO_URL],
                    usage: { cost: 0.48 },
                });
            }

            if (href === VEO_VIDEO_URL) {
                onDownload?.(new Headers(init?.headers).get("Authorization"));
                return new Response(new Uint8Array([0, 0, 0, 24]), {
                    status: 200,
                    headers: { "Content-Type": "video/mp4" },
                });
            }

            return new Response("unexpected URL", { status: 404 });
        });
}

describe("OpenRouter Veo 3.1 Fast", () => {
    it("submits the exact 720p route without audio and preserves tracking", async () => {
        setOpenRouterEnv();
        const requests: Record<string, unknown>[] = [];
        let downloadAuthorization: string | null = null;
        mockVeoFetch(requests, (authorization) => {
            downloadAuthorization = authorization;
        });

        const result = await callOpenRouterVeoAPI("a calm ocean at sunrise", {
            ...baseParams,
            model: "veo",
            duration: 4,
            audio: false,
        });

        expect(requests).toEqual([
            {
                model: "google/veo-3.1-fast",
                prompt: "a calm ocean at sunrise",
                resolution: "720p",
                aspect_ratio: "16:9",
                duration: 4,
                generate_audio: false,
            },
        ]);
        expect(downloadAuthorization).toBe("Bearer openrouter-test-key");
        expect(result).toMatchObject({
            buffer: Buffer.from([0, 0, 0, 24]),
            mimeType: "video/mp4",
            durationSeconds: 4,
            trackingData: {
                actualModel: "veo",
                usage: { completionVideoSeconds: 4 },
            },
        });
    });

    it("submits 1080p with audio and validated start and end frames", async () => {
        setOpenRouterEnv();
        const requests: Record<string, unknown>[] = [];
        mockVeoFetch(requests);

        const result = await callOpenRouterVeo1080pAPI(
            "animate between these frames",
            {
                ...baseParams,
                model: "veo-1080p",
                width: 720,
                height: 1280,
                duration: 4,
                audio: true,
                image: [START_FRAME_URL, END_FRAME_URL],
            },
        );

        expect(requests).toEqual([
            {
                model: "google/veo-3.1-fast",
                prompt: "animate between these frames",
                resolution: "1080p",
                aspect_ratio: "9:16",
                duration: 4,
                generate_audio: true,
                frame_images: [
                    {
                        type: "image_url",
                        image_url: { url: PNG_DATA_URI },
                        frame_type: "first_frame",
                    },
                    {
                        type: "image_url",
                        image_url: { url: PNG_DATA_URI },
                        frame_type: "last_frame",
                    },
                ],
            },
        ]);
        expect(result.trackingData).toEqual({
            actualModel: "veo-1080p",
            usage: {
                completionVideoSeconds: 4,
                completionAudioSeconds: 4,
            },
        });
    });

    it.each([
        4, 6, 8,
    ])("accepts the supported %s-second duration", async (duration) => {
        setOpenRouterEnv();
        const requests: Record<string, unknown>[] = [];
        mockVeoFetch(requests);

        const result = await callOpenRouterVeoAPI("a calm ocean at sunrise", {
            ...baseParams,
            model: "veo",
            duration,
            audio: false,
        });

        expect(requests[0].duration).toBe(duration);
        expect(result.durationSeconds).toBe(duration);
    });

    it.each([
        3, 4.5, 5, 9,
    ])("rejects unsupported duration %s before submitting a job", async (duration) => {
        setOpenRouterEnv();
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            callOpenRouterVeoAPI("a calm ocean at sunrise", {
                ...baseParams,
                model: "veo",
                duration,
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("rejects an invalid frame before submitting a paid job", async () => {
        setOpenRouterEnv();
        const requests: Record<string, unknown>[] = [];
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async (url) => {
                const href = typeof url === "string" ? url : url.toString();
                if (href === START_FRAME_URL) {
                    return new Response("not an image", { status: 200 });
                }
                return new Response("unexpected URL", { status: 404 });
            });

        await expect(
            callOpenRouterVeoAPI("animate this frame", {
                ...baseParams,
                model: "veo",
                duration: 4,
                image: [START_FRAME_URL],
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(requests).toHaveLength(0);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
});
