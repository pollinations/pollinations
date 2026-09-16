import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncModel3dEnvironment } from "../../src/model3d/env.ts";
import { callTrellis2 } from "../../src/model3d/models/trellis2Model.ts";
import type { Model3dParams } from "../../src/model3d/params.ts";

const CLEAN_JPEG_DATA_URI =
    "data:image/jpeg;base64,/9j/wAALCAABAAEDAREA/9oAAwD/2Q==";
const CLEAN_JPEG_BYTES = new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03,
    0x01, 0x11, 0x00, 0xff, 0xda, 0x00, 0x03, 0x00, 0xff, 0xd9,
]);

beforeEach(() => {
    syncModel3dEnvironment({
        ...env,
        INFERENCEPORT_API_KEY: "ip_test_token",
    } as CloudflareBindings);
});

afterEach(() => {
    vi.restoreAllMocks();
});

function params(
    resolution: "low" | "medium" | "high" = "low",
    image: string[] = ["https://example.com/ref.jpg"],
): Model3dParams {
    return {
        model: "trellis-2",
        resolution,
        image,
        safe: false,
    };
}

function mockAsyncSuccess(b64 = "aW5mZXJlbmNlcG9ydA==") {
    let callIndex = 0;
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        const href = typeof url === "string" ? url : url.toString();
        if (href === "https://example.com/ref.jpg") {
            return new Response(CLEAN_JPEG_BYTES, {
                headers: { "content-type": "image/jpeg" },
            });
        }
        if (callIndex === 0) {
            callIndex++;
            return Response.json(
                { job_id: "job_123", status: "pending" },
                { status: 202 },
            );
        }
        return Response.json({
            job_id: "job_123",
            status: "completed",
            data: [{ model_glb_b64_bytes: b64 }],
        });
    });
}

describe("callTrellis2", () => {
    it("uses the async API and correct inferenceport model name", async () => {
        const fetchSpy = mockAsyncSuccess();

        await callTrellis2(params("medium"));

        const inferenceCall = fetchSpy.mock.calls.find(([url]) =>
            String(url).includes("inferenceport"),
        );
        expect(inferenceCall).toBeDefined();
        const [url, init] = inferenceCall as [string, RequestInit];
        expect(url).not.toContain("sync=true");
        const body = JSON.parse(init.body as string);
        expect(body.model).toBe("trellis2");
        expect(body.resolution).toBe("medium");
        expect(body.image_urls).toEqual([CLEAN_JPEG_DATA_URI]);
    });

    it.each([
        "low",
        "medium",
        "high",
    ] as const)("sends %s resolution", async (resolution) => {
        const fetchSpy = mockAsyncSuccess();

        await callTrellis2(params(resolution));

        const inferenceCall = fetchSpy.mock.calls.find(([url]) =>
            String(url).includes("inferenceport"),
        );
        expect(inferenceCall).toBeDefined();
        const body = JSON.parse(
            (inferenceCall as [string, RequestInit])[1].body as string,
        );
        expect(body.resolution).toBe(resolution);
    });

    it("returns a GLB buffer from the completed job", async () => {
        mockAsyncSuccess();

        const result = await callTrellis2(params());

        expect(result.contentType).toBe("model/gltf-binary");
        expect(result.buffer.length).toBeGreaterThan(0);
    });

    it("throws when no image is provided", async () => {
        await expect(
            callTrellis2({
                model: "trellis-2",
                resolution: "low",
                image: [],
                safe: false,
            }),
        ).rejects.toBeTruthy();
    });

    it("does not forward seed (inferenceport support unconfirmed)", async () => {
        const fetchSpy = mockAsyncSuccess();

        await callTrellis2({ ...params(), seed: 12345 });

        const inferenceCall = fetchSpy.mock.calls.find(([url]) =>
            String(url).includes("inferenceport"),
        );
        expect(inferenceCall).toBeDefined();
        const body = JSON.parse(
            (inferenceCall as [string, RequestInit])[1].body as string,
        );
        expect(body.seed).toBeUndefined();
    });
});
