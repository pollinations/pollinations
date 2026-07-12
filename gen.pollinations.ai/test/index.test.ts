import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { getTextModelsInfo } from "@shared/registry/model-info.ts";
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
    it("serves root metadata for social previews", async () => {
        const response = await fetchWorker("/");

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toContain("text/html");
        expect(response.headers.get("X-Robots-Tag")).toBeNull();

        const html = await response.text();
        expect(html).toContain("<title>Docs | pollinations.ai</title>");
        expect(html).toContain('http-equiv="refresh" content="0;url=/docs"');
        expect(html).toContain(
            'property="og:image" content="https://staging.gen.pollinations.ai/og-image.png"',
        );
        expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    });

    it("serves the docs web app manifest", async () => {
        const response = await fetchWorker("/manifest.webmanifest");

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toContain(
            "application/manifest+json",
        );

        const manifest = (await response.json()) as {
            name: string;
            short_name: string;
            start_url: string;
            icons: { src: string; purpose?: string }[];
        };
        expect(manifest).toMatchObject({
            name: "Docs | pollinations.ai",
            short_name: "Docs",
            start_url: "/docs",
        });
        expect(manifest.icons).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    src: "/icon-maskable-512.png",
                    purpose: "maskable",
                }),
            ]),
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

    it("proxies only the public quest catalog to enter", async () => {
        let proxiedUrl: string | undefined;
        const env = envWithEnter(async (request) => {
            proxiedUrl = new Request(request).url;
            return Response.json({ quests: [] });
        });

        const response = await fetchWorker("/quests/catalog", env);

        expect(response.status).toBe(200);
        expect(proxiedUrl).toBe(
            "https://staging.gen.pollinations.ai/api/quests/catalog",
        );
        expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    });

    it("does not proxy dashboard quest actions on gen", async () => {
        let proxied = false;
        const env = envWithEnter(async () => {
            proxied = true;
            return new Response("unexpected");
        });

        const response = await fetchWorker("/quests/rewards", env);

        expect(response.status).toBe(404);
        expect(proxied).toBe(false);
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
        "/video/models",
        "/audio/models",
        "/embeddings/models",
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

    it("returns only video models on /video/models", async () => {
        const response = await fetchWorker("/video/models", envWithEnter());

        expect(response.status).toBe(200);
        const models = (await response.json()) as { category?: string }[];
        expect(models.length).toBeGreaterThan(0);
        expect(models.every((m) => m.category === "video")).toBe(true);
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
        const embeddingModel = models.data.find((model) =>
            model.supported_endpoints?.includes("/v1/embeddings"),
        );

        expect(textModel).toMatchObject({
            id: expect.any(String),
            input_modalities: expect.any(Array),
            output_modalities: expect.any(Array),
            supported_endpoints: expect.arrayContaining(["/text/{prompt}"]),
        });
        expect(imageModel?.supported_endpoints).toContain("/image/{prompt}");
        expect(audioModel).toBeDefined();
        expect(embeddingModel).toBeDefined();
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
        const modelsByName = new Map(
            models.map((model) => [model.name, model]),
        );
        const expectedModelsWithContext = getTextModelsInfo().filter(
            (model) => model.context_length != null,
        );

        expect(expectedModelsWithContext.length).toBeGreaterThan(0);
        for (const model of expectedModelsWithContext) {
            const servedModel = modelsByName.get(model.name);

            expect(model.context_length).toBeGreaterThan(0);
            expect(servedModel?.context_length).toBeGreaterThan(0);
            expect(servedModel?.context_length).toBe(model.context_length);
        }
    });
});

