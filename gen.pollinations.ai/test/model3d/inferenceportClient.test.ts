import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncModel3dEnvironment } from "../../src/model3d/env.ts";
import {
    checkInferenceportJob,
    InferenceportError,
    runInferenceportSync,
    submitInferenceportJob,
} from "../../src/model3d/models/inferenceportClient.ts";

beforeEach(() => {
    syncModel3dEnvironment({
        ...env,
        INFERENCEPORT_API_KEY: "ip_test_token",
    } as CloudflareBindings);
});

afterEach(() => {
    vi.restoreAllMocks();
});

const SUBMIT_URL = "https://sharktide-lightning.hf.space/v1/3d/generations";

describe("runInferenceportSync", () => {
    it("POSTs to ?sync=true and returns GLB from data[0]", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({
                    data: [{ model_glb_b64_bytes: "Zm9v" }],
                }),
                { status: 200 },
            ),
        );

        const result = await runInferenceportSync({
            model: "trellis2",
            imageUrls: ["https://example.com/ref.jpg"],
            resolution: "medium",
        });

        expect(result.glbBase64).toBe("Zm9v");

        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(`${SUBMIT_URL}?sync=true`);
        expect(init.method).toBe("POST");
        const headers = new Headers(init.headers);
        expect(headers.get("Authorization")).toBe("Bearer ip_test_token");
        const body = JSON.parse(init.body as string);
        expect(body.model).toBe("trellis2");
        expect(body.resolution).toBe("medium");
        expect(body.image_urls).toEqual(["https://example.com/ref.jpg"]);
    });

    it("throws when sync response has no output", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ data: [{}] }), { status: 200 }),
        );

        await expect(
            runInferenceportSync({
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
            runInferenceportSync({
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
            runInferenceportSync({
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
            runInferenceportSync({
                model: "trellis2",
                imageUrls: ["https://example.com/a.jpg"],
            }),
        ).rejects.toMatchObject({ name: "InferenceportError", status: 502 });
    });
});

describe("async job API (submitInferenceportJob / checkInferenceportJob)", () => {
    it("submit returns pending job state with a job_id", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({ job_id: "job_123", status: "pending" }),
                { status: 202 },
            ),
        );

        const state = await submitInferenceportJob({
            model: "trellis2",
            imageUrls: ["https://example.com/ref.jpg"],
        });

        expect(state.status).toBe("pending");
        expect(state.jobId).toBe("job_123");
    });

    it("checkInferenceportJob returns completed state with GLB from data[0]", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({
                    job_id: "job_123",
                    status: "completed",
                    data: [{ model_glb_b64_bytes: "YmFy" }],
                }),
                { status: 200 },
            ),
        );

        const state = await checkInferenceportJob("job_123");

        expect(state.status).toBe("completed");
        if (state.status === "completed") {
            expect(state.glbBase64).toBe("YmFy");
        }
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

        await expect(checkInferenceportJob("job_fail")).rejects.toThrowError(
            InferenceportError,
        );
    });
});
