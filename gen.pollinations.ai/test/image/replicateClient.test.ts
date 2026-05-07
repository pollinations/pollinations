import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncImageEnvironment } from "../../src/image/handler.ts";
import {
    ReplicateAuthError,
    ReplicateModelError,
    ReplicateRateLimitError,
    ReplicateTimeoutError,
    runReplicatePrediction,
} from "../../src/image/utils/replicateClient.ts";

beforeEach(() => {
    syncImageEnvironment({
        ...env,
        REPLICATE_API_TOKEN: "r8_test_token",
    } as CloudflareBindings);
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

const PINNED_PREDICTION_URL = "https://api.replicate.com/v1/predictions";
const MODEL = "bytedance/seedance-2.0";
const OFFICIAL_PREDICTION_URL = `https://api.replicate.com/v1/models/${MODEL}/predictions`;

describe("runReplicatePrediction", () => {
    it("returns immediately when initial response is succeeded", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({
                    id: "pred_123",
                    status: "succeeded",
                    output: "https://replicate.delivery/x/video.mp4",
                    metrics: { predict_time: 12.5 },
                }),
                { status: 201 },
            ),
        );

        const result = await runReplicatePrediction<{ prompt: string }, string>(
            {
                model: MODEL,
                input: { prompt: "test" },
            },
        );

        expect(result.output).toBe("https://replicate.delivery/x/video.mp4");
        expect(result.predictTimeSeconds).toBe(12.5);
        expect(result.id).toBe("pred_123");

        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        // Official-model endpoint (no version pinned); model name is in the URL, not the body
        expect(url).toBe(OFFICIAL_PREDICTION_URL);
        expect(init.method).toBe("POST");
        const headers = new Headers(init.headers);
        expect(headers.get("Authorization")).toBe("Bearer r8_test_token");
        expect(headers.get("Prefer")).toBe("wait=60");
        const body = JSON.parse(init.body as string);
        expect(body.input).toEqual({ prompt: "test" });
        expect(body.model).toBeUndefined();
        expect(body.version).toBeUndefined();
    });

    it("uses /v1/predictions with version in body when version is pinned", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({
                    id: "pred_pinned",
                    status: "succeeded",
                    output: "https://replicate.delivery/v/pinned.mp4",
                    metrics: { predict_time: 8 },
                }),
                { status: 201 },
            ),
        );

        await runReplicatePrediction<{ prompt: string }, string>({
            model: MODEL,
            version: "abc123def456",
            input: { prompt: "test" },
        });

        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(PINNED_PREDICTION_URL);
        const body = JSON.parse(init.body as string);
        expect(body.version).toBe("abc123def456");
        expect(body.input).toEqual({ prompt: "test" });
    });

    it("polls /predictions/{id} when initial response is processing", async () => {
        vi.useFakeTimers();
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        fetchSpy.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    id: "pred_poll",
                    status: "processing",
                    urls: {
                        get: "https://api.replicate.com/v1/predictions/pred_poll",
                    },
                }),
                { status: 201 },
            ),
        );
        fetchSpy.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    id: "pred_poll",
                    status: "processing",
                }),
                { status: 200 },
            ),
        );
        fetchSpy.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    id: "pred_poll",
                    status: "succeeded",
                    output: "https://replicate.delivery/y/done.mp4",
                    metrics: { predict_time: 30 },
                }),
                { status: 200 },
            ),
        );

        const promise = runReplicatePrediction<{ prompt: string }, string>({
            model: MODEL,
            input: { prompt: "test" },
            pollIntervalMs: 100,
        });
        await vi.advanceTimersByTimeAsync(500);
        const result = await promise;

        expect(result.output).toBe("https://replicate.delivery/y/done.mp4");
        expect(fetchSpy).toHaveBeenCalledTimes(3);
        const [pollUrl] = fetchSpy.mock.calls[1] as [string];
        expect(pollUrl).toBe(
            "https://api.replicate.com/v1/predictions/pred_poll",
        );
    });

    it("throws ReplicateModelError on prediction status: failed", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({
                    id: "pred_fail",
                    status: "failed",
                    error: "model returned NSFW content",
                }),
                { status: 201 },
            ),
        );

        await expect(
            runReplicatePrediction({ model: MODEL, input: { prompt: "x" } }),
        ).rejects.toThrowError(ReplicateModelError);
    });

    it("throws ReplicateAuthError on 401", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ detail: "Invalid token" }), {
                status: 401,
            }),
        );

        await expect(
            runReplicatePrediction({ model: MODEL, input: { prompt: "x" } }),
        ).rejects.toThrowError(ReplicateAuthError);
    });

    it("retries on 429 honoring Retry-After then succeeds", async () => {
        vi.useFakeTimers();
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        fetchSpy.mockResolvedValueOnce(
            new Response("rate limited", {
                status: 429,
                headers: { "Retry-After": "1" },
            }),
        );
        fetchSpy.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    id: "pred_retry",
                    status: "succeeded",
                    output: "https://replicate.delivery/r/ok.mp4",
                    metrics: { predict_time: 5 },
                }),
                { status: 201 },
            ),
        );

        const promise = runReplicatePrediction<{ prompt: string }, string>({
            model: MODEL,
            input: { prompt: "test" },
        });
        await vi.advanceTimersByTimeAsync(1500);
        const result = await promise;

        expect(result.output).toBe("https://replicate.delivery/r/ok.mp4");
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("throws ReplicateRateLimitError after exceeding retry budget", async () => {
        vi.useFakeTimers();
        // Fresh Response each call - bodies can only be consumed once
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async () =>
                new Response("rate limited", {
                    status: 429,
                    headers: { "Retry-After": "0" },
                }),
        );

        const promise = runReplicatePrediction({
            model: MODEL,
            input: { prompt: "x" },
        });
        const assertion = expect(promise).rejects.toThrowError(
            ReplicateRateLimitError,
        );
        await vi.advanceTimersByTimeAsync(10_000);
        await assertion;
    });

    it("throws ReplicateTimeoutError when polling exceeds timeoutMs", async () => {
        vi.useFakeTimers();
        const processingBody = JSON.stringify({
            id: "pred_slow",
            status: "processing",
            urls: {
                get: "https://api.replicate.com/v1/predictions/pred_slow",
            },
        });
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async () => new Response(processingBody, { status: 201 }),
        );

        const promise = runReplicatePrediction({
            model: MODEL,
            input: { prompt: "x" },
            pollIntervalMs: 50,
            timeoutMs: 200,
        });
        const assertion = expect(promise).rejects.toThrowError(
            ReplicateTimeoutError,
        );
        await vi.advanceTimersByTimeAsync(500);
        await assertion;
    });
});
