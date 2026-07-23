import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as imageUtil from "../../src/image/util.ts";
import { syncModel3dEnvironment } from "../../src/model3d/env.ts";
import { callTrellis2 } from "../../src/model3d/models/trellis2Model.ts";
import type { Model3dParams } from "../../src/model3d/params.ts";

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

function params(model: string): Model3dParams {
    return {
        model,
        image: ["https://example.com/ref.jpg"],
        safe: false,
    };
}

const SUBMIT_URL = "https://api.inferenceport.ai/v1/3d/generations";
const JOB_URL = "https://api.inferenceport.ai/v1/3d/jobs/";

function completedBody(jobId: string, glbB64: string) {
    return JSON.stringify({
        job_id: jobId,
        status: "completed",
        model: "trellis2",
        created_at: 1718300000.0,
        completed_at: 1718300312.5,
        data: [{ model_glb_b64_bytes: glbB64 }],
    });
}

function mockAsyncFlow(glbB64 = "aW5mZXJlbmNlcG9ydA==") {
    const jobId = "job_trellis_test";
    return vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    job_id: jobId,
                    status: "pending",
                    created_at: 1718300000.0,
                }),
                { status: 202 },
            ),
        )
        .mockResolvedValueOnce(
            new Response(completedBody(jobId, glbB64), { status: 200 }),
        )
        .mockResolvedValueOnce(
            new Response(completedBody(jobId, glbB64), { status: 200 }),
        );
}

describe("callTrellis2", () => {
    it("submits async job and returns GLB from completed poll", async () => {
        const fetchSpy = mockAsyncFlow();

        await callTrellis2(params("trellis-2-medium"));

        const [url1, init1] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url1).toBe(SUBMIT_URL);
        expect(init1.method).toBe("POST");
        const body = JSON.parse(init1.body as string);
        expect(body.model).toBe("trellis2");
        expect(body.resolution).toBe("medium");

        const [url2] = fetchSpy.mock.calls[1] as [string, RequestInit];
        expect(url2).toContain(JOB_URL);
    });

    it.each([
        ["trellis-2-low", "low"],
        ["trellis-2-medium", "medium"],
        ["trellis-2-high", "high"],
    ])("sends correct resolution for %s", async (modelId, expectedResolution) => {
        const fetchSpy = mockAsyncFlow();

        await callTrellis2(params(modelId));

        const body = JSON.parse(
            (fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string,
        );
        expect(body.resolution).toBe(expectedResolution);
    });

    it("returns a GLB buffer from the async response", async () => {
        mockAsyncFlow();

        const result = await callTrellis2(params("trellis-2-low"));

        expect(result.contentType).toBe("model/gltf-binary");
        expect(result.buffer.length).toBeGreaterThan(0);
    });

    it("throws when no image is provided", async () => {
        await expect(
            callTrellis2({
                model: "trellis-2-low",
                image: [],
                safe: false,
            }),
        ).rejects.toBeTruthy();
    });

    it("does not forward seed (inferenceport support unconfirmed)", async () => {
        const fetchSpy = mockAsyncFlow();

        await callTrellis2({ ...params("trellis-2-low"), seed: 12345 });

        const body = JSON.parse(
            (fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string,
        );
        expect(body.seed).toBeUndefined();
    });
});
