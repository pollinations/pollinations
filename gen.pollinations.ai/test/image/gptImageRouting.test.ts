import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { remapUpstreamStatus } from "@shared/error.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import {
    calculateCost,
    calculatePrice,
    calculateUsageBilling,
    getVisibleImageModels,
} from "@shared/registry/registry.ts";
import { test as routeTest } from "@shared/test/fixtures/index.ts";
import {
    createFetchMock,
    teardownFetchMock,
} from "@shared/test/mocks/fetch.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    hashGenerationCacheIdentity,
    normalizedJsonBody,
} from "@/middleware/generation-cache.ts";
import { generateCacheKey } from "@/utils/media-cache.ts";
import {
    type AuthResult,
    callGPTImage,
} from "../../src/image/createAndReturnImages.ts";
import { syncImageEnv } from "../../src/image/env.ts";
import type { ImageParams } from "../../src/image/params.ts";
import worker from "../../src/index.ts";
import { withInlineGenerationCoordinator } from "../helpers/inline-generation-coordinator.ts";

// Valid 2x2 images. The GIF contains two distinct frames, each lasting 150 ms.
const flareImages = {
    png: "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP8zwACTGCSAQANHQEDgslx/wAAAABJRU5ErkJggg==",
    webp: "UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoCAAIAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=",
    gif: "R0lGODlhAgACAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQADwAAACwAAAAAAgACAAAIBgABCAQQEAAh+QQBDwABACwAAAAAAgACAIEAAP8AAAAAAAAAAAAIBgABCAQQEAA7",
};
const legacyJpeg =
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAACAAIBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AP7//2Q==";

const AZURE_KEY_ENV = {
    AZURE_MYCELI_PROD_IMG_2_SWEDEN_API_KEY: "img-2-sweden-key",
    AZURE_MYCELI_PROD_IMG_2_EASTUS2_API_KEY: "img-2-eastus2-key",
    AZURE_MYCELI_PROD_WESTUS3_API_KEY: "westus3-key",
    AZURE_MYCELI_PROD_POLANDCENTRAL_API_KEY: "polandcentral-key",
    AZURE_MYCELI_PROD_IMG_25_FLARE_SWEDEN_API_KEY: "flare-sweden-key",
    AZURE_MYCELI_PROD_IMG_25_SUNBURST_SWEDEN_API_KEY: "sunburst-sweden-key",
    OPENAI_API_KEY: "openai-key",
    FAL_KEY: "fal-key",
} as const;

const AZURE_KEY_NAMES = Object.keys(
    AZURE_KEY_ENV,
) as (keyof typeof AZURE_KEY_ENV)[];

const EXPECTED_HOSTS = new Set([
    "myceli-prod-img-2-swedencentral.cognitiveservices.azure.com",
    "myceli-prod-img-2-eastus2.cognitiveservices.azure.com",
    "westus3.api.cognitive.microsoft.com",
    "polandcentral.api.cognitive.microsoft.com",
]);

const params: ImageParams = {
    model: "openai/gpt-image-2",
    width: 1024,
    height: 1024,
    dimensionsExplicit: true,
    seed: 42,
    safe: false,
    quality: "low",
    image: [],
    transparent: false,
    reasoning: "balanced",
    audio: false,
};

const userInfo: AuthResult = {
    tokenAuth: true,
    userId: "test-user",
};

function successResponse(base64 = "AQID"): Response {
    return Response.json({
        data: [{ b64_json: base64 }],
        usage: {
            input_tokens: 10,
            output_tokens: 20,
            input_tokens_details: { text_tokens: 10, image_tokens: 0 },
        },
    });
}

/** The caller's own request errors: every region would reject them. */
const CALLER_ERRORS = [400, 422];

/** Azure-side failures: bad key, quota, blocked resource, missing deployment, rate limit, timeout, server error. */
const AZURE_FAILURES = [401, 402, 403, 404, 408, 429, 500, 503, 524];

/** Azure's per-resource abuse block, which quotes content-policy wording. */
const AZURE_RESOURCE_BLOCK = JSON.stringify({
    error: {
        code: "403",
        message:
            "Your resource has been temporarily blocked because we detected behavior that may violate our content policy.",
    },
});

