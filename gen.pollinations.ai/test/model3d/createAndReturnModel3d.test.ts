import { env, SELF } from "cloudflare:test";
import { getRegistryModelDefinition } from "@shared/registry/registry.ts";
import { FALLBACK_TARGET_HEADER } from "@shared/registry/usage-headers.ts";
import { test as workerTest } from "@shared/test/fixtures/index.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetGenerationModelRegistryCache } from "../../src/model-registry.ts";
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
        safe: false,
    };
}

// Every dispatch path eventually calls fetch; we only care that the right
// upstream host is hit first for each model id.
describe("createAndReturnModel3d dispatch", () => {
    it.each([
        ["trellis-2-low", "api.inferenceport.ai"],
        ["trellis-2-medium", "api.inferenceport.ai"],
        ["trellis-2-high", "api.inferenceport.ai"],
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

workerTest(
    "uses the shared fallback loop for 3D",
    { timeout: 900000 },
    async ({ paidApiKey }) => {
        const source = getRegistryModelDefinition("trellis-2-low");
        const previousFallbacks = source.fallbacks;
        try {
            source.fallbacks = ["trellis-2-medium"];
            resetGenerationModelRegistryCache();
            const resolutions: unknown[] = [];
            vi.spyOn(globalThis, "fetch").mockImplementation(
                async (input, init) => {
                    const request = new Request(input, init);
                    if (request.url.includes("public_model_stats.json")) {
                        return Response.json({ data: [] });
                    }
                    if (
                        request.url.includes(
                            "/v0/events?name=generation_event_v2",
                        )
                    ) {
                        return new Response("", { status: 202 });
                    }
                    const body = (await request.json()) as {
                        resolution?: unknown;
                    };
                    resolutions.push(body.resolution);
                    if (body.resolution === "low") {
                        return Response.json(
                            { error: { message: "rate limited" } },
                            { status: 429 },
                        );
                    }
                    return Response.json({
                        data: [{ model_glb_b64_bytes: btoa("glTF") }],
                    });
                },
            );

            const response = await SELF.fetch(
                `https://gen.pollinations.ai/3d/fallback-${crypto.randomUUID()}?model=trellis-2-low&image=https%3A%2F%2Finferenceport.ai%2Fimg%2Ftrellis.jpg`,
                { headers: { Authorization: `Bearer ${paidApiKey}` } },
            );

            expect(response.status).toBe(200);
            expect(response.headers.get(FALLBACK_TARGET_HEADER)).toBe(
                "config.targets[1]",
            );
            expect(response.headers.get("x-model-used")).toBe(
                "trellis-2-medium",
            );
            expect(resolutions).toEqual(["low", "medium"]);
            expect(await response.text()).toBe("glTF");
        } finally {
            source.fallbacks = previousFallbacks;
            resetGenerationModelRegistryCache();
        }
    },
);
