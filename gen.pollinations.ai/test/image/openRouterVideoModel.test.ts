import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { calculateUsageBilling } from "@shared/registry/registry.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import {
    callHappyHorseAPI,
    callHeyGenVideoAPI,
    callOpenRouterGrokVideoAPI,
} from "../../src/image/models/openRouterVideoModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const SUBMIT_URL = "https://openrouter.ai/api/v1/videos";
const POLL_URL = "https://openrouter.ai/api/v1/videos/job-happyhorse-test";
const VIDEO_URL = "https://video.example.com/happyhorse-output.mp4";
const GROK_POLL_URL = "https://openrouter.ai/api/v1/videos/job-grok-test";
const GROK_VIDEO_URL = "https://video.example.com/grok-output.mp4";

const baseParams: ImageParams = {
    model: "alibaba/happyhorse-1.1",
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

function mockHappyHorseSuccess(
    requests: Record<string, unknown>[],
    providerCost?: number,
) {
    return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url, init) => {
            const href = typeof url === "string" ? url : url.toString();
            if (href === SUBMIT_URL) {
                requests.push(
                    JSON.parse(init?.body as string) as Record<string, unknown>,
                );
                return Response.json({
                    id: "job-happyhorse-test",
                    polling_url: POLL_URL,
                    status: "pending",
                });
            }
            if (href === POLL_URL) {
                return Response.json({
                    id: "job-happyhorse-test",
                    polling_url: POLL_URL,
                    status: "completed",
                    unsigned_urls: [VIDEO_URL],
                    ...(providerCost !== undefined && {
                        usage: { cost: providerCost },
                    }),
                });
            }
            if (href === VIDEO_URL) {
                return new Response(new Uint8Array([0, 0, 0, 24]), {
                    headers: { "Content-Type": "video/mp4" },
                });
            }
            return new Response("unexpected URL", { status: 404 });
        });
}

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("openRouterVideoModel", () => {
    it("sends HeyGen Video 1 at 480p by default and falls back to requested seconds when cost is absent", async () => {
        setOpenRouterEnv();
        const requests: Record<string, unknown>[] = [];
        mockHappyHorseSuccess(requests);

        const result = await callHeyGenVideoAPI("a paper boat", {
            ...baseParams,
            model: "heygen/heygen-video-1",
            duration: 7,
        });

        expect(requests[0]).toEqual({
            model: "heygen/heygen-video-1",
            prompt: "a paper boat",
            resolution: "480p",
            aspect_ratio: "16:9",
            duration: 7,
            seed: 42,
        });
        expect(result.trackingData).toEqual({
            actualModel: "heygen/heygen-video-1:openrouter",
            usage: { completionVideoSeconds: 7 },
        });
    });

    it("bills HeyGen from OpenRouter's reported cost", async () => {
        setOpenRouterEnv();
        mockHappyHorseSuccess([], 0.06);

        const result = await callHeyGenVideoAPI("a paper boat", {
            ...baseParams,
            model: "heygen/heygen-video-1",
            duration: 7,
        });

        expect(result.trackingData).toEqual({
            actualModel: "heygen/heygen-video-1:openrouter",
            usage: { completionVideoSeconds: 7 },
            providerBilling: { units: 0.06, unitCost: 1.055 },
        });
        const billing = calculateUsageBilling({
            model: "heygen/heygen-video-1",
            usage: result.trackingData.usage,
            servedBy: IMAGE_SERVICES["heygen/heygen-video-1:openrouter"],
            input: {
                resolution: "480p",
                providerBilling: result.trackingData.providerBilling,
            },
        });
        expect(billing.cost.totalCost).toBeCloseTo(0.0633, 12);
        expect(billing.price.totalPrice).toBeCloseTo(0.0633, 12);
    });

    it("maps HeyGen Video 1 resolution, portrait ratio and first frame", async () => {
        setOpenRouterEnv();
        const requests: Record<string, unknown>[] = [];
        mockHappyHorseSuccess(requests);

        await callHeyGenVideoAPI("animate this", {
            ...baseParams,
            model: "heygen/heygen-video-1",
            width: 720,
            height: 1280,
            resolution: "768p",
            image: ["https://example.com/start.png"],
        });

        expect(requests[0]).toMatchObject({
            resolution: "768p",
            aspect_ratio: "9:16",
            frame_images: [
                {
                    type: "image_url",
                    image_url: { url: "https://example.com/start.png" },
                    frame_type: "first_frame",
                },
            ],
        });
    });

    it("rejects a HeyGen Video 1 duration outside 5 to 15 seconds", async () => {
        setOpenRouterEnv();
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            callHeyGenVideoAPI("a paper boat", {
                ...baseParams,
                model: "heygen/heygen-video-1",
                duration: 4,
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("bills a short HappyHorse clip from OpenRouter's reported cost", async () => {
        setOpenRouterEnv();
        // OpenRouter bills 5 seconds for a 3-second clip.
        mockHappyHorseSuccess([], 0.494);

        const result = await callHappyHorseAPI("a paper boat", {
            ...baseParams,
            duration: 3,
        });

        expect(result.trackingData).toEqual({
            actualModel: "alibaba/happyhorse-1.1",
            usage: { completionVideoSeconds: 3 },
            providerBilling: { units: 0.494, unitCost: 1.055 },
        });
        const billing = calculateUsageBilling({
            model: "alibaba/happyhorse-1.1",
            usage: result.trackingData.usage,
            servedBy: IMAGE_SERVICES["alibaba/happyhorse-1.1"],
            input: { providerBilling: result.trackingData.providerBilling },
        });
        expect(billing.cost.totalCost).toBeCloseTo(0.52117, 12);
        expect(billing.price.totalPrice).toBeCloseTo(0.52117, 8);
    });

    it("maps the HappyHorse image to a first-frame request", async () => {
        setOpenRouterEnv();
        const requests: Record<string, unknown>[] = [];
        mockHappyHorseSuccess(requests);

        await callHappyHorseAPI("animate this opening frame", {
            ...baseParams,
            image: ["https://example.com/start.png"],
        });

        expect(requests[0].frame_images).toEqual([
            {
                type: "image_url",
                image_url: { url: "https://example.com/start.png" },
                frame_type: "first_frame",
            },
        ]);
    });

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
            actualModel: "alibaba/happyhorse-1.1",
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
    it.each([
        [undefined, "720p"],
        ["480p", "480p"],
        ["1080p", "1080p"],
    ] as const)(
        "routes 1.5 Lite resolution %s as %s",
        async (resolution, expectedResolution) => {
            setOpenRouterEnv();
            const requests: Record<string, unknown>[] = [];
            mockGrokFetch(requests);

            const result = await callOpenRouterGrokVideoAPI(
                "a calm ocean at sunrise",
                {
                    ...baseParams,
                    model: "x-ai/grok-imagine-video-1.5-lite:openrouter",
                    resolution,
                },
            );

            expect(requests[0]).toMatchObject({
                model: "x-ai/grok-imagine-video-1.5-lite",
                resolution: expectedResolution,
            });
            expect(result.trackingData?.actualModel).toBe(
                "x-ai/grok-imagine-video-1.5-lite:openrouter",
            );
        },
    );

    it("routes the 1.5 Lite fallback to the OpenRouter Lite model", async () => {
        setOpenRouterEnv();
        const requests: Record<string, unknown>[] = [];
        mockGrokFetch(requests);

        const result = await callOpenRouterGrokVideoAPI("a calm ocean", {
            ...baseParams,
            model: "x-ai/grok-imagine-video-1.5-lite:openrouter",
            resolution: "1080p",
        });

        expect(requests[0]).toMatchObject({
            model: "x-ai/grok-imagine-video-1.5-lite",
            resolution: "1080p",
        });
        expect(result.trackingData?.actualModel).toBe(
            "x-ai/grok-imagine-video-1.5-lite:openrouter",
        );
    });

    it.each([
        [
            "x-ai/grok-imagine-video-1.5-lite:openrouter",
            "x-ai/grok-imagine-video-1.5-lite",
        ],
    ] as const)("%s forwards one start frame", async (model, upstreamModel) => {
        setOpenRouterEnv();
        const requests: Record<string, unknown>[] = [];
        mockGrokFetch(requests);

        const result = await callOpenRouterGrokVideoAPI(
            "animate this opening frame",
            {
                ...baseParams,
                model,
                width: 1080,
                height: 720,
                dimensionsExplicit: true,
                aspectRatio: "9:16",
                duration: 15,
                image: ["https://example.com/start.png"],
            },
        );

        expect(requests[0]).toEqual({
            model: upstreamModel,
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
                model: "x-ai/grok-imagine-video-1.5",
                duration: 99,
            },
        );

        expect(requests[0].duration).toBe(15);
        expect(result.durationSeconds).toBe(15);
    });

    it.each([["x-ai/grok-imagine-video-1.5-lite:openrouter", 3]] as const)(
        "enforces a %s timeout of %i minutes",
        async (model, minutes) => {
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
                { ...baseParams, model },
            );
            const rejection = expect(resultPromise).rejects.toMatchObject({
                status: 504,
            });

            await vi.advanceTimersByTimeAsync(minutes * 60 * 1000);
            await rejection;
            expect(pollAttempts).toBe(minutes * 2);
        },
    );

    it.each([0.5, 4.5, 15.5])(
        "rejects non-integer duration %s before submitting a job",
        async (duration) => {
            setOpenRouterEnv();
            const fetchSpy = vi.spyOn(globalThis, "fetch");

            await expect(
                callOpenRouterGrokVideoAPI("a calm ocean at sunrise", {
                    ...baseParams,
                    model: "x-ai/grok-imagine-video-1.5",
                    duration,
                }),
            ).rejects.toMatchObject({ status: 400 });
            expect(fetchSpy).not.toHaveBeenCalled();
        },
    );
});
