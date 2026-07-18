import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as imageUtil from "../../src/image/util.ts";
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
    vi.spyOn(imageUtil, "sleep").mockResolvedValue(undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

const SUBMIT_URL = "https://api.inferenceport.ai/v1/3d/generations";
const JOB_URL = "https://api.inferenceport.ai/v1/3d/jobs/";

function submitResponse(jobId = "job_abc123") {
    return new Response(
        JSON.stringify({
            job_id: jobId,
            status: "pending",
            created_at: 1718300000.0,
        }),
        { status: 202 },
    );
}

function completedResponse(jobId: string, glbB64: string) {
    return new Response(
        JSON.stringify({
            job_id: jobId,
            status: "completed",
            model: "trellis2",
            created_at: 1718300000.0,
            completed_at: 1718300312.5,
            data: [{ model_glb_b64_bytes: glbB64 }],
        }),
        { status: 200 },
    );
}

function processingResponse(jobId: string) {
    return new Response(
        JSON.stringify({
            job_id: jobId,
            status: "processing",
            model: "trellis2",
            created_at: 1718300000.0,
            completed_at: null,
        }),
        { status: 200 },
    );
}

describe("runInferenceportJob", () => {
    it("submits a job then polls until completed", async () => {
        const jobId = "job_xyz789";
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(submitResponse(jobId))
            .mockResolvedValueOnce(processingResponse(jobId))
            .mockResolvedValueOnce(completedResponse(jobId, "Zm9v"))
            .mockResolvedValueOnce(completedResponse(jobId, "Zm9v"));

        const result = await runInferenceportJob({
            model: "trellis2",
            imageUrls: ["https://example.com/ref.jpg"],
            resolution: "medium",
        });

        expect(result.glbBase64).toBe("Zm9v");

        const [url1, init1] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url1).toBe(SUBMIT_URL);
        expect(init1.method).toBe("POST");
        const headers = new Headers(init1.headers);
        expect(headers.get("Authorization")).toBe("Bearer ip_test_token");
        const body = JSON.parse(init1.body as string);
        expect(body.model).toBe("trellis2");
        expect(body.resolution).toBe("medium");
        expect(body.image_urls).toEqual(["https://example.com/ref.jpg"]);

        const [url2, init2] = fetchSpy.mock.calls[1] as [string, RequestInit];
        expect(url2).toBe(`${JOB_URL}${jobId}`);
        expect(init2.method).toBe("GET");

        const [url3] = fetchSpy.mock.calls[2] as [string, RequestInit];
        expect(url3).toBe(`${JOB_URL}${jobId}`);
    });

    it("throws when completed response has no output", async () => {
        const jobId = "job_empty";
        vi.spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(submitResponse(jobId))
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        job_id: jobId,
                        status: "completed",
                        model: "trellis2",
                        created_at: 1718300000.0,
                        completed_at: 1718300312.5,
                        data: [{}],
                    }),
                    { status: 200 },
                ),
            )
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        job_id: jobId,
                        status: "completed",
                        model: "trellis2",
                        created_at: 1718300000.0,
                        completed_at: 1718300312.5,
                        data: [{}],
                    }),
                    { status: 200 },
                ),
            );

        await expect(
            runInferenceportJob({
                model: "trellis2",
                imageUrls: ["https://example.com/a.jpg"],
            }),
        ).rejects.toThrowError(InferenceportError);
    });

    it("throws when job fails", async () => {
        const jobId = "job_fail";
        vi.spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(submitResponse(jobId))
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        job_id: jobId,
                        status: "failed",
                        model: "trellis2",
                        created_at: 1718300000.0,
                        completed_at: 1718300045.1,
                        error: "TripoSR job abc123 failed: out of memory",
                    }),
                    { status: 200 },
                ),
            );

        await expect(
            runInferenceportJob({
                model: "trellis2",
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
            runInferenceportJob({
                model: "trellis2",
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
                model: "trellis2",
                imageUrls: ["https://example.com/a.jpg"],
            }),
        ).rejects.toMatchObject({ name: "InferenceportError", status: 502 });
    });
});
