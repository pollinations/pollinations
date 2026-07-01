import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncModel3dEnvironment } from "../../src/model3d/env.ts";
import { callTrellis2 } from "../../src/model3d/models/trellis2Model.ts";
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
        image: ["https://example.com/ref.jpg"],
        format: "glb",
        safe: false,
    };
}

const syncSuccessResponse = (b64 = "aW5mZXJlbmNlcG9ydA==") =>
    new Response(JSON.stringify({ data: [{ model_glb_b64_bytes: b64 }] }), {
        status: 200,
    });

describe("callTrellis2", () => {
    it("uses ?sync=true and the correct inferenceport model name", async () => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(syncSuccessResponse());

        await callTrellis2(params("trellis-2-medium"));

        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toContain("?sync=true");
        const body = JSON.parse(init.body as string);
        expect(body.model).toBe("trellis2");
        expect(body.resolution).toBe("medium");
    });

    it.each([
        ["trellis-2-low", "low"],
        ["trellis-2-medium", "medium"],
        ["trellis-2-high", "high"],
    ])("sends correct resolution for %s", async (modelId, expectedResolution) => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(syncSuccessResponse());

        await callTrellis2(params(modelId));

        const body = JSON.parse(
            (fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string,
        );
        expect(body.resolution).toBe(expectedResolution);
    });

    it("returns a GLB buffer from the sync response", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(syncSuccessResponse());

        const result = await callTrellis2(params("trellis-2-low"));

        expect(result.contentType).toBe("model/gltf-binary");
        expect(result.buffer.length).toBeGreaterThan(0);
    });

    it("throws when no image is provided", async () => {
        await expect(
            callTrellis2({
                model: "trellis-2-low",
                image: [],
                format: "glb",
                safe: false,
            }),
        ).rejects.toBeTruthy();
    });
});