describe("model status", () => {
    it("reports the source timestamp and marks stale fallback data", async () => {
        let now = 1_000;
        vi.spyOn(Date, "now").mockImplementation(() => now);
        const upstream = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(Response.json({ data: [{ model: "test" }] }))
            .mockRejectedValueOnce(new Error("Tinybird unavailable"));

        const fresh = await fetchWorker("/v1/models/status?minutes=9876");
        expect(fresh.status).toBe(200);
        expect(fresh.headers.get("X-Model-Status-Timestamp")).toBe(
            "1970-01-01T00:00:01.000Z",
        );
        expect(fresh.headers.get("X-Model-Status-Stale")).toBeNull();

        now = 2_000;
        const cached = await fetchWorker("/v1/models/status?minutes=9876");
        expect(cached.status).toBe(200);
        expect(cached.headers.get("X-Model-Status-Timestamp")).toBe(
            "1970-01-01T00:00:01.000Z",
        );
        expect(upstream).toHaveBeenCalledTimes(1);

        now = 62_000;
        const stale = await fetchWorker("/v1/models/status?minutes=9876");
        expect(stale.status).toBe(200);
        expect(stale.headers.get("X-Model-Status-Timestamp")).toBe(
            "1970-01-01T00:00:01.000Z",
        );
        expect(stale.headers.get("X-Model-Status-Stale")).toBe("true");
        expect(upstream).toHaveBeenCalledTimes(2);
    });

    it("evicts old entries when the in-memory cache reaches its bound", async () => {
        const upstream = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async (request) => {
                const minutes = new URL(
                    new Request(request).url,
                ).searchParams.get("minutes");
                return Response.json({ data: [{ model: `test-${minutes}` }] });
            });

        for (let minutes = 8_000; minutes <= 8_032; minutes++) {
            const response = await fetchWorker(
                `/v1/models/status?minutes=${minutes}`,
            );
            expect(response.status).toBe(200);
        }

        const evicted = await fetchWorker("/v1/models/status?minutes=8000");
        expect(evicted.status).toBe(200);
        expect(upstream).toHaveBeenCalledTimes(34);
    });
});

