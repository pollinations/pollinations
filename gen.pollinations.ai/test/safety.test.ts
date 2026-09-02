import {
    communityEndpointPrices,
    communityModelDefinition,
    type ProxyCommunityEndpointRuntime,
} from "@shared/community-endpoints.ts";
import type { CreateChatCompletionRequest } from "@shared/schemas/openai.ts";
import {
    parseSafeFeatures,
    SAFETY_HEADER_NAME,
    SafeSchema,
} from "@shared/schemas/safety.ts";
import { encryptSecret } from "@shared/secret-encryption.ts";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";
import type { ModelVariables } from "@/middleware/model.ts";
import { getRequiredSafetyFeatures } from "@/middleware/model.ts";
import { applySafetyToInput, withSafetyHeaders } from "@/middleware/safety.ts";
import type { BedrockResponse } from "@/utils/bedrock-guardrail.ts";
import {
    generateCacheKey as generateMediaCacheKey,
    SAFETY_CACHE_VERSION as MEDIA_SAFETY_CACHE_VERSION,
} from "@/utils/media-cache.ts";
import {
    generateCacheKey as generateTextCacheKey,
    prepareMetadata as prepareTextCacheMetadata,
} from "@/utils/text-cache.ts";
import { generateChatCompletion } from "../src/routes/generation-handlers.ts";
import { prepareOpenAIImageGeneration } from "../src/routes/images.ts";

const testLog = {
    getChild: () => testLog,
    debug() {},
    info() {},
    warn() {},
    error() {},
} as unknown as LoggerVariables["log"];

let guardrailResponse: BedrockResponse;
let fetchMock: ReturnType<typeof vi.fn>;

const configuredEnv = {
    AWS_ACCESS_KEY_ID: "test-access-key",
    AWS_SECRET_ACCESS_KEY: "test-secret-key",
    AWS_REGION: "us-east-1",
    BEDROCK_GUARDRAIL_ID: "test-guardrail",
    BEDROCK_GUARDRAIL_VERSION: "1",
} as CloudflareBindings;

function safetyApp(
    requiredSafetyFeatures: ModelVariables["model"]["definition"]["requiredSafetyFeatures"] = [],
) {
    return new Hono<Env>()
        .use("*", async (c, next) => {
            c.set("log", testLog);
            c.set("requestId", "test-request");
            c.set("model", {
                requested: "test-model",
                resolved: "test-model",
                definition: {
                    requiredSafetyFeatures,
                } as ModelVariables["model"]["definition"],
            });
            await next();
        })
        .get("/scan/:text", async (c) => {
            const text = await applySafetyToInput(c, c.req.param("text"));
            return withSafetyHeaders(c, new Response(text));
        })
        .post("/texts", async (c) => {
            const body = await c.req.json<{
                texts: string[];
                safe?: "privacy";
            }>();
            const texts = await applySafetyToInput(c, body.texts, body.safe);
            return withSafetyHeaders(c, Response.json(texts));
        })
        .post("/chat", async (c) => {
            const body = await c.req.json();
            const safeBody = await applySafetyToInput(
                c,
                body as CreateChatCompletionRequest & Record<string, unknown>,
            );
            return withSafetyHeaders(c, Response.json(safeBody));
        });
}

function intervened(
    assessment: NonNullable<BedrockResponse["assessments"]>[0],
    outputs?: BedrockResponse["outputs"],
): BedrockResponse {
    return {
        action: "GUARDRAIL_INTERVENED",
        assessments: [assessment],
        outputs,
    };
}

describe("safety schema", () => {
    it("expands aliases", () => {
        expect(parseSafeFeatures("true")).toEqual(
            new Set(["privacy", "secrets"]),
        );
        expect(parseSafeFeatures("nsfw")).toEqual(
            new Set(["sexual", "violence"]),
        );
    });

    it("rejects unknown safe tokens", () => {
        const result = SafeSchema.safeParse("privacy,saef");
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toContain("Valid:");
        }
    });

    it("coerces boolean values", () => {
        expect(SafeSchema.parse(true)).toBe("true");
        expect(SafeSchema.parse(false)).toBe("false");
    });

    it("accepts string no-op values for compatibility", () => {
        expect(SafeSchema.parse("false")).toBe("false");
        expect(SafeSchema.parse("0")).toBe("0");
        expect(parseSafeFeatures("false")).toEqual(new Set());
        expect(parseSafeFeatures("0")).toEqual(new Set());
    });
});

