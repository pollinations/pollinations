import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncImageEnvironment } from "../../src/image/handler.ts";
import {
    ReplicateError,
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
    it("returns when initial response is succeeded", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({
                    id: "pred_123",
                    status: "succeeded",
                    output: "https://replicate.delivery/x/video.mp4",
                    metrics: {
                        predict_time: 12.5,
                        video_output_duration_seconds: 8,
                    },
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
        expect(result.videoOutputDurationSeconds).toBe(8);
        expect(result.id).toBe("pred_123");

        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(OFFICIAL_PREDICTION_URL);
        expect(init.method).toBe("POST");
        const headers = new Headers(init.headers);
        expect(headers.get("Authorization")).toBe("Bearer r8_test_token");
        expect(headers.get("Prefer")).toBe("wait=60");
        const body = JSON.parse(init.body as string);
        expect(body.input).toEqual({ prompt: "test" });
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

    it("throws ReplicateError on prediction status: failed", async () => {
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
        ).rejects.toThrowError(ReplicateError);
    });

    it.each([
        [
            "content filter rejection (E005)",
            "ModelError: The input or output was flagged as sensitive. Please try again with different inputs. (E005)",
        ],
        [
            "input validation error (e.g. expired image URL)",
            "Input validation error: 403 Client Error: Forbidden for url: https://example.com/img.jpg",
        ],
    ])("classifies %s as 400 (user input error)", async (_, errorMessage) => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({
                    id: "pred_user_err",
                    status: "failed",
                    error: errorMessage,
                }),
                { status: 201 },
            ),
        );

        await expect(
            runReplicatePrediction({
                model: MODEL,
                input: { prompt: "x" },
            }),
        ).rejects.toMatchObject({
            name: "ReplicateError",
            status: 400,
        });
    });

    it("classifies generic prediction failures as 500 (upstream error)", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({
                    id: "pred_upstream_err",
                    status: "failed",
                    error: "CUDA out of memory",
                }),
                { status: 201 },
            ),
        );

        await expect(
            runReplicatePrediction({ model: MODEL, input: { prompt: "x" } }),
        ).rejects.toMatchObject({
            name: "ReplicateError",
            status: 500,
        });
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
                JSON.stringify({ id: "pred_poll", status: "processing" }),
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
        });
        await vi.advanceTimersByTimeAsync(20_000);
        const result = await promise;

        expect(result.output).toBe("https://replicate.delivery/y/done.mp4");
        expect(fetchSpy).toHaveBeenCalledTimes(3);
        const [pollUrl] = fetchSpy.mock.calls[1] as [string];
        expect(pollUrl).toBe(
            "https://api.replicate.com/v1/predictions/pred_poll",
        );
        vi.useRealTimers();
    });

    it("maps Replicate auth/infra HTTP errors to 502", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ detail: "Invalid token" }), {
                status: 401,
            }),
        );

        await expect(
            runReplicatePrediction({ model: MODEL, input: { prompt: "x" } }),
        ).rejects.toMatchObject({
            name: "ReplicateError",
            status: 502,
        });
    });

    it("passes through Replicate 422 input validation errors", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({ detail: "Invalid aspect_ratio: 9:21" }),
                { status: 422 },
            ),
        );

        await expect(
            runReplicatePrediction({ model: MODEL, input: { prompt: "x" } }),
        ).rejects.toMatchObject({
            name: "ReplicateError",
            status: 422,
        });
    });

    it("passes through Replicate 429 rate-limit errors", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ detail: "Rate limited" }), {
                status: 429,
            }),
        );

        await expect(
            runReplicatePrediction({ model: MODEL, input: { prompt: "x" } }),
        ).rejects.toMatchObject({
            name: "ReplicateError",
            status: 429,
        });
    });
});
