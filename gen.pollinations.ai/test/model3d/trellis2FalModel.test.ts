import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncModel3dEnvironment } from "../../src/model3d/env.ts";
import { callTrellis2Fal } from "../../src/model3d/models/trellis2FalModel.ts";
import type { Model3dParams } from "../../src/model3d/params.ts";

beforeEach(() => {
    syncModel3dEnvironment({
        FAL_KEY: "fal_test_key",
    } as CloudflareBindings);
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

function params(resolution: "low" | "medium" | "high"): Model3dParams {
    return {
        model: "trellis-2-fal",
        resolution,
        image: ["https://example.com/ref.jpg"],
        safe: false,
    };
}

async function run(resolution: "low" | "medium" | "high") {
    vi.useFakeTimers();
    const promise = callTrellis2Fal(params(resolution));
    await vi.advanceTimersByTimeAsync(10_000);
    return promise;
}

describe("callTrellis2Fal", () => {
    it.each([
        ["low", 512],
        ["medium", 1024],
        ["high", 1536],
    ] as const)("maps %s to Fal resolution %i", async (resolution, pixels) => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(
                Response.json({
                    request_id: "req_1",
                    status_url: "https://queue.fal.run/status",
                    response_url: "https://queue.fal.run/result",
                }),
            )
            .mockResolvedValueOnce(Response.json({ status: "COMPLETED" }))
            .mockResolvedValueOnce(
                Response.json({
                    model_glb: { url: "https://fal.media/model.glb" },
                }),
            )
            .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));

        const result = await run(resolution);

        const body = JSON.parse(
            (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
        );
        expect(fetchSpy.mock.calls[0][0]).toBe(
            "https://queue.fal.run/fal-ai/trellis-2",
        );
        expect(body).toEqual({
            image_url: "https://example.com/ref.jpg",
            resolution: pixels,
        });
        expect(result.trackingData?.actualModel).toBe("trellis-2-fal");
    });
});
