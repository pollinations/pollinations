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

function params(quality: "low" | "medium" | "high" = "low"): Model3dParams {
    return {
        model: "trellis-2",
        quality,
        image: ["https://example.com/ref.jpg"],
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

        await callTrellis2(params("medium"));

        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toContain("?sync=true");
        const body = JSON.parse(init.body as string);
        expect(body.model).toBe("trellis2");
        expect(body.resolution).toBe("medium");
    });

    it.each([
        "low",
        "medium",
        "high",
    ] as const)("sends correct %s quality", async (quality) => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(syncSuccessResponse());

        await callTrellis2(params(quality));

        const body = JSON.parse(
            (fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string,
        );
        expect(body.resolution).toBe(quality);
    });

    it("returns a GLB buffer from the sync response", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(syncSuccessResponse());

        const result = await callTrellis2(params());

        expect(result.contentType).toBe("model/gltf-binary");
        expect(result.buffer.length).toBeGreaterThan(0);
    });

    it("throws when no image is provided", async () => {
        await expect(
            callTrellis2({
                model: "trellis-2",
                image: [],
                safe: false,
            }),
        ).rejects.toBeTruthy();
    });

    it("does not forward seed (inferenceport support unconfirmed)", async () => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(syncSuccessResponse());

        await callTrellis2({ ...params(), seed: 12345 });

        const body = JSON.parse(
            (fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string,
        );
        expect(body.seed).toBeUndefined();
    });
});
