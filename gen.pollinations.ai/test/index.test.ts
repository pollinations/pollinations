import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { test as fixtureTest } from "@shared/test/fixtures/index.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index.ts";

afterEach(() => {
    vi.restoreAllMocks();
});

function envWithEnter(
    fetch: Fetcher["fetch"] = async () => new Response("enter"),
): CloudflareBindings {
    return {
        ENTER: { fetch } as unknown as Fetcher,
        ENVIRONMENT: "test",
        LOG_LEVEL: "debug",
        LOG_FORMAT: "text",
    } as CloudflareBindings;
}

async function fetchWorker(
    path: string,
    env = envWithEnter(),
    init: RequestInit = {},
): Promise<Response> {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://staging.gen.pollinations.ai${path}`, init),
        env,
        ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
}

async function optionsWorker(
    path: string,
    headers: Record<string, string>,
    env = envWithEnter(),
): Promise<Response> {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://staging.gen.pollinations.ai${path}`, {
            method: "OPTIONS",
            headers,
        }),
        env,
        ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
}

describe("gen worker routing", () => {
    it("redirects root to docs", async () => {
        const response = await fetchWorker("/");

        expect(response.status).toBe(301);
        expect(response.headers.get("Location")).toBe(
            "https://staging.gen.pollinations.ai/docs",
        );
    });

    it("accepts docs with a trailing slash", async () => {
        const response = await fetchWorker("/docs/");

        expect(response.status).toBe(301);
        expect(response.headers.get("Location")).toBe(
            "https://staging.gen.pollinations.ai/docs",
        );
    });

    it("redirects legacy /api/docs paths to gen docs", async () => {
        const response = await fetchWorker(
            "/api/docs/open-api/generate-schema?format=json",
        );

        expect(response.status).toBe(301);
        expect(response.headers.get("Location")).toBe(
            "https://staging.gen.pollinations.ai/docs/open-api/generate-schema?format=json",
        );
    });

    it("does not treat /api/docssomething as a docs alias", async () => {
        const response = await fetchWorker("/api/docssomething");

        expect(response.status).toBe(404);
        expect(response.headers.get("Location")).toBeNull();
    });

    it("allows permissive CORS preflights for public API routes", async () => {
        const response = await optionsWorker("/v1/chat/completions", {
            Origin: "https://example.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers":
                "Authorization, Content-Type, X-Pollinations-Test",
        });

        expect(response.status).toBe(204);
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
        expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
            "PATCH",
        );
        expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
            "Authorization,Content-Type,X-Pollinations-Test",
        );
        expect(response.headers.get("Access-Control-Expose-Headers")).toBe("*");
    });

    it("serves robots.txt locally", async () => {
        const response = await fetchWorker("/robots.txt");

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe("text/plain");
        await expect(response.text()).resolves.toContain("Disallow: /api/");
    });

    it("does not expose /api routes on gen", async () => {
        const response = await fetchWorker("/api/generate/v1/chat/completions");

        expect(response.status).toBe(404);
        expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    });

    it("proxies public account api routes to enter", async () => {
        let proxiedUrl: string | undefined;
        const env = envWithEnter(async (request) => {
            proxiedUrl = new Request(request).url;
            return new Response("account");
        });

        const response = await fetchWorker("/account/keys?limit=10", env);

        expect(response.status).toBe(200);
        expect(proxiedUrl).toBe(
            "https://staging.gen.pollinations.ai/api/account/keys?limit=10",
        );
        expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    });

    it("forwards account root to enter unchanged", async () => {
        let proxiedUrl: string | undefined;
        const env = envWithEnter(async (request) => {
            proxiedUrl = new Request(request).url;
            return new Response("account-ui");
        });

        const response = await fetchWorker("/account", env);

        expect(response.status).toBe(200);
        expect(proxiedUrl).toBe("https://staging.gen.pollinations.ai/account");
        expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    });

    it("forwards account root with a trailing slash to enter unchanged", async () => {
        let proxiedUrl: string | undefined;
        const env = envWithEnter(async (request) => {
            proxiedUrl = new Request(request).url;
            return new Response("account-ui");
        });

        const response = await fetchWorker("/account/", env);

        expect(response.status).toBe(200);
        expect(proxiedUrl).toBe("https://staging.gen.pollinations.ai/account/");
        expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    });

    it("routes docs through the generation app without noindex", async () => {
        const response = await fetchWorker("/docs/llm.txt", envWithEnter());

        expect(response.status).toBe(200);
        expect(response.headers.get("X-Robots-Tag")).toBeNull();
    });

    it.each([
        "/models",
        "/text/models",
        "/image/models",
        "/audio/models",
    ] as const)("routes public model path %s through gen", async (path) => {
        const response = await fetchWorker(path, envWithEnter());

        expect(response.status).toBe(200);
        const models = (await response.json()) as unknown[];
        expect(models).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: expect.any(String) }),
            ]),
        );
    });

    it("serves OpenAI-compatible models without auth", async () => {
        const response = await fetchWorker("/v1/models", envWithEnter());

        expect(response.status).toBe(200);
        const models = (await response.json()) as {
            object: string;
            data: {
                id: string;
                supported_endpoints?: string[];
                input_modalities?: string[];
                output_modalities?: string[];
            }[];
        };
        expect(models.object).toBe("list");
        const textModel = models.data.find((model) =>
            model.supported_endpoints?.includes("/v1/chat/completions"),
        );
        const imageModel = models.data.find((model) =>
            model.supported_endpoints?.includes("/v1/images/generations"),
        );
        const audioModel = models.data.find((model) =>
            model.supported_endpoints?.includes("/audio/{text}"),
        );

        expect(textModel).toMatchObject({
            id: expect.any(String),
            input_modalities: expect.any(Array),
            output_modalities: expect.any(Array),
            supported_endpoints: expect.arrayContaining(["/text/{prompt}"]),
        });
        expect(imageModel?.supported_endpoints).toContain("/image/{prompt}");
        expect(audioModel).toBeDefined();
    });

    it("adds CORS headers on public model responses", async () => {
        const response = await fetchWorker("/image/models", envWithEnter(), {
            headers: { Origin: "https://pollinations.ai" },
        });

        expect(response.status).toBe(200);
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });

    it("includes context windows on text model metadata", async () => {
        const response = await fetchWorker("/text/models", envWithEnter());

        expect(response.status).toBe(200);
        const models = (await response.json()) as {
            name: string;
            context_length?: number;
        }[];
        const modelsWithContext = models.filter(
            (model) => model.context_length != null,
        );

        expect(modelsWithContext.length).toBeGreaterThan(10);
        for (const model of modelsWithContext) {
            expect(model.context_length).toBeGreaterThan(0);
        }
    });
});

