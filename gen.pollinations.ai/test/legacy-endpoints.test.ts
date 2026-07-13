import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { createTestR2Bucket } from "@shared/test/mocks/r2.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index.ts";
import { generateCacheKey } from "../src/utils/media-cache.ts";

function testEnv(overrides: Partial<CloudflareBindings> = {}) {
    return {
        ...env,
        ENVIRONMENT: "test",
        LOG_LEVEL: "error",
        LOG_FORMAT: "text",
        BETTER_AUTH_SECRET: "legacy-endpoints-test-secret",
        PORTKEY_GATEWAY_URL: "https://portkey.test",
        OVHCLOUD_API_KEY: "ovh-test-key",
        TINYBIRD_INGEST_URL: "https://tinybird.test/events",
        TINYBIRD_INGEST_TOKEN: "tinybird-test-token",
        ...overrides,
    } as CloudflareBindings;
}

function chatCompletionResponse() {
    return Response.json({
        id: "chatcmpl_legacy",
        object: "chat.completion",
        created: 1,
        model: "gpt-oss-20b",
        choices: [
            {
                index: 0,
                message: { role: "assistant", content: "hello" },
                finish_reason: "stop",
            },
        ],
        usage: {
            prompt_tokens: 1,
            completion_tokens: 1,
            total_tokens: 2,
        },
    });
}