beforeEach(() => {
    syncImageEnv(AZURE_KEY_ENV as CloudflareBindings, AZURE_KEY_NAMES);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("Flare format cache", () => {
    afterEach(teardownFetchMock);

    for (const { method, format, query } of [
        { method: "GET", format: "png", query: "" },
        { method: "GET", format: "webp", query: "&output_format=webp" },
        {
            method: "GET",
            format: "gif",
            query: "&output_format=gif&frame_count=2&frame_duration_ms=150",
        },
        { method: "POST", format: "png", query: "" },
    ] as const) {
        routeTest(
            `serves ${format} on a fresh ${method} response and on the next cache hit`,
            async ({ paidApiKey }) => {
                const model = "openai/gpt-image-2.6-flare";
                const prompt = "flare format cache regression";
                const seed = 42;
                const url = new URL(
                    method === "GET"
                        ? `/image/${encodeURIComponent(prompt)}?model=${model}&seed=${seed}${query}`
                        : "/v1/images/generations",
                    "https://gen.pollinations.ai",
                );
                const legacyUrl = new URL(url);
                if (method === "POST") {
                    const body = normalizedJsonBody(
                        JSON.stringify({
                            prompt,
                            model,
                            width: 1024,
                            height: 1024,
                            quality: "medium",
                            seed,
                        }),
                    );
                    legacyUrl.searchParams.set(
                        "__request_body",
                        await hashGenerationCacheIdentity("media", body),
                    );
                }
                await env.MEDIA.put(
                    await generateCacheKey(legacyUrl),
                    new Response(Buffer.from(legacyJpeg, "base64"), {
                        headers: { "Content-Type": "image/jpeg" },
                    }),
                );

                const requests: unknown[] = [];
                const mocks = createFetchMock({
                    tinybird: createMockTinybird(),
                    upstream: {
                        state: requests,
                        handlerMap: {
                            "api.openai.com": async (request: Request) => {
                                requests.push(await request.json());
                                return successResponse(flareImages[format]);
                            },
                            "content-safety.test": async () =>
                                Response.json({ categoriesAnalysis: [] }),
                        },
                        reset: () => {
                            requests.length = 0;
                        },
                    },
                });
                await mocks.enable("tinybird", "upstream");

                const bindings = withInlineGenerationCoordinator(env);
                for (const cache of ["MISS", "HIT"]) {
                    const ctx = createExecutionContext();
                    const response = await worker.fetch(
                        new Request(url, {
                            method,
                            headers: {
                                Authorization: `Bearer ${paidApiKey}`,
                                "Content-Type": "application/json",
                            },
                            body:
                                method === "POST"
                                    ? JSON.stringify({ model, prompt, seed })
                                    : undefined,
                        }),
                        bindings,
                        ctx,
                    );
                    const error = response.ok
                        ? ""
                        : await response.clone().text();
                    expect(response.status, error).toBe(200);
                    expect(response.headers.get("X-Cache")).toBe(cache);
                    if (method === "GET") {
                        expect(response.headers.get("Content-Type")).toBe(
                            `image/${format}`,
                        );
                        expect(
                            Buffer.from(await response.arrayBuffer()),
                        ).toEqual(Buffer.from(flareImages[format], "base64"));
                    } else {
                        expect(await response.json()).toMatchObject({
                            data: [{ b64_json: flareImages[format] }],
                        });
                    }
                    await waitOnExecutionContext(ctx);
                }

                expect(requests).toEqual([
                    expect.objectContaining({
                        model: "gpt-image-2.6-flare",
                        output_format: format,
                        ...(format === "gif"
                            ? { frame_count: 2, frame_duration_ms: 150 }
                            : {}),
                    }),
                ]);
            },
        );
    }
});

describe("openai/gpt-image-2 Azure routing", () => {
    it("round robins across all Azure endpoints", async () => {
        const urls: string[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
            urls.push(String(input));
            return successResponse();
        });

        for (let index = 0; index < EXPECTED_HOSTS.size; index++) {
            await callGPTImage("test", params, userInfo, "openai/gpt-image-2");
        }

        expect(new Set(urls.map((url) => new URL(url).host))).toEqual(
            EXPECTED_HOSTS,
        );
        expect(urls.every((url) => url.includes("api-version="))).toBe(true);
    });

    for (const status of CALLER_ERRORS) {
        it(`fails a ${status} to the caller instead of trying another region`, async () => {
            const fetchMock = vi
                .spyOn(globalThis, "fetch")
                .mockResolvedValue(
                    new Response("upstream said no", { status }),
                );

            await expect(
                callGPTImage("test", params, userInfo, "openai/gpt-image-2"),
            ).rejects.toMatchObject({
                status: remapUpstreamStatus(status),
                upstreamStatus: status,
            });
            expect(fetchMock).toHaveBeenCalledOnce();
        });
    }

    for (const status of AZURE_FAILURES) {
        it(`tries the other region after a ${status}`, async () => {
            const hosts: string[] = [];
            vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
                hosts.push(new URL(String(input)).host);
                return hosts.length === 1
                    ? new Response("refused", { status })
                    : successResponse();
            });

            await callGPTImage("test", params, userInfo, "openai/gpt-image-2");

            expect(new Set(hosts).size).toBe(2);
            expect(hosts.every((host) => EXPECTED_HOSTS.has(host))).toBe(true);
        });

        it(`fails a ${status} to the caller once every region failed`, async () => {
            const fetchMock = vi
                .spyOn(globalThis, "fetch")
                .mockImplementation(
                    async () => new Response("refused", { status }),
                );

            await expect(
                callGPTImage("test", params, userInfo, "openai/gpt-image-2"),
            ).rejects.toMatchObject({ upstreamStatus: status });
            expect(fetchMock).toHaveBeenCalledTimes(EXPECTED_HOSTS.size);
        });
    }

    it("tries the other region when Azure blocks one resource", async () => {
        const hosts: string[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
            hosts.push(new URL(String(input)).host);
            return hosts.length === 1
                ? new Response(AZURE_RESOURCE_BLOCK, { status: 403 })
                : successResponse();
        });

        await callGPTImage("test", params, userInfo, "openai/gpt-image-2");

        expect(new Set(hosts).size).toBe(2);
        expect(hosts.every((host) => EXPECTED_HOSTS.has(host))).toBe(true);
    });

    // Every region would refuse the same prompt, so a retry only adds a call.
    it("fails a content-policy refusal without trying another region", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json(
                {
                    error: {
                        code: "content_policy_violation",
                        message:
                            "Your request was rejected as a result of our safety system.",
                    },
                },
                { status: 403 },
            ),
        );

        await expect(
            callGPTImage("test", params, userInfo, "openai/gpt-image-2"),
        ).rejects.toMatchObject({ upstreamStatus: 403 });
        expect(fetchMock).toHaveBeenCalledOnce();
    });
});

