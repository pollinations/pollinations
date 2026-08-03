import { afterEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import {
    callOpenRouterGeminiImageAPI,
    callOpenRouterGrokImagineProAPI,
    callOpenRouterRecraftVectorAPI,
    callOpenRouterSeedreamProAPI,
    mapOpenRouterGeminiImageUsage,
} from "../../src/image/models/openRouterImageModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const OPENROUTER_IMAGE_URL = "https://openrouter.ai/api/v1/images";
const REFERENCE_IMAGE_URL = "https://example.com/reference.png";
const WIDE_REFERENCE_IMAGE_URL = "https://example.com/wide-reference.png";
const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
);
const PNG_DATA_URI = `data:image/png;base64,${PNG.toString("base64")}`;
const WIDE_PNG = Buffer.alloc(24);
WIDE_PNG.set([0x89, 0x50, 0x4e, 0x47]);
WIDE_PNG.writeUInt32BE(2560, 16);
WIDE_PNG.writeUInt32BE(1440, 20);
const WIDE_PNG_DATA_URI = `data:image/png;base64,${WIDE_PNG.toString("base64")}`;

const baseParams: ImageParams = {
    model: "grok-imagine-pro",
    width: 1024,
    height: 1024,
    dimensionsExplicit: false,
    seed: 42,
    safe: false,
    quality: "medium",
    image: [],
    transparent: false,
    reasoning: "balanced",
    audio: false,
    duration: 0,
};

function mockOpenRouterFetch(requests: Record<string, unknown>[]) {
    return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url, init) => {
            const href = typeof url === "string" ? url : url.toString();
            if (href !== OPENROUTER_IMAGE_URL) {
                return new Response("unexpected URL", { status: 404 });
            }

            requests.push(
                JSON.parse(init?.body as string) as Record<string, unknown>,
            );
            return new Response(
                JSON.stringify({
                    data: [{ b64_json: "AQID" }],
                    usage: { cost: 0.05 },
                }),
                { status: 200 },
            );
        });
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("OpenRouter Grok Imagine Pro", () => {
    it("generates at the existing 1K tier and tracks one output image", async () => {
        syncImageEnv(
            { OPENROUTER_API_KEY: "openrouter-test-key" } as CloudflareBindings,
            ["OPENROUTER_API_KEY"],
        );
        const requests: Record<string, unknown>[] = [];
        const fetchSpy = mockOpenRouterFetch(requests);

        const result = await callOpenRouterGrokImagineProAPI(
            "test prompt",
            baseParams,
        );

        expect(fetchSpy).toHaveBeenCalledWith(
            OPENROUTER_IMAGE_URL,
            expect.objectContaining({
                method: "POST",
                headers: {
                    Authorization: "Bearer openrouter-test-key",
                    "Content-Type": "application/json",
                },
            }),
        );
        expect(requests[0]).toEqual({
            model: "x-ai/grok-imagine-image-quality",
            prompt: "test prompt",
            n: 1,
            resolution: "1K",
            aspect_ratio: "1:1",
        });
        expect(result.buffer).toEqual(Buffer.from([1, 2, 3]));
        expect(result.trackingData).toEqual({
            actualModel: "grok-imagine-pro",
            usage: { completionImageTokens: 1 },
        });
    });

    it("forwards one edit image and tracks its input fee", async () => {
        syncImageEnv(
            { OPENROUTER_API_KEY: "openrouter-test-key" } as CloudflareBindings,
            ["OPENROUTER_API_KEY"],
        );
        const requests: Record<string, unknown>[] = [];
        mockOpenRouterFetch(requests);

        const result = await callOpenRouterGrokImagineProAPI("edit prompt", {
            ...baseParams,
            width: 1280,
            height: 720,
            image: ["https://example.com/input.png"],
        });

        expect(requests[0]).toEqual({
            model: "x-ai/grok-imagine-image-quality",
            prompt: "edit prompt",
            n: 1,
            resolution: "1K",
            aspect_ratio: "16:9",
            input_references: [
                {
                    type: "image_url",
                    image_url: { url: "https://example.com/input.png" },
                },
            ],
        });
        expect(result.trackingData?.usage).toEqual({
            promptImageTokens: 1,
            completionImageTokens: 1,
        });
    });

    it("rejects a successful response without image data", async () => {
        syncImageEnv(
            { OPENROUTER_API_KEY: "openrouter-test-key" } as CloudflareBindings,
            ["OPENROUTER_API_KEY"],
        );
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ data: [] }), { status: 200 }),
        );

        await expect(
            callOpenRouterGrokImagineProAPI("test prompt", baseParams),
        ).rejects.toMatchObject({
            status: 502,
            upstreamUrl: OPENROUTER_IMAGE_URL,
        });
    });
});