async function fetchWorker(
    url: string,
    init: RequestInit = {},
    bindings = testEnv(),
) {
    const ctx = createExecutionContext();
    const response = await worker.fetch(new Request(url, init), bindings, ctx);
    await waitOnExecutionContext(ctx);
    return response;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("legacy API hostnames", () => {
    it("serves legacy model-list response shapes from the normal registry", async () => {
        const [textResponse, openaiResponse, imageResponse] = await Promise.all(
            [
                fetchWorker("https://text.pollinations.ai/models"),
                fetchWorker("https://text.pollinations.ai/openai/models"),
                fetchWorker("https://image.pollinations.ai/models"),
            ],
        );

        expect(textResponse.status).toBe(200);
        await expect(textResponse.json()).resolves.toEqual([
            expect.objectContaining({
                name: "openai-fast",
                pricing: expect.objectContaining({
                    promptTextTokens: "0",
                    completionTextTokens: "0",
                }),
            }),
        ]);
        await expect(openaiResponse.json()).resolves.toMatchObject({
            object: "list",
            data: [{ id: "openai-fast" }],
        });
        await expect(imageResponse.json()).resolves.toEqual(["sana"]);
    });

    it("lists Sana and GPT-OSS as zero-priced normal models", async () => {
        const [textResponse, imageResponse] = await Promise.all([
            fetchWorker("https://gen.pollinations.ai/text/models"),
            fetchWorker("https://gen.pollinations.ai/image/models"),
        ]);
        const textModels = (await textResponse.json()) as {
            name: string;
            pricing: Record<string, string>;
        }[];
        const imageModels = (await imageResponse.json()) as {
            name: string;
            pricing: Record<string, string>;
        }[];

        expect(
            textModels.find((model) => model.name === "gpt-oss")?.pricing,
        ).toMatchObject({
            promptTextTokens: "0",
            completionTextTokens: "0",
        });
        expect(
            imageModels.find((model) => model.name === "sana")?.pricing,
        ).toMatchObject({
            completionImageTokens: "0",
        });
    });

    it("routes anonymous legacy text requests to GPT-OSS and tracks them", async () => {
        const providerHosts: (string | null)[] = [];
        const trackedEvents: Record<string, unknown>[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                const request = new Request(input, init);
                const hostname = new URL(request.url).hostname;
                if (hostname === "portkey.test") {
                    providerHosts.push(
                        request.headers.get("x-portkey-custom-host"),
                    );
                    return chatCompletionResponse();
                }
                if (hostname === "tinybird.test") {
                    trackedEvents.push(JSON.parse(await request.text()));
                    return new Response(null, { status: 202 });
                }
                return new Response("unexpected fetch", { status: 500 });
            },
        );

        const response = await fetchWorker(
            "https://text.pollinations.ai/v1/chat/completions",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "openai-fast",
                    messages: [{ role: "user", content: "hello" }],
                }),
            },
        );

        expect(response.status).toBe(200);
        expect(providerHosts).toEqual([
            "https://gpt-oss-20b.endpoints.kepler.ai.cloud.ovh.net/api/openai_compat/v1",
        ]);
        expect(trackedEvents).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    modelRequested: "openai-fast",
                    resolvedModelRequested: "gpt-oss",
                    totalPrice: 0,
                }),
            ]),
        );
    });

    it.each([
        {
            endpoint: "legacy",
            url: "https://text.pollinations.ai/v1/chat/completions",
            ip: "203.0.113.88",
        },
        {
            endpoint: "normal",
            url: "https://gen.pollinations.ai/v1/chat/completions",
            ip: "203.0.113.89",
        },
    ])("rate limits GPT-OSS cache misses on the $endpoint endpoint", async ({
        url,
        ip,
    }) => {
        let providerRequests = 0;
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                const request = new Request(input, init);
                if (new URL(request.url).hostname === "portkey.test") {
                    providerRequests++;
                    return chatCompletionResponse();
                }
                return new Response(null, { status: 202 });
            },
        );
        const bindings = testEnv();
        const headers = {
            "CF-Connecting-IP": ip,
            "Content-Type": "application/json",
        };
        const request = (content: string) =>
            fetchWorker(
                url,
                {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        model: "gpt-oss",
                        messages: [{ role: "user", content }],
                    }),
                },
                bindings,
            );

        const first = await request("first cache miss");
        const second = await request("second cache miss");

        expect(first.status).toBe(200);
        expect(second.status).toBe(429);
        expect(second.headers.get("Retry-After")).toBeTruthy();
        expect(providerRequests).toBe(1);
    });

    it("reuses legacy image cache keys before auth and rate limiting", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(null, { status: 202 }),
        );
        const bucket = createTestR2Bucket();
        const url = new URL(
            "https://image.pollinations.ai/prompt/cached-cat?width=512&token=ignored",
        );
        await bucket.put(generateCacheKey(url), new Uint8Array([1, 2, 3]), {
            httpMetadata: { contentType: "image/jpeg" },
        });

        const response = await fetchWorker(
            url.toString(),
            {},
            testEnv({
                IMAGE_BUCKET: bucket,
            }),
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("X-Cache")).toBe("HIT");
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(
            new Uint8Array([1, 2, 3]),
        );
    });

    it("rejects an invalid supplied key even when the image is cached", async () => {
        const bucket = createTestR2Bucket();
        const url = new URL("https://image.pollinations.ai/prompt/cached-cat");
        await bucket.put(generateCacheKey(url), new Uint8Array([1, 2, 3]), {
            httpMetadata: { contentType: "image/jpeg" },
        });

        const response = await fetchWorker(
            url.toString(),
            { headers: { Authorization: "Bearer invalid-test-key" } },
            testEnv({ IMAGE_BUCKET: bucket }),
        );

        expect(response.status).toBe(401);
    });

    it.each([
        {
            endpoint: "legacy",
            url: "https://image.pollinations.ai/prompt/uncached-cat",
            ip: "203.0.113.77",
        },
        {
            endpoint: "normal",
            url: "https://gen.pollinations.ai/image/uncached-cat?model=sana",
            ip: "203.0.113.78",
        },
    ])("rate limits Sana cache misses on the $endpoint endpoint", async ({
        url,
        ip,
    }) => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(null, { status: 202 }),
        );
        const bindings = testEnv({ IMAGE_BUCKET: createTestR2Bucket() });
        const headers = { "CF-Connecting-IP": ip };

        const first = await fetchWorker(url, { headers }, bindings);
        const second = await fetchWorker(url, { headers }, bindings);

        expect(first.status).toBe(500);
        await expect(first.json()).resolves.toMatchObject({
            error: expect.objectContaining({
                message: expect.stringContaining("sana"),
            }),
        });
        expect(second.status).toBe(429);
        expect(second.headers.get("Retry-After")).toBeTruthy();
    });
});
