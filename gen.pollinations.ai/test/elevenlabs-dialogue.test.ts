import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { test as workerTest } from "@shared/test/fixtures/index.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    hashGenerationCacheIdentity,
    normalizedJsonBody,
} from "@/middleware/generation-cache.ts";
import { generateCacheKey } from "@/utils/media-cache.ts";
import worker from "../src/index.ts";
import { generateElevenLabsDialogue } from "../src/routes/audio.ts";
import { withInlineGenerationCoordinator } from "./helpers/inline-generation-coordinator.ts";

const AZURE_TTS_URL =
    "https://myceli-prod-swedencentral.openai.azure.com/openai/deployments/";

const log = {
    info: vi.fn(),
    warn: vi.fn(),
} as never;

async function fetchGen(input: RequestInfo | URL, init?: RequestInit) {
    const ctx = createExecutionContext();
    return worker.fetch(
        new Request(input, init),
        withInlineGenerationCoordinator(env),
        ctx,
    );
}

// Vitest 4 reuses an existing spy, so every test restores its fetch spy.
afterEach(() => {
    vi.restoreAllMocks();
});

describe("ElevenLabs Text to Dialogue", () => {
    it("rejects FLAC before calling the dialogue provider", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch");
        await expect(
            generateElevenLabsDialogue({
                inputs: [{ text: "Hello.", voice: "nova" }],
                responseFormat: "flac",
                apiKey: "test-eleven-key",
                log,
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("maps preset voices and bills all input characters", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(new Uint8Array([1, 2, 3]), {
                headers: { "content-type": "audio/mpeg" },
            }),
        );

        const response = await generateElevenLabsDialogue({
            inputs: [
                { text: "Hello.", voice: "nova" },
                { text: "Hi!", voice: "george" },
            ],
            responseFormat: "mp3",
            seed: 42,
            apiKey: "test-eleven-key",
            log,
        });

        const request = new Request(
            fetchMock.mock.calls[0][0],
            fetchMock.mock.calls[0][1],
        );
        await expect(request.json()).resolves.toMatchObject({
            inputs: [
                { text: "Hello.", voice_id: "MF3mGyEYCl7XYWbV9V6O" },
                { text: "Hi!", voice_id: "JBFqnCBsd6RMkjVDRZzb" },
            ],
            model_id: "eleven_v3",
            seed: 42,
        });
        expect(request.url).toContain("/v1/text-to-dialogue");
        expect(response.headers.get("x-usage-completion-audio-tokens")).toBe(
            "9",
        );
    });
});

workerTest.for(["GET", "JSON", "multipart"] as const)(
    "rejects FLAC dialogue before serving cached PCM (%s)",
    async (encoding, { paidApiKey }) => {
        const fields = {
            model: "elevenlabs/eleven-v3:dialogue",
            input: "nova: Cached dialogue.",
            voice: "alloy",
            response_format: "flac",
            safe: "false",
        };
        const url = new URL(
            encoding === "GET"
                ? `/audio/${encodeURIComponent(fields.input)}?model=dialogue&response_format=flac&safe=false`
                : "/v1/audio/speech",
            "https://gen.pollinations.ai",
        );
        const cacheUrl = new URL(url);
        const headers = new Headers({ Authorization: `Bearer ${paidApiKey}` });
        let body: FormData | string | undefined;
        if (encoding !== "GET") {
            let cacheBody: string;
            if (encoding === "multipart") {
                body = new FormData();
                for (const [name, value] of Object.entries(fields)) {
                    body.set(name, value);
                }
                cacheBody = JSON.stringify(
                    Object.fromEntries(
                        Object.entries(fields).map(([name, value]) => [
                            name,
                            [value],
                        ]),
                    ),
                );
            } else {
                headers.set("Content-Type", "application/json");
                body = JSON.stringify(fields);
                cacheBody = body;
            }
            cacheUrl.searchParams.set(
                "__request_body",
                await hashGenerationCacheIdentity(
                    "media",
                    normalizedJsonBody(cacheBody),
                ),
            );
        }

        await env.MEDIA.put(
            await generateCacheKey(cacheUrl),
            new Response(new Uint8Array([1, 0, 2, 0]), {
                headers: { "Content-Type": "audio/pcm" },
            }),
        );
        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request(url, {
                method: encoding === "GET" ? "GET" : "POST",
                headers,
                body,
            }),
            env,
            ctx,
        );
        expect(response.status).toBe(400);
        expect(response.headers.get("x-cache")).toBeNull();
        await expect(response.json()).resolves.toMatchObject({
            error: {
                message: expect.stringContaining("flac is not supported"),
            },
        });
        await waitOnExecutionContext(ctx);
    },
);

workerTest("advertises the simple route for every speech model", async () => {
    const response = await fetchGen("https://gen.pollinations.ai/v1/models");
    expect(response.status).toBe(200);

    const models = (await response.json()) as {
        data: { supported_endpoints?: string[] }[];
    };
    const speechModels = models.data.filter((model) =>
        model.supported_endpoints?.includes("/v1/audio/speech"),
    );
    expect(speechModels.length).toBeGreaterThan(0);
    for (const model of speechModels) {
        expect(model.supported_endpoints).toContain("/audio/{text}");
    }
});

workerTest(
    "translates labelled input through both speech routes",
    async ({ paidApiKey }) => {
        const realFetch = globalThis.fetch.bind(globalThis);
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async (input, init) => {
                const url =
                    input instanceof Request ? input.url : input.toString();
                if (
                    url.startsWith(
                        "https://api.elevenlabs.io/v1/text-to-dialogue",
                    )
                ) {
                    return new Response(new Uint8Array([73, 68, 51, 4]), {
                        headers: { "content-type": "audio/mpeg" },
                    });
                }
                if (
                    url.startsWith(
                        "https://api.europe-west2.gcp.tinybird.co/v0/pipes/public_model_stats.json",
                    ) ||
                    url.startsWith("http://localhost:7181/")
                ) {
                    return Response.json({ data: [] });
                }
                return realFetch(input, init);
            });

        const dialogue = "nova: Hello.\ngeorge: Hi!";
        const requests = [
            new Request("https://gen.pollinations.ai/v1/audio/speech", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${paidApiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "elevenlabs/eleven-v3:dialogue",
                    input: dialogue,
                    voice: "alloy",
                    response_format: "mp3",
                    seed: 42,
                    safe: false,
                }),
            }),
            new Request(
                `https://gen.pollinations.ai/audio/${encodeURIComponent(dialogue)}?model=dialogue&response_format=mp3&seed=42&safe=false`,
                { headers: { Authorization: `Bearer ${paidApiKey}` } },
            ),
        ];

        for (const request of requests) {
            const previousCallCount = fetchMock.mock.calls.length;
            const ctx = createExecutionContext();
            const response = await worker.fetch(
                request,
                withInlineGenerationCoordinator({
                    ...env,
                    ELEVENLABS_API_KEY: "test-eleven-key",
                } as unknown as CloudflareBindings),
                ctx,
            );

            expect(response.status).toBe(200);
            const dialogueCall = fetchMock.mock.calls
                .slice(previousCallCount)
                .find(([input]) =>
                    String(input).startsWith(
                        "https://api.elevenlabs.io/v1/text-to-dialogue",
                    ),
                );
            expect(dialogueCall).toBeDefined();
            const upstreamRequest = new Request(
                dialogueCall?.[0] as RequestInfo,
                dialogueCall?.[1],
            );
            await expect(upstreamRequest.json()).resolves.toEqual({
                inputs: [
                    { text: "Hello.", voice_id: "MF3mGyEYCl7XYWbV9V6O" },
                    { text: "Hi!", voice_id: "JBFqnCBsd6RMkjVDRZzb" },
                ],
                model_id: "eleven_v3",
                seed: 42,
            });
            expect(
                response.headers.get("x-usage-completion-audio-tokens"),
            ).toBe("9");
            expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(
                0,
            );
            await waitOnExecutionContext(ctx);
        }
    },
);

