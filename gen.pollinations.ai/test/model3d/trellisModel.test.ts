import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncModel3dEnvironment } from "../../src/model3d/env.ts";
import { callTrellisWithFallback } from "../../src/model3d/models/trellisModel.ts";
import type { Model3dParams } from "../../src/model3d/params.ts";

beforeEach(() => {
    syncModel3dEnvironment({
        ...env,
        INFERENCEPORT_API_KEY: "ip_test_token",
        FAL_KEY: "fal_test_key",
    } as CloudflareBindings);
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

const params: Model3dParams = {
    model: "trellis",
    image: ["https://example.com/ref.jpg"],
    format: "glb",
    safe: false,
};

const inferenceportSuccessResponse = () =>
    new Response(
        JSON.stringify({
            job_id: "job_1",
            status: "completed",
            model_glb_b64_bytes: "aW5mZXJlbmNlcG9ydA==",
        }),
        { status: 200 },
    );

const falSuccessResponses = () => [
    new Response(
        JSON.stringify({
            request_id: "req_1",
            status_url:
                "https://queue.fal.run/fal-ai/trellis/multi/requests/req_1/status",
            response_url:
                "https://queue.fal.run/fal-ai/trellis/multi/requests/req_1",
        }),
        { status: 202 },
    ),
    new Response(JSON.stringify({ status: "COMPLETED" }), { status: 200 }),
    new Response(
        JSON.stringify({
            model_mesh: { url: "https://v3.fal.media/files/model.glb" },
        }),
        { status: 200 },
    ),
    new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
];

describe("callTrellisWithFallback", () => {
    it("returns inferenceport's result and never calls fal.ai when inferenceport succeeds", async () => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(inferenceportSuccessResponse());

        const result = await callTrellisWithFallback(params);

        expect(result.contentType).toBe("model/gltf-binary");
        expect(fetchSpy.mock.calls.length).toBe(1);
        expect(fetchSpy.mock.calls[0]?.[0]).toContain("sharktide-lightning");
    });

    it("falls back to fal.ai and returns its result when inferenceport fails", async () => {
        vi.useFakeTimers();
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        fetchSpy.mockResolvedValueOnce(
            new Response(JSON.stringify({ detail: "down" }), { status: 500 }),
        );
        const [submit, status, result, download] = falSuccessResponses();
        fetchSpy
            .mockResolvedValueOnce(submit)
            .mockResolvedValueOnce(status)
            .mockResolvedValueOnce(result)
            .mockResolvedValueOnce(download);

        const promise = callTrellisWithFallback(params);
        await vi.advanceTimersByTimeAsync(10_000);
        const generationResult = await promise;

        expect(generationResult.contentType).toBe("model/gltf-binary");
        // 1 failed inferenceport call + 4 fal.ai calls (submit, status, result, download)
        expect(fetchSpy.mock.calls.length).toBe(5);
        expect(fetchSpy.mock.calls[0]?.[0]).toContain("sharktide-lightning");
        expect(fetchSpy.mock.calls[1]?.[0]).toContain("queue.fal.run");
        vi.useRealTimers();
    });

    it("propagates an error when both inferenceport and fal.ai fail", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ detail: "down" }), { status: 500 }),
        );

        await expect(callTrellisWithFallback(params)).rejects.toMatchObject({
            name: "HttpError",
        });
    });

    it("rejects with 400 before calling any provider when no image is provided", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            callTrellisWithFallback({ ...params, image: [] }),
        ).rejects.toMatchObject({ name: "HttpError", status: 400 });
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