fixtureTest(
    "routes simple qwen audio requests through DashScope",
    async ({ paidApiKey }) => {
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
                    headers: { Authorization: `Bearer ${paidApiKey}` },
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
    "routes stable-audio-3-medium requests through fal",
    async ({ paidApiKey }) => {
        const calls: string[] = [];
        const falEndpoint =
            "https://fal.run/fal-ai/stable-audio-3/medium/text-to-audio";
        const falFileUrl = "https://v3.fal.media/files/test-stable-audio.mp3";

        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                const request = new Request(input, init);
                calls.push(request.url);

                if (request.url === falEndpoint) {
                    // fal auth uses `Key`, not `Bearer`.
                    expect(request.headers.get("authorization")).toBe(
                        "Key test-fal-key",
                    );

                    const body = (await request.json()) as Record<
                        string,
                        unknown
                    >;
                    expect(body.prompt).toBe("lofi rain loop");
                    expect(body.duration).toBe(12);
                    expect(body.num_inference_steps).toBe(6);
                    expect(body.seed).toBe(42);

                    return Response.json({
                        audio: { url: falFileUrl, content_type: "audio/mpeg" },
                        seed: 42,
                    });
                }

                if (request.url === falFileUrl) {
                    return new Response(new Uint8Array([73, 68, 51, 4]), {
                        headers: { "Content-Type": "audio/mpeg" },
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
                "https://staging.gen.pollinations.ai/audio/lofi%20rain%20loop?model=stable-audio-3-medium&seconds=12&steps=6&seed=42",
                {
                    headers: { Authorization: `Bearer ${paidApiKey}` },
                },
            ),
            {
                ...env,
                FAL_KEY: "test-fal-key",
            } as unknown as CloudflareBindings,
            ctx,
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("audio/mpeg");
        expect(response.headers.get("x-model-used")).toBe(
            "stable-audio-3-medium",
        );
        // text-to-audio bills 1 output audio unit ($0.0376 per generation).
        expect(response.headers.get("x-usage-completion-audio-tokens")).toBe(
            "1",
        );
        // no reference clip → no input audio unit billed.
        expect(response.headers.get("x-usage-prompt-audio-tokens")).toBeNull();

        await waitOnExecutionContext(ctx);

        expect(calls).toContain(falEndpoint);
        expect(calls).toContain(falFileUrl);
    },
);

fixtureTest(
    "routes stable-audio-3-medium reference_audio through fal audio-to-audio",
    async ({ paidApiKey }) => {
        const calls: string[] = [];
        const a2aEndpoint =
            "https://fal.run/fal-ai/stable-audio-3/medium/audio-to-audio";
        const falFileUrl = "https://v3.fal.media/files/test-a2a.mp3";
        let sentAudioUrl: unknown;

        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                const request = new Request(input, init);
                calls.push(request.url);

                if (request.url === a2aEndpoint) {
                    expect(request.headers.get("authorization")).toBe(
                        "Key test-fal-key",
                    );
                    const body = (await request.json()) as Record<
                        string,
                        unknown
                    >;
                    expect(body.prompt).toBe("warm pads");
                    sentAudioUrl = body.audio_url;

                    return Response.json({
                        audio: { url: falFileUrl, content_type: "audio/mpeg" },
                        seed: 1,
                    });
                }

                if (request.url === falFileUrl) {
                    return new Response(new Uint8Array([73, 68, 51, 4]), {
                        headers: { "Content-Type": "audio/mpeg" },
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

        const form = new FormData();
        form.append("model", "stable-audio-3-medium");
        form.append("input", "warm pads");
        form.append(
            "reference_audio",
            new File([new Uint8Array([82, 73, 70, 70])], "ref.wav", {
                type: "audio/wav",
            }),
        );

        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request("https://staging.gen.pollinations.ai/v1/audio/speech", {
                method: "POST",
                headers: { Authorization: `Bearer ${paidApiKey}` },
                body: form,
            }),
            {
                ...env,
                FAL_KEY: "test-fal-key",
            } as unknown as CloudflareBindings,
            ctx,
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("x-model-used")).toBe(
            "stable-audio-3-medium",
        );
        // audio-to-audio bills 1 output unit + 1 input unit
        // ($0.0376 + $0.0041 = $0.0417 per generation).
        expect(response.headers.get("x-usage-completion-audio-tokens")).toBe(
            "1",
        );
        expect(response.headers.get("x-usage-prompt-audio-tokens")).toBe("1");
        // reference clip is forwarded as a base64 data-URI audio_url.
        expect(String(sentAudioUrl)).toMatch(/^data:audio\/wav;base64,/);

        await waitOnExecutionContext(ctx);

        expect(calls).toContain(a2aEndpoint);
        expect(calls).toContain(falFileUrl);
    },
);

it("lists stable-audio-3-medium in audio models", async () => {
    const response = await fetchWorker("/audio/models");

    expect(response.status).toBe(200);
    const models = (await response.json()) as { name: string }[];
    expect(models.some((model) => model.name === "stable-audio-3-medium")).toBe(
        true,
    );
});

fixtureTest(
    "routes stable-audio-3-large text-to-audio through Stability (async submit + poll)",
    async ({ paidApiKey }) => {
        const calls: string[] = [];
        const generationId = "test-generation-id";

        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                const request = new Request(input, init);
                calls.push(request.url);

                // 1) Submit — Stability's direct API is async: returns 202 + { id }.
                if (
                    request.url ===
                    "https://api.stability.ai/v2beta/audio/stable-audio/text-to-audio"
                ) {
                    expect(request.method).toBe("POST");
                    expect(request.headers.get("authorization")).toBe(
                        "Bearer test-stability-key",
                    );
                    expect(request.headers.get("accept")).toBe("audio/*");

                    const formData = await request.formData();
                    expect(formData.get("prompt")).toBe("lofi rain loop");
                    // The direct API only accepts model=stable-audio-3.
                    expect(formData.get("model")).toBe("stable-audio-3");
                    expect(formData.get("duration")).toBe("12");
                    expect(formData.get("steps")).toBe("6");
                    expect(formData.get("seed")).toBe("42");
                    expect(formData.get("output_format")).toBe("mp3");
                    expect(formData.get("negative_prompt")).toBe("vocals");

                    return Response.json({ id: generationId }, { status: 202 });
                }

                // 2) Poll results — wants Accept: */*, returns 200 + audio.
                if (
                    request.url ===
                    `https://api.stability.ai/v2beta/results/${generationId}`
                ) {
                    expect(request.headers.get("authorization")).toBe(
                        "Bearer test-stability-key",
                    );
                    expect(request.headers.get("accept")).toBe("*/*");

                    return new Response(new Uint8Array([73, 68, 51, 4]), {
                        headers: { "Content-Type": "audio/mpeg" },
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
                "https://staging.gen.pollinations.ai/audio/lofi%20rain%20loop?model=stable-audio-3-large&seconds=12&steps=6&seed=42&negative_prompt=vocals",
                {
                    headers: { Authorization: `Bearer ${paidApiKey}` },
                },
            ),
            {
                ...env,
                STABILITY_API_KEY: "test-stability-key",
            } as unknown as CloudflareBindings,
            ctx,
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("audio/mpeg");
        expect(response.headers.get("x-model-used")).toBe(
            "stable-audio-3-large",
        );
        expect(response.headers.get("x-usage-completion-audio-tokens")).toBe(
            "1",
        );

        await waitOnExecutionContext(ctx);

        expect(calls).toContain(
            "https://api.stability.ai/v2beta/audio/stable-audio/text-to-audio",
        );
        expect(calls).toContain(
            `https://api.stability.ai/v2beta/results/${generationId}`,
        );
    },
    20_000,
);

fixtureTest(
    "routes stable-audio-3-large reference_audio through Stability audio-to-audio",
    async ({ paidApiKey }) => {
        const calls: string[] = [];
        const generationId = "test-a2a-generation-id";
        const a2aEndpoint =
            "https://api.stability.ai/v2beta/audio/stable-audio/audio-to-audio";

        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                const request = new Request(input, init);
                calls.push(request.url);

                // Submit goes to the audio-to-audio endpoint with the clip.
                if (request.url === a2aEndpoint) {
                    expect(request.method).toBe("POST");
                    expect(request.headers.get("authorization")).toBe(
                        "Bearer test-stability-key",
                    );
                    expect(request.headers.get("accept")).toBe("audio/*");

                    const formData = await request.formData();
                    expect(formData.get("prompt")).toBe("warm pads");
                    expect(formData.get("model")).toBe("stable-audio-3");
                    expect(formData.get("output_format")).toBe("mp3");
                    // a2a sends the reference clip, not a duration.
                    expect(formData.get("audio")).toBeInstanceOf(File);
                    expect(formData.get("duration")).toBeNull();

                    return Response.json({ id: generationId }, { status: 202 });
                }

                if (
                    request.url ===
                    `https://api.stability.ai/v2beta/results/${generationId}`
                ) {
                    expect(request.headers.get("accept")).toBe("*/*");
                    return new Response(new Uint8Array([73, 68, 51, 4]), {
                        headers: { "Content-Type": "audio/mpeg" },
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

        const form = new FormData();
        form.append("model", "stable-audio-3-large");
        form.append("input", "warm pads");
        form.append(
            "reference_audio",
            new File([new Uint8Array([82, 73, 70, 70])], "ref.wav", {
                type: "audio/wav",
            }),
        );

        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request("https://staging.gen.pollinations.ai/v1/audio/speech", {
                method: "POST",
                headers: { Authorization: `Bearer ${paidApiKey}` },
                body: form,
            }),
            {
                ...env,
                STABILITY_API_KEY: "test-stability-key",
            } as unknown as CloudflareBindings,
            ctx,
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("x-model-used")).toBe(
            "stable-audio-3-large",
        );
        // a2a bills the same flat fee as text-to-audio ($0.26 = 1 unit).
        expect(response.headers.get("x-usage-completion-audio-tokens")).toBe(
            "1",
        );

        await waitOnExecutionContext(ctx);

        expect(calls).toContain(a2aEndpoint);
        expect(calls).toContain(
            `https://api.stability.ai/v2beta/results/${generationId}`,
        );
    },
    20_000,
);

it("lists stable-audio-3-large in audio models", async () => {
    const response = await fetchWorker("/audio/models");

    expect(response.status).toBe(200);
    const models = (await response.json()) as { name: string }[];
    expect(models.some((model) => model.name === "stable-audio-3-large")).toBe(
        true,
    );
});

fixtureTest(
    "rejects out-of-range prompt_influence on GET /audio before billing",
    async ({ paidApiKey }) => {
        const calls: string[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                const request = new Request(input, init);
                calls.push(request.url);
                return Response.json({ data: [] });
            },
        );

        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request(
                "https://staging.gen.pollinations.ai/audio/tick?model=eleven-sfx&prompt_influence=abc",
                { headers: { Authorization: `Bearer ${paidApiKey}` } },
            ),
            {
                ...env,
                ELEVENLABS_API_KEY: "test-eleven-key",
            } as unknown as CloudflareBindings,
            ctx,
        );

        expect(response.status).toBe(400);
        await waitOnExecutionContext(ctx);
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
