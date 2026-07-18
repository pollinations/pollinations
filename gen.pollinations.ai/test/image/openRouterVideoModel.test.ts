import { afterEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import { callHappyHorseAPI } from "../../src/image/models/openRouterVideoModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const SUBMIT_URL = "https://openrouter.ai/api/v1/videos";
const POLL_URL = "https://openrouter.ai/api/v1/videos/job-happyhorse-test";
const VIDEO_URL = "https://video.example.com/happyhorse-output.mp4";

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
