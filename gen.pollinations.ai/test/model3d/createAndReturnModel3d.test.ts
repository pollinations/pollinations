import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAndReturnModel3d } from "../../src/model3d/createAndReturnModel3d.ts";
import { syncModel3dEnvironment } from "../../src/model3d/env.ts";
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
});

function baseParams(model: string): Model3dParams {
    return {
        model,
        image: ["https://example.com/ref.jpg"],
        format: "glb",
        safe: false,
    };
}

// Every dispatch path eventually calls fetch; we only care that the right
// upstream host is hit first for each model id.
describe("createAndReturnModel3d dispatch", () => {
    it.each([
        ["trellis-2-low", "sharktide-lightning"],
        ["trellis-2-medium", "sharktide-lightning"],
        ["trellis-2-high", "sharktide-lightning"],
        ["hyper3d-rodin", "queue.fal.run"],
    ])("routes %s to the expected primary provider host", async (model, expectedHost) => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response("{}", { status: 500 }));

        await expect(
            createAndReturnModel3d("a test prompt", baseParams(model)),
        ).rejects.toBeTruthy();

        expect(fetchSpy.mock.calls[0]?.[0]).toContain(expectedHost);
    });

    it("throws for an unrecognized model id", async () => {
        await expect(
            createAndReturnModel3d(
                "prompt",
                baseParams("not-a-real-model") as Model3dParams,
            ),
        ).rejects.toThrow(/not supported/);
    });
});