const geminiUsage = {
    prompt_tokens: 9,
    completion_tokens: 1290,
    total_tokens: 1299,
    cost: 0.0387027,
    is_byok: false,
    prompt_tokens_details: {},
    completion_tokens_details: {
        reasoning_tokens: 0,
        image_tokens: 1290,
    },
};

function mockGeminiFetch(
    requests: Record<string, unknown>[],
    usage: Record<string, unknown> = geminiUsage,
) {
    return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (url, init) => {
            const href = typeof url === "string" ? url : url.toString();
            if (href === REFERENCE_IMAGE_URL) {
                return new Response(PNG, {
                    status: 200,
                    headers: { "Content-Type": "image/png" },
                });
            }
            if (href !== OPENROUTER_IMAGE_URL) {
                return new Response("unexpected URL", { status: 404 });
            }

            requests.push(
                JSON.parse(init?.body as string) as Record<string, unknown>,
            );
            return Response.json({
                data: [
                    {
                        b64_json: PNG.toString("base64"),
                        media_type: "image/png",
                    },
                ],
                usage,
            });
        });
}

describe("OpenRouter Gemini image", () => {
    it("pins NanoBanana to Google Vertex with no fallback", async () => {
        syncImageEnv(
            { OPENROUTER_API_KEY: "openrouter-test-key" } as CloudflareBindings,
            ["OPENROUTER_API_KEY"],
        );
        const requests: Record<string, unknown>[] = [];
        mockGeminiFetch(requests);

        const result = await callOpenRouterGeminiImageAPI("test prompt", {
            ...baseParams,
            model: "nanobanana",
            width: 1024,
            height: 1024,
        });

        expect(requests).toEqual([
            {
                model: "google/gemini-2.5-flash-image",
                prompt: "test prompt",
                n: 1,
                aspect_ratio: "1:1",
                seed: 42,
                provider: {
                    only: ["google-vertex/global"],
                    allow_fallbacks: false,
                },
            },
        ]);
        expect(result.trackingData).toEqual({
            actualModel: "nanobanana",
            usage: {
                promptTextTokens: 9,
                completionImageTokens: 1290,
            },
        });
    });

    it("routes NanoBanana 2 at the matching resolution and reasoning tier", async () => {
        syncImageEnv(
            { OPENROUTER_API_KEY: "openrouter-test-key" } as CloudflareBindings,
            ["OPENROUTER_API_KEY"],
        );
        const requests: Record<string, unknown>[] = [];
        mockGeminiFetch(requests, {
            prompt_tokens: 12,
            completion_tokens: 2536,
            total_tokens: 2548,
            cost: 0.151254,
            prompt_tokens_details: {},
            completion_tokens_details: {
                reasoning_tokens: 4,
                image_tokens: 2520,
            },
        });

        const result = await callOpenRouterGeminiImageAPI("test prompt", {
            ...baseParams,
            model: "nanobanana-2",
            width: 1920,
            height: 1080,
            reasoning: "pro",
        });

        expect(requests).toEqual([
            {
                model: "google/gemini-3.1-flash-image",
                prompt: "test prompt",
                n: 1,
                aspect_ratio: "16:9",
                seed: 42,
                provider: {
                    only: ["google-vertex/global"],
                    allow_fallbacks: false,
                },
                resolution: "2K",
                reasoning_effort: "high",
            },
        ]);
        expect(result.trackingData).toEqual({
            actualModel: "nanobanana-2",
            usage: {
                promptTextTokens: 12,
                completionTextTokens: 12,
                completionReasoningTokens: 4,
                completionImageTokens: 2520,
            },
        });
    });

    it.each([
        [1024, 1024, "1K"],
        [1920, 1080, "2K"],
        [3840, 2160, "4K"],
    ] as const)(
        "maps %sx%s NanoBanana 2 requests to %s",
        async (width, height, expectedResolution) => {
            syncImageEnv(
                {
                    OPENROUTER_API_KEY: "openrouter-test-key",
                } as CloudflareBindings,
                ["OPENROUTER_API_KEY"],
            );
            const requests: Record<string, unknown>[] = [];
            mockGeminiFetch(requests);

            await callOpenRouterGeminiImageAPI("test prompt", {
                ...baseParams,
                model: "nanobanana-2",
                width,
                height,
                reasoning: "fast",
            });

            expect(requests[0].resolution).toBe(expectedResolution);
            expect(requests[0].reasoning_effort).toBe("low");
        },
    );

    it("pins NanoBanana 2 Lite to 1K Vertex with no fallback", async () => {
        syncImageEnv(
            { OPENROUTER_API_KEY: "openrouter-test-key" } as CloudflareBindings,
            ["OPENROUTER_API_KEY"],
        );
        const requests: Record<string, unknown>[] = [];
        mockGeminiFetch(requests, {
            prompt_tokens: 10,
            completion_tokens: 1124,
            total_tokens: 1134,
            cost: 0.0336135,
            prompt_tokens_details: {},
            completion_tokens_details: {
                reasoning_tokens: 4,
                image_tokens: 1120,
            },
        });

        const result = await callOpenRouterGeminiImageAPI("test prompt", {
            ...baseParams,
            model: "nanobanana-2-lite",
            width: 1920,
            height: 1080,
            reasoning: "pro",
        });

        expect(requests).toEqual([
            {
                model: "google/gemini-3.1-flash-lite-image",
                prompt: "test prompt",
                n: 1,
                aspect_ratio: "16:9",
                seed: 42,
                provider: {
                    only: ["google-vertex/global"],
                    allow_fallbacks: false,
                },
                resolution: "1K",
                reasoning_effort: "high",
            },
        ]);
        expect(result.trackingData).toEqual({
            actualModel: "nanobanana-2-lite",
            usage: {
                promptTextTokens: 10,
                completionReasoningTokens: 4,
                completionImageTokens: 1120,
            },
        });
    });

    it("pins NanoBanana Pro to 4K AI Studio with default reasoning", async () => {
        syncImageEnv(
            { OPENROUTER_API_KEY: "openrouter-test-key" } as CloudflareBindings,
            ["OPENROUTER_API_KEY"],
        );
        const requests: Record<string, unknown>[] = [];
        mockGeminiFetch(requests, {
            prompt_tokens: 14,
            completion_tokens: 2008,
            total_tokens: 2022,
            cost: 0.240124,
            prompt_tokens_details: {},
            completion_tokens_details: {
                reasoning_tokens: 8,
                image_tokens: 2000,
            },
        });

        const result = await callOpenRouterGeminiImageAPI("test prompt", {
            ...baseParams,
            model: "nanobanana-pro",
            width: 3840,
            height: 2160,
            reasoning: "pro",
        });

        expect(requests).toEqual([
            {
                model: "google/gemini-3-pro-image",
                prompt: "test prompt",
                n: 1,
                aspect_ratio: "16:9",
                seed: 42,
                provider: {
                    only: ["google-ai-studio/global"],
                    allow_fallbacks: false,
                },
                resolution: "4K",
            },
        ]);
        expect(result.trackingData).toEqual({
            actualModel: "nanobanana-pro",
            usage: {
                promptTextTokens: 14,
                completionReasoningTokens: 8,
                completionImageTokens: 2000,
            },
        });
    });

    it("validates and inlines edit images while preserving exact combined input billing", async () => {
        syncImageEnv(
            { OPENROUTER_API_KEY: "openrouter-test-key" } as CloudflareBindings,
            ["OPENROUTER_API_KEY"],
        );
        const requests: Record<string, unknown>[] = [];
        mockGeminiFetch(requests, {
            ...geminiUsage,
            prompt_tokens: 1302,
            total_tokens: 2592,
            cost: 0.0390906,
        });

        const result = await callOpenRouterGeminiImageAPI("edit prompt", {
            ...baseParams,
            model: "nanobanana",
            width: 1280,
            height: 720,
            image: [REFERENCE_IMAGE_URL],
        });

        expect(requests[0]).toEqual({
            model: "google/gemini-2.5-flash-image",
            prompt: "edit prompt",
            n: 1,
            aspect_ratio: "16:9",
            seed: 42,
            provider: {
                only: ["google-vertex/global"],
                allow_fallbacks: false,
            },
            input_references: [
                {
                    type: "image_url",
                    image_url: { url: PNG_DATA_URI },
                },
            ],
        });
        expect(result.trackingData.usage).toEqual({
            promptTextTokens: 1302,
            completionImageTokens: 1290,
        });
    });

    it("maps input-image tokens when OpenRouter supplies the split", () => {
        expect(
            mapOpenRouterGeminiImageUsage({
                ...geminiUsage,
                prompt_tokens: 1302,
                total_tokens: 2592,
                prompt_tokens_details: { image_tokens: 1290 },
            }),
        ).toEqual({
            promptTextTokens: 12,
            promptImageTokens: 1290,
            completionImageTokens: 1290,
        });
    });

    it("rejects invalid usage instead of underbilling", async () => {
        syncImageEnv(
            { OPENROUTER_API_KEY: "openrouter-test-key" } as CloudflareBindings,
            ["OPENROUTER_API_KEY"],
        );
        mockGeminiFetch([], {
            prompt_tokens: 9,
            completion_tokens: 1290,
            total_tokens: 9999,
            completion_tokens_details: { image_tokens: 1290 },
        });

        await expect(
            callOpenRouterGeminiImageAPI("test prompt", {
                ...baseParams,
                model: "nanobanana",
            }),
        ).rejects.toMatchObject({ status: 502 });
    });

    it("preserves content-policy rejections as client errors", async () => {
        syncImageEnv(
            { OPENROUTER_API_KEY: "openrouter-test-key" } as CloudflareBindings,
            ["OPENROUTER_API_KEY"],
        );
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({
                data: [],
                error: {
                    message: "Image rejected by provider content policy",
                    metadata: { error_type: "content_policy_violation" },
                },
            }),
        );

        await expect(
            callOpenRouterGeminiImageAPI("test prompt", {
                ...baseParams,
                model: "nanobanana",
            }),
        ).rejects.toMatchObject({
            status: 400,
            message: "Image rejected by provider content policy",
        });
    });

    it("rejects more than three reference images before fetching", async () => {
        syncImageEnv(
            { OPENROUTER_API_KEY: "openrouter-test-key" } as CloudflareBindings,
            ["OPENROUTER_API_KEY"],
        );
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(
            callOpenRouterGeminiImageAPI("edit prompt", {
                ...baseParams,
                model: "nanobanana",
                image: [
                    REFERENCE_IMAGE_URL,
                    REFERENCE_IMAGE_URL,
                    REFERENCE_IMAGE_URL,
                    REFERENCE_IMAGE_URL,
                ],
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});

describe("OpenRouter Seedream 4.5 Pro", () => {
    function mockSeedreamResponse(requests: Record<string, unknown>[]) {
        return vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async (url, init) => {
                const href = typeof url === "string" ? url : url.toString();
                if (
                    href === REFERENCE_IMAGE_URL ||
                    href === WIDE_REFERENCE_IMAGE_URL
                ) {
                    return new Response(
                        href === WIDE_REFERENCE_IMAGE_URL ? WIDE_PNG : PNG,
                        {
                            headers: { "Content-Type": "image/png" },
                        },
                    );
                }
                if (href !== OPENROUTER_IMAGE_URL) {
                    return new Response("unexpected URL", { status: 404 });
                }
                requests.push(
                    JSON.parse(init?.body as string) as Record<string, unknown>,
                );
                return Response.json({
                    data: [{ b64_json: PNG.toString("base64") }],
                    usage: {
                        completion_tokens: 16384,
                        cost: 0.04,
                        completion_tokens_details: { image_tokens: 16384 },
                    },
                });
            });
    }

    it("pins the Seed provider without fallbacks and preserves flat billing", async () => {
        syncImageEnv(
            { OPENROUTER_API_KEY: "openrouter-test-key" } as CloudflareBindings,
            ["OPENROUTER_API_KEY"],
        );
        const requests: Record<string, unknown>[] = [];
        const fetchSpy = mockSeedreamResponse(requests);

        const result = await callOpenRouterSeedreamProAPI("test prompt", {
            ...baseParams,
            model: "seedream-pro",
            width: 2048,
            height: 2048,
        });

        expect(fetchSpy).toHaveBeenCalledWith(
            OPENROUTER_IMAGE_URL,
            expect.objectContaining({
                method: "POST",
                headers: {
                    Authorization: "Bearer openrouter-test-key",
                    "Content-Type": "application/json",
                },
            }),
        );
        expect(requests[0]).toEqual({
            model: "bytedance-seed/seedream-4.5",
            prompt: "test prompt",
            n: 1,
            size: "2048x2048",
            provider: {
                only: ["seed"],
                allow_fallbacks: false,
            },
        });
        expect(result.buffer).toEqual(PNG);
        expect(result.trackingData).toEqual({
            actualModel: "seedream-pro",
            usage: {
                completionImageTokens: 1,
                totalTokenCount: 1,
            },
        });
    });

    it("uses the 4K tier above 2048px and preserves explicit aspect ratios", async () => {
        syncImageEnv(
            { OPENROUTER_API_KEY: "openrouter-test-key" } as CloudflareBindings,
            ["OPENROUTER_API_KEY"],
        );
        const requests: Record<string, unknown>[] = [];
        mockSeedreamResponse(requests);

        await callOpenRouterSeedreamProAPI("wide prompt", {
            ...baseParams,
            model: "seedream-pro",
            width: 4096,
            height: 2304,
            aspectRatio: "16:9",
        });

        expect(requests[0]).toMatchObject({
            resolution: "4K",
            aspect_ratio: "16:9",
        });
    });

    it("inlines all reference images and matches their aspect ratio automatically", async () => {
        syncImageEnv(
            { OPENROUTER_API_KEY: "openrouter-test-key" } as CloudflareBindings,
            ["OPENROUTER_API_KEY"],
        );
        const requests: Record<string, unknown>[] = [];
        mockSeedreamResponse(requests);

        await callOpenRouterSeedreamProAPI("edit prompt", {
            ...baseParams,
            model: "seedream-pro",
            image: [WIDE_REFERENCE_IMAGE_URL, REFERENCE_IMAGE_URL],
        });

        expect(requests[0]).toMatchObject({
            size: "2560x1440",
            input_references: [
                {
                    type: "image_url",
                    image_url: { url: WIDE_PNG_DATA_URI },
                },
                {
                    type: "image_url",
                    image_url: { url: PNG_DATA_URI },
                },
            ],
        });
    });

    it("rejects the unsupported 9:21 ratio and more than 14 references", async () => {
        syncImageEnv(
            { OPENROUTER_API_KEY: "openrouter-test-key" } as CloudflareBindings,
            ["OPENROUTER_API_KEY"],
        );
        const params = {
            ...baseParams,
            model: "seedream-pro",
        } satisfies ImageParams;

        await expect(
            callOpenRouterSeedreamProAPI("test", {
                ...params,
                aspectRatio: "9:21",
            }),
        ).rejects.toMatchObject({ status: 400 });
        await expect(
            callOpenRouterSeedreamProAPI("test", {
                ...params,
                image: Array(15).fill(REFERENCE_IMAGE_URL),
            }),
        ).rejects.toMatchObject({ status: 400 });
    });
});

describe("OpenRouter Recraft vector", () => {
    const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';

    function mockRecraftResponse(
        requests: Record<string, unknown>[],
        mediaType: string | null = "image/svg+xml",
    ) {
        return vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async (url, init) => {
                const href = typeof url === "string" ? url : url.toString();
                if (href !== OPENROUTER_IMAGE_URL) {
                    return new Response("unexpected URL", { status: 404 });
                }
                requests.push(
                    JSON.parse(init?.body as string) as Record<string, unknown>,
                );
                return Response.json({
                    data: [
                        {
                            b64_json: Buffer.from(svg).toString("base64"),
                            ...(mediaType ? { media_type: mediaType } : {}),
                        },
                    ],
                    usage: {
                        prompt_tokens: 0,
                        completion_tokens: 4175,
                        total_tokens: 4175,
                        cost: 0.08,
                    },
                });
            });
    }

    it("pins Recraft without fallbacks and tracks the fixed output fee", async () => {
        syncImageEnv(
            { OPENROUTER_API_KEY: "openrouter-test-key" } as CloudflareBindings,
            ["OPENROUTER_API_KEY"],
        );
        const requests: Record<string, unknown>[] = [];
        const fetchSpy = mockRecraftResponse(requests);

        const result = await callOpenRouterRecraftVectorAPI("vector prompt", {
            ...baseParams,
            model: "recraft-v4.1-vector",
            width: 1280,
            height: 720,
        });

        expect(fetchSpy).toHaveBeenCalledWith(
            OPENROUTER_IMAGE_URL,
            expect.objectContaining({
                method: "POST",
                headers: {
                    Authorization: "Bearer openrouter-test-key",
                    "Content-Type": "application/json",
                },
            }),
        );
        expect(requests[0]).toEqual({
            model: "recraft/recraft-v4.1-vector",
            prompt: "vector prompt",
            n: 1,
            provider: {
                only: ["recraft"],
                allow_fallbacks: false,
            },
            aspect_ratio: "16:9",
        });
        expect(result.buffer.toString()).toBe(svg);
        expect(result.mimeType).toBe("image/svg+xml");
        expect(result.trackingData).toEqual({
            actualModel: "recraft-v4.1-vector",
            usage: { completionImageTokens: 1 },
        });
    });

    it("forwards one reference image without adding an input fee", async () => {
        syncImageEnv(
            { OPENROUTER_API_KEY: "openrouter-test-key" } as CloudflareBindings,
            ["OPENROUTER_API_KEY"],
        );
        const requests: Record<string, unknown>[] = [];
        mockRecraftResponse(requests);

        const result = await callOpenRouterRecraftVectorAPI("edit prompt", {
            ...baseParams,
            model: "recraft-v4.1-vector",
            image: ["https://example.com/input.svg"],
        });

        expect(requests[0]).toEqual({
            model: "recraft/recraft-v4.1-vector",
            prompt: "edit prompt",
            n: 1,
            provider: {
                only: ["recraft"],
                allow_fallbacks: false,
            },
            aspect_ratio: "1:1",
            input_references: [
                {
                    type: "image_url",
                    image_url: { url: "https://example.com/input.svg" },
                },
            ],
        });
        expect(result.trackingData.usage).toEqual({
            completionImageTokens: 1,
        });
    });

    it.each([null, "image/png"])(
        "rejects an unsupported %s response media type",
        async (mediaType) => {
            syncImageEnv(
                {
                    OPENROUTER_API_KEY: "openrouter-test-key",
                } as CloudflareBindings,
                ["OPENROUTER_API_KEY"],
            );
            mockRecraftResponse([], mediaType);

            await expect(
                callOpenRouterRecraftVectorAPI("vector prompt", {
                    ...baseParams,
                    model: "recraft-v4.1-vector",
                }),
            ).rejects.toMatchObject({
                status: 502,
                upstreamUrl: OPENROUTER_IMAGE_URL,
            });
        },
    );

    it("preserves provider capacity responses as retryable 429 errors", async () => {
        syncImageEnv(
            { OPENROUTER_API_KEY: "openrouter-test-key" } as CloudflareBindings,
            ["OPENROUTER_API_KEY"],
        );
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json(
                {
                    error: {
                        message: "Recraft upstream returned 429",
                        code: 429,
                    },
                },
                { status: 429 },
            ),
        );

        await expect(
            callOpenRouterRecraftVectorAPI("vector prompt", {
                ...baseParams,
                model: "recraft-v4.1-vector",
            }),
        ).rejects.toMatchObject({
            status: 429,
            upstreamStatus: 429,
            requestUrl: new URL(OPENROUTER_IMAGE_URL),
        });
    });
});