workerTest.for(["elevenlabs/eleven-v3:dialogue", "elevenlabs/eleven-v3"])(
    "reaches dialogue after a failed caller choice %s",
    async (primary, { paidApiKey }) => {
        const realFetch = globalThis.fetch.bind(globalThis);
        const providerCalls: Request[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                const url =
                    input instanceof Request ? input.url : input.toString();
                if (url.startsWith("https://api.elevenlabs.io/v1/text-to-")) {
                    providerCalls.push(new Request(input, init));
                    if (providerCalls.length === 1) {
                        return new Response("temporarily unavailable", {
                            status: 503,
                        });
                    }
                    return new Response(new Uint8Array([73, 68, 51, 4]), {
                        headers: { "content-type": "audio/mpeg" },
                    });
                }
                if (
                    url.startsWith(
                        "https://api.europe-west2.gcp.tinybird.co/v0/pipes/public_model_stats.json",
                    ) ||
                    url.startsWith("http://localhost:7181/")
                ) {
                    return Response.json({ data: [] });
                }
                return realFetch(input, init);
            },
        );
        const greeting = `Hello ${crypto.randomUUID()}.`;
        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request("https://gen.pollinations.ai/v1/audio/speech", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${paidApiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: `${primary},elevenlabs/eleven-v3:dialogue`,
                    input: `nova: ${greeting}\ngeorge: Hi!`,
                    voice: "alloy",
                    response_format: "mp3",
                    seed: 42,
                    safe: false,
                }),
            }),
            withInlineGenerationCoordinator({
                ...env,
                ELEVENLABS_API_KEY: "test-eleven-key",
            } as unknown as CloudflareBindings),
            ctx,
        );

        expect(response.status).toBe(200);
        expect(providerCalls).toHaveLength(2);
        expect(providerCalls[0].url).toContain(
            primary.endsWith(":dialogue")
                ? "/text-to-dialogue"
                : "/text-to-speech/",
        );
        expect(providerCalls[1].url).toContain("/text-to-dialogue");
        await expect(providerCalls[1].json()).resolves.toEqual({
            inputs: [
                { text: greeting, voice_id: "MF3mGyEYCl7XYWbV9V6O" },
                { text: "Hi!", voice_id: "JBFqnCBsd6RMkjVDRZzb" },
            ],
            model_id: "eleven_v3",
            seed: 42,
        });
        expect(response.headers.get("x-usage-completion-audio-tokens")).toBe(
            String(greeting.length + 3),
        );
        expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
        await waitOnExecutionContext(ctx);
    },
);