// The Bedrock-backed tests sign requests with AWS SigV4 (WebCrypto HMAC-SHA256)
// inside the workerd runtime; that crypto path can take several seconds on a cold
// or loaded runtime, so give these blocks generous headroom over the 5s default.
describe("applySafetyToInput text", { timeout: 30000 }, () => {
    beforeEach(() => {
        guardrailResponse = { action: "NONE", assessments: [] };
        fetchMock = vi.fn(async () => Response.json(guardrailResponse));
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("does not call Bedrock when safe is omitted", async () => {
        const response = await safetyApp().request(
            "/scan/hello",
            undefined,
            configuredEnv,
        );

        expect(await response.text()).toBe("hello");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does not call Bedrock when safe=false overrides the safety header", async () => {
        const response = await safetyApp().request(
            "/scan/hello?safe=false",
            { headers: { [SAFETY_HEADER_NAME]: "privacy" } },
            configuredEnv,
        );

        expect(await response.text()).toBe("hello");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does not let safe=false disable model-required checks", async () => {
        guardrailResponse = intervened({
            contentPolicy: {
                filters: [{ action: "BLOCKED", type: "SEXUAL" }],
            },
        });
        const response = await safetyApp(["sexual", "violence"]).request(
            "/scan/blocked?safe=false",
            undefined,
            configuredEnv,
        );

        expect(response.status).toBe(400);
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(response.headers.get("X-Safety-Applied")).toBe(
            "sexual,violence",
        );
    });

    it("unions caller and model-required checks", async () => {
        const response = await safetyApp(["sexual", "violence"]).request(
            "/scan/hello?safe=privacy",
            undefined,
            configuredEnv,
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("X-Safety-Applied")).toBe(
            "privacy,sexual,violence",
        );
    });

    it("redacts privacy matches", async () => {
        guardrailResponse = intervened(
            {
                sensitiveInformationPolicy: {
                    piiEntities: [
                        {
                            action: "ANONYMIZED",
                            match: "a@example.com",
                            type: "EMAIL",
                        },
                    ],
                },
            },
            [{ text: "email {EMAIL}" }],
        );

        const response = await safetyApp().request(
            "/scan/email%20a%40example.com?safe=privacy",
            undefined,
            configuredEnv,
        );

        expect(response.status).toBe(200);
        expect(await response.text()).toBe("email {EMAIL}");
        expect(response.headers.get("X-Safety-Applied")).toBe("privacy");
        expect(response.headers.get("X-Safety-Redacted")).toBe("EMAIL");
    });

    it("uses the redacted prompt for OpenAI image cache URLs", async () => {
        guardrailResponse = intervened(
            {
                sensitiveInformationPolicy: {
                    piiEntities: [
                        {
                            action: "ANONYMIZED",
                            match: "a@example.com",
                            type: "EMAIL",
                        },
                    ],
                },
            },
            [{ text: "portrait of {EMAIL}" }],
        );
        const model: ModelVariables["model"] = {
            requested: "flux",
            resolved: "flux",
            definition: {
                requiredSafetyFeatures: ["privacy"],
            } as ModelVariables["model"]["definition"],
        };
        const app = new Hono<Env>()
            .use("*", async (c, next) => {
                c.set("log", testLog);
                c.set("requestId", "test-request");
                c.set("model", model);
                const body = await c.req.json();
                c.req.addValidatedData("json", body);
                await next();
            })
            .post("/v1/images/generations", prepareOpenAIImageGeneration, (c) =>
                c.json({
                    prompt: (c.req.valid("json" as never) as { prompt: string })
                        .prompt,
                    url: c.var.generationCacheUrl?.toString(),
                }),
            );

        const response = await app.request(
            "/v1/images/generations",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: "portrait of a@example.com",
                    safe: false,
                }),
            },
            configuredEnv,
        );
        const result = await response.json<{
            prompt: string;
            url: string;
        }>();

        expect(result.prompt).toBe("portrait of {EMAIL}");
        expect(result.url).toContain("portrait%20of%20%7BEMAIL%7D");
        expect(result.url).not.toContain("a%40example.com");
    });

    it("accepts safety from the request header", async () => {
        guardrailResponse = intervened(
            {
                sensitiveInformationPolicy: {
                    piiEntities: [
                        {
                            action: "ANONYMIZED",
                            match: "a@example.com",
                            type: "EMAIL",
                        },
                    ],
                },
            },
            [{ text: "email {EMAIL}" }],
        );

        const response = await safetyApp().request(
            "/scan/email%20a%40example.com",
            { headers: { [SAFETY_HEADER_NAME]: "privacy" } },
            configuredEnv,
        );

        expect(response.status).toBe(200);
        expect(await response.text()).toBe("email {EMAIL}");
        expect(response.headers.get("X-Safety-Applied")).toBe("privacy");
    });

    it("emits applied header when safety runs without redaction", async () => {
        const response = await safetyApp().request(
            "/scan/hello?safe=privacy",
            undefined,
            configuredEnv,
        );

        expect(response.status).toBe(200);
        expect(await response.text()).toBe("hello");
        expect(response.headers.get("X-Safety-Applied")).toBe("privacy");
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("prepares multiple text inputs for one guardrail request", async () => {
        guardrailResponse = intervened(
            {
                sensitiveInformationPolicy: {
                    piiEntities: [
                        {
                            action: "ANONYMIZED",
                            match: "a@example.com",
                            type: "EMAIL",
                        },
                    ],
                },
            },
            [{ text: "first {EMAIL}" }, { text: "second" }],
        );

        const response = await safetyApp().request(
            "/texts",
            {
                method: "POST",
                body: JSON.stringify({
                    texts: ["first a@example.com", "second"],
                    safe: "privacy",
                }),
            },
            configuredEnv,
        );

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(await response.json()).toEqual(["first {EMAIL}", "second"]);
    });

    it("blocks requested content categories", async () => {
        guardrailResponse = intervened({
            contentPolicy: {
                filters: [
                    {
                        action: "BLOCKED",
                        confidence: "HIGH",
                        type: "SEXUAL",
                        filterStrength: "HIGH",
                    },
                ],
            },
        });

        const response = await safetyApp().request(
            "/scan/blocked?safe=sexual",
            undefined,
            configuredEnv,
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
            error: {
                type: "safety_error",
                code: "content_blocked",
                safety: { triggered: ["sexual"] },
            },
        });
    });

    it("checks the latest text window when a safe prompt exceeds the text budget", async () => {
        guardrailResponse = intervened(
            {
                sensitiveInformationPolicy: {
                    piiEntities: [
                        {
                            action: "ANONYMIZED",
                            match: "tail@example.com",
                            type: "EMAIL",
                        },
                    ],
                },
            },
            [{ text: "safe tail {EMAIL}" }],
        );

        const prefix = `a@example.com ${"safe prefix ".repeat(100)}`;
        const tail = `${"safe tail ".repeat(5_100)}tail@example.com`;
        const input = `${prefix}${tail}`;
        const response = await safetyApp().request(
            `/scan/${encodeURIComponent(input)}?safe=privacy`,
            undefined,
            configuredEnv,
        );

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(await response.text()).toBe(
            `${input.slice(0, input.length - 50_000)}safe tail {EMAIL}`,
        );
    });

    it("fails closed when safe is requested but guardrails are not configured", async () => {
        const response = await safetyApp().request(
            "/scan/hello?safe=privacy",
            undefined,
            {} as CloudflareBindings,
        );

        expect(response.status).toBe(503);
        expect(response.headers.get("X-Safety-Status")).toBe("misconfigured");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("fails closed when the guardrail call fails", async () => {
        fetchMock.mockRejectedValueOnce(new Error("network down"));

        const response = await safetyApp().request(
            "/scan/hello?safe=privacy",
            undefined,
            configuredEnv,
        );

        expect(response.status).toBe(503);
        expect(response.headers.get("X-Safety-Status")).toBe("unavailable");
    });
});

describe("applySafetyToInput", { timeout: 30000 }, () => {
    beforeEach(() => {
        guardrailResponse = { action: "NONE", assessments: [] };
        fetchMock = vi.fn(async () => Response.json(guardrailResponse));
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("checks chat text parts in one guardrail request", async () => {
        guardrailResponse = intervened(
            {
                sensitiveInformationPolicy: {
                    piiEntities: [
                        {
                            action: "ANONYMIZED",
                            match: "a@example.com",
                            type: "EMAIL",
                        },
                        {
                            action: "ANONYMIZED",
                            match: "555-123-4567",
                            type: "PHONE",
                        },
                    ],
                },
            },
            [{ text: "email {EMAIL}" }, { text: "phone {PHONE}" }],
        );

        const response = await safetyApp().request(
            "/chat",
            {
                method: "POST",
                body: JSON.stringify({
                    model: "openai",
                    safe: "privacy",
                    messages: [
                        {
                            role: "user",
                            content: [
                                {
                                    type: "text",
                                    text: "email a@example.com",
                                },
                                {
                                    type: "image_url",
                                    image_url: {
                                        url: "https://example.com/image.png",
                                    },
                                },
                                {
                                    type: "text",
                                    text: "phone 555-123-4567",
                                },
                            ],
                        },
                    ],
                }),
            },
            configuredEnv,
        );

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(await response.json()).toMatchObject({
            messages: [
                {
                    content: [
                        { type: "text", text: "email {EMAIL}" },
                        {
                            type: "image_url",
                            image_url: {
                                url: "https://example.com/image.png",
                            },
                        },
                        { type: "text", text: "phone {PHONE}" },
                    ],
                },
            ],
        });
    });

    it("redacts PII before sending a community model request upstream", async () => {
        guardrailResponse = intervened(
            {
                sensitiveInformationPolicy: {
                    piiEntities: [
                        {
                            action: "ANONYMIZED",
                            match: "a@example.com",
                            type: "EMAIL",
                        },
                    ],
                },
            },
            [{ text: "email {EMAIL}" }],
        );

        const secret = "community-safety-test-secret";
        const endpoint: ProxyCommunityEndpointRuntime = {
            type: "proxy",
            id: "community-endpoint-id",
            ownerUserId: "owner-id",
            modelId: "owner/community-model",
            name: "community-model",
            title: "Community Model",
            description: null,
            modality: "text",
            imagePricing: "request",
            inputModalities: ["text"],
            requiredSafetyFeatures: [],
            baseUrl: "https://community.example.test/v1",
            upstreamModel: "upstream-model",
            visibility: "public",
            paidOnly: false,
            perUserRpm: null,
            fallbacks: [],
            hiddenAt: null,
            hiddenReason: null,
            bearerTokenCiphertext: await encryptSecret("sk_saved", secret),
            ...communityEndpointPrices({
                promptTextPrice: 0.1,
                completionTextPrice: 0.1,
            }),
        };
        const definition = communityModelDefinition(endpoint);
        const upstreamFetch = vi.fn(
            async (_input: RequestInfo | URL, init?: RequestInit) => {
                expect(JSON.parse(String(init?.body))).toMatchObject({
                    model: "upstream-model",
                    messages: [{ role: "user", content: "email {EMAIL}" }],
                });
                expect(String(init?.body)).not.toContain("a@example.com");
                return Response.json({
                    model: "upstream-model",
                    choices: [
                        {
                            index: 0,
                            message: { role: "assistant", content: "ok" },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 2,
                        completion_tokens: 1,
                        total_tokens: 3,
                    },
                });
            },
        );
        const app = new Hono<Env>()
            .use("*", async (c, next) => {
                c.set("log", testLog);
                c.set("requestId", "community-safety-request");
                c.set("track", {
                    modelRequested: endpoint.modelId,
                    resolvedModelRequested: endpoint.modelId,
                    streamRequested: false,
                    overrideResponseTracking() {},
                    setPricingInput() {},
                    attempts: [],
                });
                c.set("model", {
                    requested: endpoint.modelId,
                    resolved: endpoint.modelId,
                    definition,
                    communityEndpoint: endpoint,
                });
                const body = await c.req.json();
                c.req.addValidatedData("json", body);
                await next();
            })
            .post("/v1/chat/completions", generateChatCompletion);

        const response = await app.request(
            "/v1/chat/completions",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: endpoint.modelId,
                    safe: "privacy",
                    messages: [
                        { role: "user", content: "email a@example.com" },
                    ],
                }),
            },
            {
                ...configuredEnv,
                BETTER_AUTH_SECRET: secret,
                PORTKEY_GATEWAY_URL: "https://portkey.test",
                PORTKEY: { fetch: upstreamFetch },
            } as unknown as CloudflareBindings,
        );

        expect(response.status, await response.clone().text()).toBe(200);
        expect(upstreamFetch).toHaveBeenCalledOnce();
        expect(response.headers.get("X-Safety-Applied")).toBe("privacy");
        expect(response.headers.get("X-Safety-Redacted")).toBe("EMAIL");
    });

    it("checks only the latest chat parts when a safe chat request has too many text parts", async () => {
        guardrailResponse = intervened(
            {
                sensitiveInformationPolicy: {
                    piiEntities: [
                        {
                            action: "ANONYMIZED",
                            match: "a@example.com",
                            type: "EMAIL",
                        },
                    ],
                },
            },
            Array.from({ length: 25 }, (_, index) => ({
                text: `redacted ${index + 1}`,
            })),
        );

        const response = await safetyApp().request(
            "/chat",
            {
                method: "POST",
                body: JSON.stringify({
                    model: "openai",
                    safe: "privacy",
                    messages: Array.from({ length: 26 }, (_, index) => ({
                        role: "user",
                        content:
                            index === 0
                                ? "a@example.com"
                                : `safe part ${index}`,
                    })),
                }),
            },
            configuredEnv,
        );

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledOnce();
        const body = (await response.json()) as {
            messages: { content: string }[];
        };
        expect(body.messages[0].content).toBe("a@example.com");
        expect(body.messages[1].content).toBe("redacted 1");
        expect(body.messages[25].content).toBe("redacted 25");
    });

    it("checks only the latest characters from an oversized chat part", async () => {
        guardrailResponse = intervened(
            {
                sensitiveInformationPolicy: {
                    piiEntities: [
                        {
                            action: "ANONYMIZED",
                            match: "tail@example.com",
                            type: "EMAIL",
                        },
                    ],
                },
            },
            [{ text: "safe tail {EMAIL}" }],
        );

        const prefix = `a@example.com ${"safe prefix ".repeat(100)}`;
        const tail = `${"safe tail ".repeat(5_100)}tail@example.com`;
        const input = `${prefix}${tail}`;
        const response = await safetyApp().request(
            "/chat",
            {
                method: "POST",
                body: JSON.stringify({
                    model: "openai",
                    safe: "privacy",
                    messages: [{ role: "user", content: input }],
                }),
            },
            configuredEnv,
        );

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledOnce();
        const body = (await response.json()) as {
            messages: { content: string }[];
        };
        expect(body.messages[0].content).toBe(
            `${input.slice(0, input.length - 50_000)}safe tail {EMAIL}`,
        );
    });
});

describe("safety cache keys", () => {
    it("keeps disabled safety on the existing text and media keys", async () => {
        const request = new Request(
            "https://gen.pollinations.ai/text/hello?model=openai",
        );
        expect(
            await generateTextCacheKey(request, undefined, undefined, []),
        ).toBe(await generateTextCacheKey(request));

        const url = new URL("https://gen.pollinations.ai/image/hello");
        expect(generateMediaCacheKey(url, undefined, [])).toBe(
            generateMediaCacheKey(url),
        );
    });

    it("partitions required safety by its canonical settings", async () => {
        const request = new Request(
            "https://gen.pollinations.ai/text/hello?model=openai",
        );
        const withoutSafety = await generateTextCacheKey(request);
        const harmfulContent = await generateTextCacheKey(
            request,
            undefined,
            undefined,
            ["violence", "sexual"],
        );
        const privacy = await generateTextCacheKey(
            request,
            undefined,
            undefined,
            ["privacy"],
        );

        expect(harmfulContent).not.toBe(withoutSafety);
        expect(harmfulContent).not.toBe(privacy);
        expect(harmfulContent).toBe(
            await generateTextCacheKey(request, undefined, undefined, [
                "sexual",
                "violence",
            ]),
        );
    });

    it("includes fallback requirements", () => {
        const model = {
            requested: "primary",
            resolved: "primary",
            definition: { requiredSafetyFeatures: ["sexual"] },
            fallbackEntries: [
                { definition: { requiredSafetyFeatures: ["violence"] } },
            ],
        } as ModelVariables["model"];

        expect(getRequiredSafetyFeatures(model)).toEqual([
            "sexual",
            "violence",
        ]);
    });

    it("adds a safety namespace to text cache keys when safe is active", async () => {
        const noSafety = await generateTextCacheKey(
            new Request("https://gen.pollinations.ai/text/hello?model=openai"),
        );
        const withSafety = await generateTextCacheKey(
            new Request(
                "https://gen.pollinations.ai/text/hello?model=openai&safe=privacy",
            ),
        );

        const mediaUrl = new URL(
            "https://gen.pollinations.ai/image/hello?model=flux",
        );
        const mediaWithoutSafety = generateMediaCacheKey(mediaUrl);
        const mediaHarmfulContent = generateMediaCacheKey(mediaUrl, undefined, [
            "violence",
            "sexual",
        ]);
        expect(mediaHarmfulContent).not.toBe(mediaWithoutSafety);
        expect(mediaHarmfulContent).not.toBe(
            generateMediaCacheKey(mediaUrl, undefined, ["privacy"]),
        );
        expect(mediaHarmfulContent).toBe(
            generateMediaCacheKey(mediaUrl, undefined, ["sexual", "violence"]),
        );

        expect(withSafety).not.toBe(noSafety);
    });

    it("keeps safety headers in text cache metadata", () => {
        const metadata = prepareTextCacheMetadata(
            new Response("ok", {
                headers: { "X-Safety-Applied": "privacy" },
            }),
        );

        expect(metadata["header_x-safety-applied"]).toBe("privacy");
    });

    it("separates text cache keys when safe is provided by header", async () => {
        const noSafety = await generateTextCacheKey(
            new Request("https://gen.pollinations.ai/text/hello?model=openai"),
        );
        const withHeaderSafety = await generateTextCacheKey(
            new Request("https://gen.pollinations.ai/text/hello?model=openai", {
                headers: { [SAFETY_HEADER_NAME]: "privacy" },
            }),
        );
        const withQueryOverride = await generateTextCacheKey(
            new Request(
                "https://gen.pollinations.ai/text/hello?model=openai&safe=false",
                {
                    headers: { [SAFETY_HEADER_NAME]: "privacy" },
                },
            ),
        );

        expect(withHeaderSafety).not.toBe(noSafety);
        expect(withQueryOverride).not.toBe(withHeaderSafety);
    });

    it("separates media cache keys when safe is active", () => {
        const withSafety = generateMediaCacheKey(
            new URL("https://gen.pollinations.ai/image/hello?safe=true"),
        );
        const withoutSafety = generateMediaCacheKey(
            new URL("https://gen.pollinations.ai/image/hello?safe=false"),
        );

        expect(withSafety).not.toBe(withoutSafety);
        expect(withSafety).toContain(`__safety_${MEDIA_SAFETY_CACHE_VERSION}`);
    });

    it("separates media cache keys when safe is provided by header", () => {
        const withoutHeaderSafety = generateMediaCacheKey(
            new URL("https://gen.pollinations.ai/image/hello"),
        );
        const withHeaderSafety = generateMediaCacheKey(
            new URL("https://gen.pollinations.ai/image/hello"),
            "privacy",
        );
        const withQueryOverride = generateMediaCacheKey(
            new URL("https://gen.pollinations.ai/image/hello?safe=false"),
            "privacy",
        );

        expect(withHeaderSafety).not.toBe(withoutHeaderSafety);
        expect(withHeaderSafety).toContain(
            `__safety_${MEDIA_SAFETY_CACHE_VERSION}`,
        );
        expect(withQueryOverride).not.toBe(withHeaderSafety);
        expect(withQueryOverride).toBe(
            generateMediaCacheKey(
                new URL("https://gen.pollinations.ai/image/hello?safe=false"),
            ),
        );
    });
});