describe("GPT Image direct OpenAI routing", () => {
    const routes = [
        ["openai/gpt-image-1-mini:openai", "gpt-image-1-mini"],
        ["openai/gpt-image-1.5:openai", "gpt-image-1.5"],
        ["openai/gpt-image-2:openai", "gpt-image-2"],
        ["openai/gpt-image-2.5-flare:openai", "gpt-image-2.5-flare"],
        ["openai/gpt-image-2.5-sunburst:openai", "gpt-image-2.5-sunburst"],
        ["openai/gpt-image-2.6-flare", "gpt-image-2.6-flare"],
        ["openai/gpt-image-2.6-sunburst", "gpt-image-2.6-sunburst"],
    ] as const;

    for (const [route, upstreamModel] of routes) {
        it(`routes ${route} directly to ${upstreamModel}`, async () => {
            const fetchMock = vi
                .spyOn(globalThis, "fetch")
                .mockResolvedValue(successResponse());

            await callGPTImage(
                "test",
                { ...params, model: route },
                userInfo,
                route,
            );

            expect(fetchMock).toHaveBeenCalledOnce();
            const [url, init] = fetchMock.mock.calls[0];
            expect(String(url)).toBe(
                "https://api.openai.com/v1/images/generations",
            );
            expect(JSON.parse(String(init?.body))).toMatchObject({
                model: upstreamModel,
            });
        });
    }

    it("forwards GIF frame timing to OpenAI Flare and reports GIF output", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(successResponse(flareImages.gif));
        const model = "openai/gpt-image-2.6-flare";
        const result = await callGPTImage(
            "a pollinating bee in flight",
            {
                ...params,
                model,
                output_format: "gif",
                frame_count: 9,
                frame_duration_ms: 150,
                background: "auto",
                quality: "auto",
            },
            userInfo,
            model,
        );
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toBe(
            "https://api.openai.com/v1/images/generations",
        );
        expect(JSON.parse(String(init?.body))).toMatchObject({
            model: "gpt-image-2.6-flare",
            output_format: "gif",
            frame_count: 9,
            frame_duration_ms: 150,
            size: "512x512",
            background: "auto",
            quality: "auto",
        });
        expect(result.mimeType).toBe("image/gif");
        expect(result.buffer).toEqual(Buffer.from(flareImages.gif, "base64"));
    });

    it("fits 16:9 GIF frames inside the upstream GIF pixel budget", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(successResponse());
        const model = "openai/gpt-image-2.6-flare";
        await callGPTImage(
            "test",
            {
                ...params,
                model,
                width: 1536,
                height: 864,
                output_format: "gif",
                frame_count: 9,
                frame_duration_ms: 150,
            },
            userInfo,
            model,
        );
        expect(
            JSON.parse(String(fetchMock.mock.calls[0][1]?.body)),
        ).toMatchObject({
            size: "896x512",
            output_format: "gif",
            frame_count: 9,
        });
    });

    it("forwards WebP while keeping PNG as the default Flare format", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(successResponse(flareImages.webp))
            .mockResolvedValueOnce(successResponse(flareImages.png));
        const model = "openai/gpt-image-2.6-flare";
        const webp = await callGPTImage(
            "test",
            { ...params, model, output_format: "webp" },
            userInfo,
            model,
        );
        const png = await callGPTImage(
            "test",
            { ...params, model },
            userInfo,
            model,
        );
        expect(
            JSON.parse(String(fetchMock.mock.calls[0][1]?.body)),
        ).toMatchObject({
            output_format: "webp",
        });
        expect(
            JSON.parse(String(fetchMock.mock.calls[1][1]?.body)),
        ).toMatchObject({
            output_format: "png",
        });
        expect(webp.mimeType).toBe("image/webp");
        expect(png.mimeType).toBe("image/png");
    });

    it("keeps Azure rotation independent from direct OpenAI calls", async () => {
        const urls: string[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
            urls.push(String(input));
            return successResponse();
        });

        await callGPTImage("test", params, userInfo, "openai/gpt-image-2");
        await callGPTImage(
            "test",
            { ...params, model: "openai/gpt-image-2:openai" },
            userInfo,
            "openai/gpt-image-2:openai",
        );
        await callGPTImage("test", params, userInfo, "openai/gpt-image-2");

        const azureHosts = urls
            .map((url) => new URL(url).host)
            .filter((host) => host !== "api.openai.com");
        // The direct OpenAI call does not advance the Azure rotation.
        expect(new Set(azureHosts).size).toBe(2);
    });
});

