import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncModel3dEnvironment } from "../../src/model3d/env.ts";
import {
    extractFalModelMesh,
    FalError,
    runFalJob,
} from "../../src/model3d/models/falClient.ts";
import { toUpstreamError } from "../../src/model3d/modelUtils.ts";

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
    it("retains the full provider body through the public error adapter", async () => {
        const body = JSON.stringify({
            detail: "x".repeat(20000),
            token: "test-only",
        });
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(body, { status: 429 }),
        );
        const error = await runFalJob({
            endpoint: "fal-ai/triposr",
            input: {},
        }).catch(toUpstreamError);
        expect(error).toMatchObject({
            status: 502,
            upstreamStatus: 429,
            responseBody: body,
        });
        expect(error.message).toContain(body);
    });

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

    it("waits before each poll and fetches the completed result", async () => {
        vi.useFakeTimers();
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(
                Response.json({
                    request_id: "last_poll",
                    status_url: "https://queue.fal.run/status",
                    response_url: "https://queue.fal.run/result",
                }),
            )
            .mockResolvedValueOnce(Response.json({ status: "IN_PROGRESS" }))
            .mockResolvedValueOnce(Response.json({ status: "COMPLETED" }))
            .mockResolvedValueOnce(
                Response.json({ model_mesh: { url: "mesh.glb" } }),
            );

        const result = runFalJob(
            { endpoint: "fal-ai/triposr", input: {} },
            "fal_override_key",
        );
        await vi.advanceTimersByTimeAsync(4_999);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(4_999);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1);

        await expect(result).resolves.toEqual({
            model_mesh: { url: "mesh.glb" },
        });
        expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
            "https://queue.fal.run/fal-ai/triposr",
            "https://queue.fal.run/status",
            "https://queue.fal.run/status",
            "https://queue.fal.run/result",
        ]);
        for (const [, init] of fetchSpy.mock.calls) {
            expect(new Headers(init?.headers).get("Authorization")).toBe(
                "Key fal_override_key",
            );
        }
    });

    it("keeps polling a slow job without submitting it again", async () => {
        vi.useFakeTimers();
        const started = Date.now();
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async (input) => {
                const url = String(input);
                if (url === "https://queue.fal.run/fal-ai/triposr") {
                    return Response.json({
                        request_id: "slow",
                        status_url: "https://queue.fal.run/status",
                        response_url: "https://queue.fal.run/result",
                    });
                }
                if (url === "https://queue.fal.run/status") {
                    return Response.json({
                        status:
                            Date.now() - started < 11 * 60_000
                                ? "IN_PROGRESS"
                                : "COMPLETED",
                    });
                }
                return Response.json({ model_mesh: { url: "mesh.glb" } });
            });

        const result = runFalJob({ endpoint: "fal-ai/triposr", input: {} });
        await vi.advanceTimersByTimeAsync(11 * 60_000 + 5_000);

        await expect(result).resolves.toEqual({
            model_mesh: { url: "mesh.glb" },
        });
        expect(
            fetchSpy.mock.calls.filter(
                ([url]) => url === "https://queue.fal.run/fal-ai/triposr",
            ),
        ).toHaveLength(1);
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
