import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncModel3dEnvironment } from "../../src/model3d/env.ts";
import {
    extractFalModelMesh,
    FalError,
    runFalJob,
} from "../../src/model3d/models/falClient.ts";

beforeEach(() => {
    syncModel3dEnvironment({
        ...env,
        FAL_KEY: "fal_test_key",
    } as CloudflareBindings);
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe("runFalJob", () => {
    it("submits, polls status, and fetches the final result", async () => {
        vi.useFakeTimers();
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        fetchSpy.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    request_id: "req_1",
                    status_url:
                        "https://queue.fal.run/fal-ai/hyper3d/rodin/requests/req_1/status",
                    response_url:
                        "https://queue.fal.run/fal-ai/hyper3d/rodin/requests/req_1",
                }),
                { status: 202 },
            ),
        );
        fetchSpy.mockResolvedValueOnce(
            new Response(JSON.stringify({ status: "IN_QUEUE" }), {
                status: 200,
            }),
        );
        fetchSpy.mockResolvedValueOnce(
            new Response(JSON.stringify({ status: "COMPLETED" }), {
                status: 200,
            }),
        );
        fetchSpy.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    model_mesh: {
                        url: "https://v3.fal.media/files/rabbit/model.glb",
                        content_type: "model/gltf-binary",
                    },
                }),
                { status: 200 },
            ),
        );

        const promise = runFalJob({
            endpoint: "fal-ai/hyper3d/rodin",
            input: { prompt: "a cube" },
        });
        await vi.advanceTimersByTimeAsync(10_000);
        const result = await promise;

        const mesh = extractFalModelMesh(result);
        expect(mesh.url).toBe("https://v3.fal.media/files/rabbit/model.glb");

        const [submitUrl, submitInit] = fetchSpy.mock.calls[0] as [
            string,
            RequestInit,
        ];
        expect(submitUrl).toBe("https://queue.fal.run/fal-ai/hyper3d/rodin");
        const headers = new Headers(submitInit.headers);
        expect(headers.get("Authorization")).toBe("Key fal_test_key");
        vi.useRealTimers();
    });

    it("falls back to model_glb when model_mesh is absent", async () => {
        const result = { model_glb: { url: "https://example.com/m.glb" } };
        const mesh = extractFalModelMesh(result);
        expect(mesh.url).toBe("https://example.com/m.glb");
    });

    it("throws FalError when neither model_mesh nor model_glb is present", () => {
        expect(() => extractFalModelMesh({})).toThrowError(FalError);
    });

    it("passes through 429 (rate limit)", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ detail: "Rate limited" }), {
                status: 429,
            }),
        );

        await expect(
            runFalJob({ endpoint: "fal-ai/triposr", input: {} }),
        ).rejects.toMatchObject({ name: "FalError", status: 429 });
    });

    it("maps server errors to 502", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ detail: "Server error" }), {
                status: 500,
            }),
        );

        await expect(
            runFalJob({ endpoint: "fal-ai/triposr", input: {} }),
        ).rejects.toMatchObject({ name: "FalError", status: 502 });
    });
});