workerTest(
    "rejects dialogue lines without a voice label",
    async ({ paidApiKey }) => {
        const fetchMock = vi.spyOn(globalThis, "fetch");
        const response = await fetchGen(
            "https://gen.pollinations.ai/v1/audio/speech",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${paidApiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "eleven-dialogue",
                    input: "nova: Hello.\nThis line has no voice label.",
                    safe: false,
                }),
            },
        );

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
            error: { message: expect.stringContaining("Dialogue line 2") },
        });
        expect(
            fetchMock.mock.calls.some(([url]) =>
                String(url).startsWith("https://api.elevenlabs.io/"),
            ),
        ).toBe(false);
    },
);

workerTest(
    "serves explicit ElevenLabs TTS and the default model on both standard audio routes",
    async ({ paidApiKey }) => {
        const realFetch = globalThis.fetch.bind(globalThis);
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async (input, init) => {
                const url =
                    input instanceof Request ? input.url : input.toString();
                if (
                    url.startsWith(
                        "https://api.elevenlabs.io/v1/text-to-speech/",
                    ) ||
                    url.startsWith(AZURE_TTS_URL)
                ) {
                    return new Response(new Uint8Array([73, 68, 51, 4]), {
                        headers: { "content-type": "audio/mpeg" },
                    });
                }
                if (
                    url.startsWith(
                        "https://api.europe-west2.gcp.tinybird.co/v0/pipes/public_model_stats.json",
                    ) ||
                    url.startsWith("http://localhost:7181/")
                ) {
                    return Response.json({ data: [] });
                }
                return realFetch(input, init);
            });

        const requests = [
            new Request("https://gen.pollinations.ai/v1/audio/speech", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${paidApiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "elevenlabs/eleven-v3",
                    input: "Explicit model route test.",
                    safe: false,
                }),
            }),
            new Request("https://gen.pollinations.ai/v1/audio/speech", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${paidApiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    input: "Default model route test.",
                    safe: false,
                }),
            }),
            new Request(
                "https://gen.pollinations.ai/audio/Default%20GET%20route%20test?model=elevenlabs&safe=false",
                {
                    headers: {
                        Authorization: `Bearer ${paidApiKey}`,
                    },
                },
            ),
        ];

        for (const request of requests) {
            const ctx = createExecutionContext();
            const response = await worker.fetch(
                request,
                withInlineGenerationCoordinator({
                    ...env,
                    ELEVENLABS_API_KEY: "test-eleven-key",
                    AZURE_MYCELI_PROD_SWEDEN_API_KEY: "test-azure-key",
                } as unknown as CloudflareBindings),
                ctx,
            );
            expect(response.status).toBe(200);
            expect(response.headers.get("content-type")).toContain(
                "audio/mpeg",
            );
            expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(
                0,
            );
            await waitOnExecutionContext(ctx);
        }

        const providerCalls = (prefix: string) =>
            fetchMock.mock.calls.filter(([input]) =>
                (input instanceof Request
                    ? input.url
                    : input.toString()
                ).startsWith(prefix),
            );
        expect(
            providerCalls("https://api.elevenlabs.io/v1/text-to-speech/"),
        ).toHaveLength(2);
        // Requests without a model use the default, Azure OpenAI tts-1.
        expect(providerCalls(AZURE_TTS_URL)).toHaveLength(1);
    },
);

workerTest.runIf(Boolean(env.ELEVENLABS_API_KEY))(
    "generates multi-speaker audio through the full local route",
    async ({ paidApiKey }) => {
        const response = await fetchGen(
            "https://gen.pollinations.ai/v1/audio/speech",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${paidApiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "elevenlabs/eleven-v3:dialogue",
                    input: "nova: Hello.\ngeorge: Hi!",
                    response_format: "mp3",
                }),
            },
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("audio/mpeg");
        expect(response.headers.get("x-usage-completion-audio-tokens")).toBe(
            "9",
        );
        expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1000);

        const wavResponse = await fetchGen(
            "https://gen.pollinations.ai/v1/audio/speech",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${paidApiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "dialogue",
                    input: "rachel: First speaker.\nadam: Second speaker.",
                    response_format: "wav",
                }),
            },
        );

        expect(wavResponse.status).toBe(200);
        expect(wavResponse.headers.get("content-type")).toContain("audio/wav");
        expect(wavResponse.headers.get("content-length")).not.toBeNull();
        expect((await wavResponse.arrayBuffer()).byteLength).toBeGreaterThan(
            1000,
        );
    },
);
