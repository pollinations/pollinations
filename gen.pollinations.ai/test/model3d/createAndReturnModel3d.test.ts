import { createExecutionContext, env } from "cloudflare:test";
import { getRegistryModelDefinition } from "@shared/registry/registry.ts";
import { FALLBACK_TARGET_HEADER } from "@shared/registry/usage-headers.ts";

const CLEAN_JPEG_BYTES = new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03,
    0x01, 0x11, 0x00, 0xff, 0xda, 0x00, 0x03, 0x00, 0xff, 0xd9,
]);

import { test as workerTest } from "@shared/test/fixtures/index.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../../src/index.ts";
import { resetGenerationModelRegistryCache } from "../../src/model-registry.ts";
import { createAndReturnModel3d } from "../../src/model3d/createAndReturnModel3d.ts";
import { syncModel3dEnvironment } from "../../src/model3d/env.ts";
import type { Model3dParams } from "../../src/model3d/params.ts";
import { withInlineGenerationCoordinator } from "../helpers/inline-generation-coordinator.ts";

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

async function fetchGen(input: RequestInfo | URL, init?: RequestInit) {
    return worker.fetch(
        new Request(input, init),
        withInlineGenerationCoordinator(env),
        createExecutionContext(),
    );
}

function baseParams(
    model: string,
    resolution: "low" | "medium" | "high" = "low",
): Model3dParams {
    return {
        model,
        resolution,
        image: ["https://example.com/ref.jpg"],
        safe: false,
    };
}