fixtureTest(
    "routes simple qwen audio requests through DashScope",
    async ({ apiKey }) => {
        const calls: string[] = [];

        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                const request = new Request(input, init);
                calls.push(request.url);

                if (
                    request.url ===
                    "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
                ) {
                    await expect(request.json()).resolves.toMatchObject({
                        model: "qwen3-tts-flash",
                        input: {
                            text: "Hello Qwen",
                            voice: "Serena",
                        },
                        parameters: {},
                    });

                    return Response.json({
                        output: {
                            audio: { url: "https://dashscope.test/audio.wav" },
                        },
                        usage: { characters: 10 },
                    });
                }

                if (request.url === "https://dashscope.test/audio.wav") {
                    return new Response(new Uint8Array([82, 73, 70, 70]), {
                        headers: { "Content-Type": "audio/wav" },
                    });
                }

                if (
                    request.url.startsWith(
                        "https://api.europe-west2.gcp.tinybird.co/v0/pipes/public_model_stats.json",
                    ) ||
                    request.url.startsWith("http://localhost:7181/")
                ) {
                    return Response.json({ data: [] });
                }

                throw new Error(`Unexpected fetch: ${request.url}`);
            },
        );

        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request(
                "https://staging.gen.pollinations.ai/audio/Hello%20Qwen?model=qwen-tts&voice=nova",
                {
                    headers: { Authorization: `Bearer ${apiKey}` },
                },
            ),
            {
                ...env,
                DASHSCOPE_API_KEY: "test-dashscope-key",
            } as unknown as CloudflareBindings,
            ctx,
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("audio/wav");
        expect(response.headers.get("x-model-used")).toBe("qwen-tts");
        expect(response.headers.get("x-usage-completion-audio-tokens")).toBe(
            "10",
        );
        expect(response.headers.get("x-tts-voice")).toBe("Serena");

        await waitOnExecutionContext(ctx);

        expect(calls).toContain(
            "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
        );
        expect(
            calls.some((url) => new URL(url).hostname === "api.elevenlabs.io"),
        ).toBe(false);
    },
);

fixtureTest(
    "rejects transcription models on OpenAI speech endpoint",
    async ({ apiKey }) => {
        const calls: string[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                const request = new Request(input, init);
                calls.push(request.url);

                if (
                    request.url.startsWith(
                        "https://api.europe-west2.gcp.tinybird.co/",
                    ) ||
                    request.url.startsWith("http://localhost:7181/")
                ) {
                    return Response.json({ data: [] });
                }

                throw new Error(`Unexpected fetch: ${request.url}`);
            },
        );

        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request("https://staging.gen.pollinations.ai/v1/audio/speech", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "universal-2",
                    input: "Hello",
                }),
            }),
            {
                ...env,
                ELEVENLABS_API_KEY: "should-not-be-used",
            } as unknown as CloudflareBindings,
            ctx,
        );

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
            error: {
                message:
                    "Model 'universal-2' is not supported on text-to-audio endpoints. Use /v1/audio/transcriptions for speech-to-text models.",
            },
        });

        await waitOnExecutionContext(ctx);

        expect(
            calls.some((url) => new URL(url).hostname === "api.elevenlabs.io"),
        ).toBe(false);
    },
);