describe("GPT Image 2.6 fal fallback", () => {
    it("forwards GIF parameters to the Flare fallback and returns GIF bytes", async () => {
        const gif = Buffer.from(flareImages.gif, "base64");
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json(
                {
                    images: [
                        {
                            url: `data:image/gif;base64,${gif.toString("base64")}`,
                            content_type: "image/gif",
                        },
                    ],
                },
                { headers: { "x-fal-billable-units": "0.01" } },
            ),
        );
        const model = "openai/gpt-image-2.6-flare:fal";
        const result = await callGPTImage(
            "pollinating bee in flight",
            {
                ...params,
                model,
                output_format: "gif",
                frame_count: 9,
                frame_duration_ms: 150,
                background: "auto",
            },
            userInfo,
            model,
        );
        expect(
            JSON.parse(String(fetchMock.mock.calls[0][1]?.body)),
        ).toMatchObject({
            output_format: "gif",
            frame_count: 9,
            frame_duration_ms: 150,
            background: "auto",
        });
        expect(result.buffer).toEqual(gif);
        expect(result.mimeType).toBe("image/gif");
    });

    for (const variant of ["flare", "sunburst"] as const) {
        const model = `openai/gpt-image-2.6-${variant}` as const;
        const fallback = `${model}:fal` as const;

        it(`${model} uses the paid-only primary price and keeps the fallback private`, () => {
            const definition = IMAGE_SERVICES[model];
            expect(definition).toMatchObject({
                provider: "openai",
                paidOnly: true,
                priceMultiplier: 1,
                aliases: [],
                fallbacks: [fallback],
            });
            expect(getVisibleImageModels()).not.toContain(fallback);
            expect(
                calculatePrice(model, {
                    promptTextTokens: 15,
                    completionImageTokens: 824,
                }).totalPrice,
            ).toBeCloseTo(0.024795, 8);
        });

        it(`${fallback} preserves image parameters and bills the reported receipt without fabricated tokens`, async () => {
            const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
                Response.json(
                    {
                        images: [
                            {
                                url: "data:image/png;base64,AQID",
                                content_type: "image/png",
                            },
                        ],
                    },
                    { headers: { "x-fal-billable-units": "0.0248" } },
                ),
            );
            const result = await callGPTImage(
                "test",
                {
                    ...params,
                    model: fallback,
                    width: 1536,
                    height: 864,
                    transparent: true,
                },
                userInfo,
                fallback,
            );
            expect(fetchMock).toHaveBeenCalledOnce();
            const [url, init] = fetchMock.mock.calls[0];
            expect(url).toBe(
                `https://fal.run/openai/gpt-image-2.6/${variant}/text-to-image`,
            );
            expect(JSON.parse(String(init?.body))).toMatchObject({
                prompt: "test",
                quality: "low",
                image_size: { width: 1536, height: 864 },
                background: "transparent",
                output_format: "png",
                sync_mode: true,
                enable_safety_checker: true,
            });
            expect(new Headers(init?.headers).get("authorization")).toBe(
                "Key fal-key",
            );
            expect(result.buffer).toEqual(Buffer.from([1, 2, 3]));
            expect(result.trackingData.usage).toEqual({});
            const billing = calculateUsageBilling({
                model,
                usage: result.trackingData.usage,
                servedBy: IMAGE_SERVICES[fallback],
                quotedBy: IMAGE_SERVICES[model],
                input: { providerBilling: result.trackingData.providerBilling },
            });
            expect(billing.cost.totalCost).toBe(0.0248);
            expect(billing.price.totalPrice).toBe(0.0248);
            expect(billing.adjustments).toHaveLength(1);
        });
    }

    it("rejects a fal response without its billing receipt", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({ images: [{ url: "data:image/png;base64,AQID" }] }),
        );
        const model = "openai/gpt-image-2.6-flare:fal";
        await expect(
            callGPTImage("test", { ...params, model }, userInfo, model),
        ).rejects.toThrow("Fal response has no billable units");
    });
});

