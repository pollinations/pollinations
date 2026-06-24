import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncModel3dEnvironment } from "../../src/model3d/env.ts";
import {
    InferenceportError,
    runInferenceportJob,
} from "../../src/model3d/models/inferenceportClient.ts";

beforeEach(() => {
    syncModel3dEnvironment({
        ...env,
        INFERENCEPORT_API_KEY: "ip_test_token",
    } as CloudflareBindings);
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

const SUBMIT_URL = "https://sharktide-lightning.hf.space/v1/3d/generations";

describe("runInferenceportJob", () => {
    it("submits and returns immediately when job completes synchronously", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({
                    job_id: "job_123",
                    status: "completed",
                    model_glb_b64_bytes: "Zm9v",
                }),
                { status: 200 },
            ),
        );

        const result = await runInferenceportJob({
            model: "tripoSR",
            imageUrls: ["https://example.com/ref.jpg"],
        });

        expect(result.glbBase64).toBe("Zm9v");
        expect(result.jobId).toBe("job_123");

        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(SUBMIT_URL);
        expect(init.method).toBe("POST");
        const headers = new Headers(init.headers);
        expect(headers.get("Authorization")).toBe("Bearer ip_test_token");
        const body = JSON.parse(init.body as string);
        expect(body.model).toBe("tripoSR");
        expect(body.image_urls).toEqual(["https://example.com/ref.jpg"]);
    });

    it("polls /3d/jobs/{job_id} while pending/processing", async () => {
        vi.useFakeTimers();
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        fetchSpy.mockResolvedValueOnce(
            new Response(
                JSON.stringify({ job_id: "job_poll", status: "pending" }),
                { status: 202 },
            ),
        );
        fetchSpy.mockResolvedValueOnce(
            new Response(
                JSON.stringify({ job_id: "job_poll", status: "processing" }),
                { status: 200 },
            ),
        );
        fetchSpy.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    job_id: "job_poll",
                    status: "completed",
                    model_glb_b64_bytes: "YmFy",
                }),
                { status: 200 },
            ),
        );

        const promise = runInferenceportJob({
            model: "tripoSR",
            imageUrls: ["https://example.com/a.jpg"],
        });
        await vi.advanceTimersByTimeAsync(10_000);
        const result = await promise;

        expect(result.glbBase64).toBe("YmFy");
        expect(fetchSpy).toHaveBeenCalledTimes(3);
        const [pollUrl] = fetchSpy.mock.calls[1] as [string];
        expect(pollUrl).toBe(
            "https://sharktide-lightning.hf.space/v1/3d/jobs/job_poll",
        );
        vi.useRealTimers();
    });

    it("throws InferenceportError when job status is failed", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({
                    job_id: "job_fail",
                    status: "failed",
                    error: "generation failed",
                }),
                { status: 200 },
            ),
        );

        await expect(
            runInferenceportJob({
                model: "sf3d",
                imageUrls: ["https://example.com/a.jpg"],
            }),
        ).rejects.toThrowError(InferenceportError);
    });

    it("passes through 402 (insufficient credits)", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ detail: "Insufficient credits" }), {
                status: 402,
            }),
        );

        await expect(
            runInferenceportJob({
                model: "tripoSR",
                imageUrls: ["https://example.com/a.jpg"],
            }),
        ).rejects.toMatchObject({ name: "InferenceportError", status: 402 });
    });

    it("passes through 429 (rate limit)", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ detail: "Rate limited" }), {
                status: 429,
            }),
        );

        await expect(
            runInferenceportJob({
                model: "tripoSR",
                imageUrls: ["https://example.com/a.jpg"],
            }),
        ).rejects.toMatchObject({ name: "InferenceportError", status: 429 });
    });

    it("maps other HTTP errors to 502", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ detail: "Invalid token" }), {
                status: 401,
            }),
        );

        await expect(
            runInferenceportJob({
                model: "tripoSR",
                imageUrls: ["https://example.com/a.jpg"],
            }),
        ).rejects.toMatchObject({ name: "InferenceportError", status: 502 });
    });

    it("times out with 504 when job stays processing past poll budget", async () => {
        vi.useFakeTimers();
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
            async () =>
                new Response(
                    JSON.stringify({
                        job_id: "job_stuck",
                        status: "processing",
                    }),
                    { status: 200 },
                ),
        );

        const promise = runInferenceportJob({
            model: "tripoSR",
            imageUrls: ["https://example.com/a.jpg"],
        });
        const assertion = expect(promise).rejects.toMatchObject({
            name: "InferenceportError",
            status: 504,
        });
        await vi.advanceTimersByTimeAsync(90 * 5_000 + 1_000);
        await assertion;
        expect(fetchSpy.mock.calls.length).toBeLessThanOrEqual(91);
        vi.useRealTimers();
    });
});