// Every dispatch path eventually calls fetch; we only care that the right
// upstream host is hit first for each model id.
describe("createAndReturnModel3d dispatch", () => {
    it.each([
        ["microsoft/trellis-2", "api.inferenceport.ai"],
        ["nvidia/asset-harvester", "api.inferenceport.ai"],
        ["hyper3d/rodin-2.5", "queue.fal.run"],
    ])("routes %s to the expected primary provider host", async (model, expectedHost) => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async (input) => {
                const url =
                    typeof input === "string"
                        ? input
                        : input instanceof Request
                          ? input.url
                          : input.toString();
                if (url.includes("example.com")) {
                    return new Response(CLEAN_JPEG_BYTES, {
                        headers: { "content-type": "image/jpeg" },
                    });
                }
                return new Response("{}", { status: 500 });
            });

        await expect(
            createAndReturnModel3d("a test prompt", baseParams(model)),
        ).rejects.toBeTruthy();

        expect(
            fetchSpy.mock.calls.some((call) =>
                String(call[0]).includes(expectedHost),
            ),
        ).toBe(true);
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

workerTest("uses the shared fallback loop for 3D", async ({ paidApiKey }) => {
    const source = getRegistryModelDefinition("hyper3d/rodin-2.5");
    const previousFallbacks = source.fallbacks;
    try {
        source.fallbacks = ["microsoft/trellis-2"];
        await resetGenerationModelRegistryCache(env);

        const upstreams: string[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                const request = new Request(input, init);
                if (request.url.includes("example.com")) {
                    return new Response(CLEAN_JPEG_BYTES, {
                        headers: { "content-type": "image/jpeg" },
                    });
                }
                if (request.url.includes("public_model_stats.json")) {
                    return Response.json({ data: [] });
                }
                if (
                    request.url.includes("/v0/events?name=generation_event_v2")
                ) {
                    return new Response("", { status: 202 });
                }
                if (request.url.includes("queue.fal.run")) {
                    upstreams.push("hyper3d/rodin-2.5");
                    return new Response("rate limited", { status: 429 });
                }
                if (request.url.includes("/v1/3d/jobs/")) {
                    return Response.json({
                        job_id: "job_123",
                        status: "completed",
                        data: [{ model_glb_b64_bytes: btoa("glTF") }],
                    });
                }
                if (request.url.includes("api.inferenceport.ai")) {
                    upstreams.push("microsoft/trellis-2");
                    return Response.json(
                        { job_id: "job_123", status: "pending" },
                        { status: 202 },
                    );
                }
                return new Response("unexpected request", { status: 500 });
            },
        );

        const response = await fetchGen(
            `https://gen.pollinations.ai/3d/${crypto.randomUUID()}?model=hyper3d-rodin&image=https%3A%2F%2Fexample.com%2Fref.jpg`,
            { headers: { Authorization: `Bearer ${paidApiKey}` } },
        );

        expect(response.status).toBe(200);
        expect(response.headers.get(FALLBACK_TARGET_HEADER)).toBe(
            "config.targets[1]",
        );
        expect(response.headers.get("x-model-used")).toBe(
            "microsoft/trellis-2",
        );
        expect(await response.text()).toBe("glTF");
        expect(upstreams).toEqual(["hyper3d/rodin-2.5", "microsoft/trellis-2"]);
    } finally {
        source.fallbacks = previousFallbacks;
        await resetGenerationModelRegistryCache(env);
    }
});

workerTest(
    "legacy Trellis IDs use the canonical resolution default",
    async ({ paidApiKey }) => {
        getRegistryModelDefinition("microsoft/trellis-2");
        await resetGenerationModelRegistryCache(env);
        try {
            const resolutions: unknown[] = [];
            vi.spyOn(globalThis, "fetch").mockImplementation(
                async (input, init) => {
                    const request = new Request(input, init);
                    if (request.url.includes("example.com")) {
                        return new Response(CLEAN_JPEG_BYTES, {
                            headers: { "content-type": "image/jpeg" },
                        });
                    }
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
                    if (request.url.includes("/v1/3d/jobs/")) {
                        return Response.json({
                            job_id: "job_123",
                            status: "completed",
                            data: [{ model_glb_b64_bytes: btoa("glTF") }],
                        });
                    }
                    const body = (await request.json()) as {
                        resolution?: unknown;
                    };
                    resolutions.push(body.resolution);
                    return Response.json(
                        { job_id: "job_123", status: "pending" },
                        { status: 202 },
                    );
                },
            );

            for (const resolution of ["low", "medium", "high"]) {
                const response = await fetchGen(
                    `https://gen.pollinations.ai/3d/${crypto.randomUUID()}?model=trellis-2-${resolution}&image=https%3A%2F%2Fexample.com%2Fref.jpg`,
                    { headers: { Authorization: `Bearer ${paidApiKey}` } },
                );
                expect(response.status).toBe(200);
                expect(response.headers.get(FALLBACK_TARGET_HEADER)).toBeNull();
                expect(response.headers.get("x-model-used")).toBe(
                    "microsoft/trellis-2",
                );
                expect(await response.text()).toBe("glTF");
            }

            const overrideResponse = await fetchGen(
                `https://gen.pollinations.ai/3d/${crypto.randomUUID()}?model=trellis-2-high&resolution=low&image=https%3A%2F%2Fexample.com%2Fref.jpg`,
                { headers: { Authorization: `Bearer ${paidApiKey}` } },
            );
            expect(overrideResponse.status).toBe(200);
            await overrideResponse.text();

            const cachePrompt = crypto.randomUUID();
            for (const resolution of ["low", "high"]) {
                const response = await fetchGen(
                    `https://gen.pollinations.ai/3d/${cachePrompt}?model=trellis-2&resolution=${resolution}&image=https%3A%2F%2Fexample.com%2Fref.jpg`,
                    { headers: { Authorization: `Bearer ${paidApiKey}` } },
                );
                expect(response.status).toBe(200);
                await response.text();
            }

            expect(resolutions).toEqual([
                "low",
                "low",
                "low",
                "low",
                "low",
                "high",
            ]);
        } finally {
            await resetGenerationModelRegistryCache(env);
        }
    },
);

workerTest(
    "returns 400 for Inferenceport validation failures",
    async ({ paidApiKey }) => {
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                const request = new Request(input, init);
                if (request.url.includes("public_model_stats.json")) {
                    return Response.json({ data: [] });
                }
                if (
                    request.url.includes("/v0/events?name=generation_event_v2")
                ) {
                    return new Response("", { status: 202 });
                }
                return Response.json(
                    { detail: "Invalid image dimensions" },
                    { status: 422 },
                );
            },
        );

        const response = await fetchGen(
            `https://gen.pollinations.ai/3d/invalid-${crypto.randomUUID()}?model=trellis-2&resolution=low&image=https%3A%2F%2Fexample.com%2Fref.jpg`,
            { headers: { Authorization: `Bearer ${paidApiKey}` } },
        );

        expect(response.status).toBe(400);
    },
);
