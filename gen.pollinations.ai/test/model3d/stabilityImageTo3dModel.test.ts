import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncModel3dEnvironment } from "../../src/model3d/env.ts";
import { mediaHeaders } from "../../src/model3d/handler.ts";
import {
    callSf3d,
    callTripoSr,
} from "../../src/model3d/models/stabilityImageTo3dModel.ts";
import type { Model3dParams } from "../../src/model3d/params.ts";

beforeEach(() => {
    syncModel3dEnvironment({
        ...env,
        INFERENCEPORT_API_KEY: "ip_test_token",
    } as CloudflareBindings);
});

afterEach(() => {
    vi.restoreAllMocks();
});

function params(model: string): Model3dParams {
    return {
        model,
        resolution: "low",
        image: ["https://example.com/ref.jpg"],
        safe: false,
    };
}

function mockAsyncSuccess(glbB64 = "Z2xURg==", cost?: number) {
    return vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
            Response.json(
                { job_id: "job_789", status: "pending" },
                { status: 202 },
            ),
        )
        .mockResolvedValueOnce(
            Response.json({
                job_id: "job_789",
                status: "completed",
                data: [{ model_glb_b64_bytes: glbB64 }],
                usage: { payg_credits_charged: cost },
            }),
        );
}

describe("Stability image-to-3D models", () => {
    it.each([
        ["stability-ai/sf3d", "sf3d", callSf3d],
        ["stability-ai/triposr", "tripoSR", callTripoSr],
    ])(
        "submits %s to InferencePort model %s",
        async (model, upstream, call) => {
            const fetchSpy = mockAsyncSuccess();

            const result = await call(params(model));

            const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
            expect(url).toContain("api.inferenceport.ai/v1/3d/generations");
            expect(JSON.parse(init.body as string)).toMatchObject({
                model: upstream,
                image_urls: ["https://example.com/ref.jpg"],
            });
            expect(result.contentType).toBe("model/gltf-binary");
            expect(result.buffer.length).toBeGreaterThan(0);
        },
    );

    it("preserves the completed job's charge through the billing headers", async () => {
        mockAsyncSuccess("Z2xURg==", 0.07);
        const args = params("stability-ai/sf3d");
        const result = await callSf3d(args);
        const headers = mediaHeaders("", args, result);

        expect(headers.get("x-usage-provider-billable-units")).toBe("0.07");
        expect(headers.get("x-usage-completion-image-tokens")).toBe("1");
    });

    it("rejects a completed job without GLB output", async () => {
        vi.spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(
                Response.json(
                    { job_id: "job_empty", status: "pending" },
                    { status: 202 },
                ),
            )
            .mockResolvedValueOnce(
                Response.json({
                    job_id: "job_empty",
                    status: "completed",
                    data: [{ model_ply_b64_bytes: "cGx5" }],
                }),
            );

        await expect(
            callTripoSr(params("stability-ai/triposr")),
        ).rejects.toThrow("no GLB output");
    });

    it("requires a reference image", async () => {
        await expect(
            callSf3d({ ...params("stability-ai/sf3d"), image: [] }),
        ).rejects.toThrow(/reference image/);
    });
});
