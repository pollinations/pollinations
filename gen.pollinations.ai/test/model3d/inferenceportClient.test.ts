import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncModel3dEnvironment } from "../../src/model3d/env.ts";
import {
    InferenceportError,
    runInferenceport,
} from "../../src/model3d/models/inferenceportClient.ts";
import { toUpstreamError } from "../../src/model3d/modelUtils.ts";

beforeEach(() => {
    syncModel3dEnvironment({
        ...env,
        INFERENCEPORT_API_KEY: "ip_test_token",
    } as CloudflareBindings);
});

afterEach(() => {
    vi.restoreAllMocks();
});

const SUBMIT_URL = "https://api.inferenceport.ai/v1/3d/generations";
const JOB_URL = "https://api.inferenceport.ai/v1/3d/jobs/job_123";

const submitResponse = () =>
    Response.json({ job_id: "job_123", status: "pending" }, { status: 202 });

const jobResponse = (
    status: "pending" | "processing" | "completed" | "failed",
    data?: Record<string, unknown>,
) => Response.json({ job_id: "job_123", status, ...data });

describe("runInferenceport", () => {
    it("retains the full provider body through the public error adapter", async () => {
        const body = JSON.stringify({
            detail: "x".repeat(20000),
            token: "test-only",
        });
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(body, { status: 429 }),
        );
        const error = await runInferenceport({
            model: "trellis2",
            imageUrls: ["https://example.com/a.jpg"],
        }).catch(toUpstreamError);
        expect(error).toMatchObject({
            status: 502,
            upstreamStatus: 429,
            responseBody: body,
        });
        expect(error).toHaveProperty("message", expect.stringContaining(body));
    });

    it("submits an async job and polls for the GLB", async () => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(submitResponse())
            .mockResolvedValueOnce(
                jobResponse("completed", {
                    data: [{ model_glb_b64_bytes: "Zm9v" }],
                }),
            );

        const result = await runInferenceport({
            model: "trellis2",
            imageUrls: ["https://example.com/ref.jpg"],
            resolution: "medium",
        });

        expect(result.glbBase64).toBe("Zm9v");

        const [submitUrl, submitInit] = fetchSpy.mock.calls[0] as [
            string,
            RequestInit,
        ];
        expect(submitUrl).toBe(SUBMIT_URL);
        expect(submitInit.method).toBe("POST");
        expect(new Headers(submitInit.headers).get("Authorization")).toBe(
            "Bearer ip_test_token",
        );
        const body = JSON.parse(submitInit.body as string);
        expect(body.model).toBe("trellis2");
        expect(body.resolution).toBe("medium");
        expect(body.image_urls).toEqual(["https://example.com/ref.jpg"]);

        const [jobUrl, jobInit] = fetchSpy.mock.calls[1] as [
            string,
            RequestInit,
        ];
        expect(jobUrl).toBe(JOB_URL);
        expect(jobInit.method).toBe("GET");
        expect(jobInit.body).toBeUndefined();
    });

    it("retries a 524 status check for the same job without resubmitting", async () => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(submitResponse())
            .mockResolvedValueOnce(new Response("Timed out", { status: 524 }))
            .mockResolvedValueOnce(
                jobResponse("completed", {
                    data: [{ model_ply_b64_bytes: "Zm9v" }],
                }),
            );

        const result = await runInferenceport({
            model: "asset-harvester",
            imageUrls: ["https://example.com/a.jpg"],
        });

        expect(result.plyBase64).toBe("Zm9v");
        expect(
            fetchSpy.mock.calls.map(([url, init]) => [url, init?.method]),
        ).toEqual([
            [SUBMIT_URL, "POST"],
            [JOB_URL, "GET"],
            [JOB_URL, "GET"],
        ]);
    }, 10_000);

    it.each([
        ["submission", 524, 1],
        ["poll", 401, 2],
    ] as const)("does not retry a %s HTTP %i error", async (_stage, status, calls) => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        if (calls === 2) fetchSpy.mockResolvedValueOnce(submitResponse());
        fetchSpy.mockResolvedValue(new Response("Failed", { status }));

        await expect(
            runInferenceport({
                model: "asset-harvester",
                imageUrls: ["https://example.com/a.jpg"],
            }),
        ).rejects.toBeInstanceOf(InferenceportError);
        expect(fetchSpy).toHaveBeenCalledTimes(calls);
    });

    it("does not extend the deadline after a polling error", async () => {
        let now = 0;
        vi.spyOn(Date, "now").mockImplementation(() => now);
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(submitResponse())
            .mockImplementationOnce(async () => {
                now = 300_000;
                return new Response("Timed out", { status: 524 });
            });

        await expect(
            runInferenceport({
                model: "asset-harvester",
                imageUrls: ["https://example.com/a.jpg"],
            }),
        ).rejects.toMatchObject({ status: 504 });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("throws when submission has no job ID", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({ status: "pending" }, { status: 202 }),
        );

        await expect(
            runInferenceport({
                model: "trellis2",
                imageUrls: ["https://example.com/a.jpg"],
            }),
        ).rejects.toMatchObject({ name: "InferenceportError", status: 502 });
    });

    it("throws when a completed job has no output", async () => {
        vi.spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(submitResponse())
            .mockResolvedValueOnce(jobResponse("completed", { data: [{}] }));

        await expect(
            runInferenceport({
                model: "trellis2",
                imageUrls: ["https://example.com/a.jpg"],
            }),
        ).rejects.toThrowError(InferenceportError);
    });

    it("surfaces a failed job", async () => {
        vi.spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(submitResponse())
            .mockResolvedValueOnce(
                jobResponse("failed", { error: "generation failed" }),
            );

        await expect(
            runInferenceport({
                model: "trellis2",
                imageUrls: ["https://example.com/a.jpg"],
            }),
        ).rejects.toMatchObject({
            name: "InferenceportError",
            message: "generation failed",
            status: 502,
        });
    });

    it("rejects an unknown job status", async () => {
        vi.spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(submitResponse())
            .mockResolvedValueOnce(
                Response.json({ job_id: "job_123", status: "unknown" }),
            );

        await expect(
            runInferenceport({
                model: "trellis2",
                imageUrls: ["https://example.com/a.jpg"],
            }),
        ).rejects.toMatchObject({ name: "InferenceportError", status: 502 });
    });

    it("times out after five total minutes", async () => {
        let now = 0;
        vi.spyOn(Date, "now").mockImplementation(() => now);
        vi.spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(submitResponse())
            .mockImplementationOnce(async () => {
                now = 5 * 60 * 1_000;
                return jobResponse("processing");
            });

        await expect(
            runInferenceport({
                model: "trellis2",
                imageUrls: ["https://example.com/a.jpg"],
            }),
        ).rejects.toMatchObject({ name: "InferenceportError", status: 504 });
    });

    it("passes through 402 (insufficient credits)", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ detail: "Insufficient credits" }), {
                status: 402,
            }),
        );

        await expect(
            runInferenceport({
                model: "trellis2",
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
            runInferenceport({
                model: "trellis2",
                imageUrls: ["https://example.com/a.jpg"],
            }),
        ).rejects.toMatchObject({ name: "InferenceportError", status: 429 });
    });

    it.each([
        400, 422,
    ])("maps upstream %i validation errors to 400", async (status) => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({ detail: "Invalid image dimensions" }),
                { status },
            ),
        );

        await expect(
            runInferenceport({
                model: "trellis2",
                imageUrls: ["https://example.com/a.jpg"],
            }),
        ).rejects.toMatchObject({
            name: "InferenceportError",
            status: 400,
        });
    });

    it("maps other HTTP errors to 502", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ detail: "Invalid token" }), {
                status: 401,
            }),
        );

        await expect(
            runInferenceport({
                model: "trellis2",
                imageUrls: ["https://example.com/a.jpg"],
            }),
        ).rejects.toMatchObject({ name: "InferenceportError", status: 502 });
    });
});
