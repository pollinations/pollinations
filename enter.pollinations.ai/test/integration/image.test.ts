import { SELF } from "cloudflare:test";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { describe, expect } from "vitest";
import { test } from "../fixtures.ts";

// GPU-hosted models that need physical backends — skip in integration tests
const GPU_MODELS = ["flux", "zimage", "klein"];

// Edit-only models that require image input — cannot do text-to-image
const EDIT_ONLY_MODELS = ["p-image-edit"];

// Separate image models from video models, exclude GPU and broken
const imageModels = Object.entries(IMAGE_SERVICES)
    .filter(([id, svc]) => {
        if (GPU_MODELS.includes(id)) return false;
        if (EDIT_ONLY_MODELS.includes(id)) return false;
        if (svc.hidden) return false;
        const outputs = svc.outputModalities as string[] | undefined;
        if (outputs?.includes("video")) return false;
        return outputs?.includes("image");
    })
    .map(([id, svc]) => ({
        id,
        description: svc.description,
        paidOnly: "paidOnly" in svc && svc.paidOnly === true,
    }));

// Models that support image input (img2img / editing)
const img2imgModels = Object.entries(IMAGE_SERVICES)
    .filter(([id, svc]) => {
        if (GPU_MODELS.includes(id)) return false;
        if (svc.hidden) return false;
        const inputs = svc.inputModalities as string[] | undefined;
        const outputs = svc.outputModalities as string[] | undefined;
        if (outputs?.includes("video")) return false;
        return inputs?.includes("image") && outputs?.includes("image");
    })
    .map(([id, svc]) => ({
        id,
        description: svc.description,
    }));

// 512x512 red square PNG hosted on media.pollinations.ai (stable, no query params)
const TEST_REFERENCE_IMAGE = "https://media.pollinations.ai/92701201e6d93d40";

describe("Image text-to-image (all non-GPU models)", () => {
    const testCases = imageModels.map(
        (m) => [m.id, m.description] as [string, string],
    );

    test.for(testCases)(
        "%s should return an image",
        { timeout: 120000 },
        async ([modelId], { paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/a%20red%20apple?model=${modelId}&width=512&height=512&seed=42`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${paidApiKey}`,
                    },
                },
            );

            if (response.status !== 200) {
                const body = await response.clone().text();
                console.log(`${modelId} response:`, response.status, body);
            }

            expect(response.status).toBe(200);

            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("image/");

            const buffer = await response.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000);
        },
    );
});

describe("Image text-to-image (unauthenticated)", () => {
    // Pick one non-paidOnly model for the unauth test
    const freeModel = imageModels.find((m) => !m.paidOnly);
    const testModel = freeModel?.id ?? imageModels[0]?.id ?? "gptimage";

    test(
        "should return 401 without authentication",
        { timeout: 10000 },
        async ({ mocks }) => {
            await mocks.enable("polar", "tinybird");

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/test?model=${testModel}&width=256&height=256&seed=42`,
                { method: "GET" },
            );

            expect(response.status).toBe(401);
            await response.text();
        },
    );
});

describe("Image img2img (all non-GPU models with image input)", () => {
    const testCases = img2imgModels.map(
        (m) => [m.id, m.description] as [string, string],
    );

    test.for(testCases)(
        "%s should return an edited image",
        { timeout: 120000 },
        async ([modelId], { paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const encodedImageUrl = encodeURIComponent(TEST_REFERENCE_IMAGE);

            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/image/make%20it%20blue?model=${modelId}&width=512&height=512&seed=42&image=${encodedImageUrl}`,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${paidApiKey}`,
                    },
                },
            );

            if (response.status !== 200) {
                const body = await response.clone().text();
                console.log(
                    `${modelId} img2img response:`,
                    response.status,
                    body,
                );
            }

            expect(response.status).toBe(200);

            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("image/");

            const buffer = await response.arrayBuffer();
            expect(buffer.byteLength).toBeGreaterThan(1000);
        },
    );
});

describe("POST /v1/images/generations", () => {
    // Use first available non-GPU model for OpenAI compat tests
    const testModel = imageModels[0]?.id ?? "gptimage";

    test(
        "returns b64_json response by default",
        { timeout: 60000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/images/generations",
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${paidApiKey}`,
                    },
                    body: JSON.stringify({
                        prompt: "a red circle on white background",
                        model: testModel,
                        size: "256x256",
                        seed: 42,
                    }),
                },
            );
            expect(response.status).toBe(200);

            const data = (await response.json()) as {
                created: number;
                data: { b64_json?: string; revised_prompt?: string }[];
            };
            expect(data.created).toBeTypeOf("number");
            expect(data.data).toHaveLength(1);
            expect(data.data[0].b64_json).toBeDefined();
            expect(data.data[0].b64_json?.length).toBeGreaterThan(100);
        },
    );

    test("requires authentication", { timeout: 10000 }, async ({ mocks }) => {
        await mocks.enable("polar", "tinybird");

        const response = await SELF.fetch(
            "http://localhost:3000/api/generate/v1/images/generations",
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    prompt: "test",
                    model: testModel,
                }),
            },
        );
        expect(response.status).toBe(401);
        await response.text();
    });
});

describe("POST /v1/images/edits", () => {
    // Use first img2img-capable model
    const testModel = img2imgModels[0]?.id ?? "gptimage";

    test(
        "edits image with JSON body and image URL string",
        { timeout: 60000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/images/edits",
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${paidApiKey}`,
                    },
                    body: JSON.stringify({
                        prompt: "make it blue",
                        model: testModel,
                        image: TEST_REFERENCE_IMAGE,
                        size: "256x256",
                        seed: 42,
                    }),
                },
            );
            expect(response.status).toBe(200);

            const data = (await response.json()) as {
                created: number;
                data: { b64_json?: string }[];
            };
            expect(data.created).toBeTypeOf("number");
            expect(data.data).toHaveLength(1);
            expect(data.data[0].b64_json).toBeDefined();
            expect(data.data[0].b64_json?.length).toBeGreaterThan(100);
        },
    );

    test("requires authentication", { timeout: 10000 }, async ({ mocks }) => {
        await mocks.enable("polar", "tinybird");

        const response = await SELF.fetch(
            "http://localhost:3000/api/generate/v1/images/edits",
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    prompt: "test",
                    model: testModel,
                    image: TEST_REFERENCE_IMAGE,
                }),
            },
        );
        expect(response.status).toBe(401);
        await response.text();
    });

    test(
        "returns 400 when image is missing",
        { timeout: 10000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird");

            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/images/edits",
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${paidApiKey}`,
                    },
                    body: JSON.stringify({
                        prompt: "test",
                        model: testModel,
                    }),
                },
            );
            expect(response.status).toBe(400);
            await response.text();
        },
    );
});