describe("GPT Image 2.5", () => {
    for (const model of [
        "openai/gpt-image-2.5-flare",
        "openai/gpt-image-2.5-sunburst",
    ] as const) {
        it(`${model} routes to its dedicated Sweden Central resource`, async () => {
            const fetchMock = vi
                .spyOn(globalThis, "fetch")
                .mockResolvedValue(successResponse());
            await callGPTImage("test", { ...params, model }, userInfo, model);
            const [url, init] = fetchMock.mock.calls[0];
            const slug = model.slice("openai/".length);
            const variant = slug.slice("gpt-image-2.5-".length);
            expect(String(url)).toContain(
                `https://myceli-prod-img-25-${variant}-sweden.cognitiveservices.azure.com/openai/deployments/${slug}/images/generations`,
            );
            expect(new Headers(init?.headers).get("authorization")).toBe(
                `Bearer ${variant}-sweden-key`,
            );
        });

        it(`${model} preserves custom dimensions and transparency`, async () => {
            const fetchMock = vi
                .spyOn(globalThis, "fetch")
                .mockResolvedValue(successResponse());
            await callGPTImage(
                "test",
                {
                    ...params,
                    model,
                    width: 1536,
                    height: 864,
                    transparent: true,
                },
                userInfo,
                model,
            );
            const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
            expect(body).toMatchObject({
                size: "1536x864",
                background: "transparent",
                output_format: "png",
            });
        });

        it(`${model} charges paid balance at 0.75x provider cost`, () => {
            // Usage from the live low-quality generation probe, plus image input.
            const usage = {
                promptTextTokens: 14,
                promptImageTokens: 100,
                completionImageTokens: 196,
            };
            expect(IMAGE_SERVICES[model].paidOnly).toBe(true);
            expect(calculateCost(model, usage).totalCost).toBeCloseTo(
                0.00675,
                8,
            );
            expect(calculatePrice(model, usage).totalPrice).toBeCloseTo(
                0.0050625,
                8,
            );
        });
    }
});
