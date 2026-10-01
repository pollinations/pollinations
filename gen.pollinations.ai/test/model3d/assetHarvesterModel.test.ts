import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncModel3dEnvironment } from "../../src/model3d/env.ts";
import { callAssetHarvester } from "../../src/model3d/models/assetHarvesterModel.ts";
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

function params(): Model3dParams {
    return {
        model: "nvidia/asset-harvester",
        resolution: "low",
        image: ["https://example.com/ref.jpg"],
        safe: false,
    };
}

function mockAsyncSuccess(plyB64 = "cGx5X2RhdGE=") {
    return vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
            Response.json(
                { job_id: "job_456", status: "pending" },
                { status: 202 },
            ),
        )
        .mockResolvedValueOnce(
            Response.json({
                job_id: "job_456",
                status: "completed",
                data: [{ model_ply_b64_bytes: plyB64 }],
            }),
        );
}

describe("callAssetHarvester", () => {
    it("uses the async API and correct inferenceport model name", async () => {
        const fetchSpy = mockAsyncSuccess();

        await callAssetHarvester(params());

        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).not.toContain("sync=true");
        const body = JSON.parse(init.body as string);
        expect(body.model).toBe("asset-harvester");
    });

    it("returns a PLY buffer from the completed job", async () => {
        mockAsyncSuccess();

        const result = await callAssetHarvester(params());

        expect(result.contentType).toBe("model/ply");
        expect(result.buffer.length).toBeGreaterThan(0);
    });

    it("throws when no image is provided", async () => {
        await expect(
            callAssetHarvester({
                model: "nvidia/asset-harvester",
                resolution: "low",
                image: [],
                safe: false,
            }),
        ).rejects.toBeTruthy();
    });

    it("throws when no PLY output is returned", async () => {
        vi.spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(
                Response.json(
                    { job_id: "job_no_ply", status: "pending" },
                    { status: 202 },
                ),
            )
            .mockResolvedValueOnce(
                Response.json({
                    job_id: "job_no_ply",
                    status: "completed",
                    data: [{}],
                }),
            );

        await expect(callAssetHarvester(params())).rejects.toBeTruthy();
    });

    it("does not forward seed", async () => {
        const fetchSpy = mockAsyncSuccess();

        await callAssetHarvester({ ...params(), seed: 12345 });

        const body = JSON.parse(
            (fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string,
        );
        expect(body.seed).toBeUndefined();
    });
});
