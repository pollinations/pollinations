import { afterEach, describe, expect, it, vi } from "vitest";
import { syncImageEnv } from "../../src/image/env.ts";
import {
    callOpenRouterGrokImagineProAPI,
    callOpenRouterRecraftVectorAPI,
} from "../../src/image/models/openRouterImageModel.ts";
import type { ImageParams } from "../../src/image/params.ts";

const OPENROUTER_IMAGE_URL = "https://openrouter.ai/api/v1/images";

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
                return new Response(
                    JSON.stringify({
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
                    }),
                    { status: 200 },
                );
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

    it.each([
        null,
        "image/png",
    ])("rejects an unsupported %s response media type", async (mediaType) => {
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
    });

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
