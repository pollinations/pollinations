import {
    parseSafeFeatures,
    SAFETY_HEADER_NAME,
    SafeSchema,
} from "@shared/schemas/safety.ts";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";
import {
    applySafety,
    applySafetyToChatRequest,
    withSafetyHeaders,
} from "@/middleware/safety.ts";
import type { BedrockResponse } from "@/utils/bedrock-guardrail.ts";
import { generateCacheKey as generateMediaCacheKey } from "@/utils/media-cache.ts";
import {
    generateCacheKey as generateTextCacheKey,
    prepareMetadata as prepareTextCacheMetadata,
} from "@/utils/text-cache.ts";

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

function safetyApp() {
    return new Hono<Env>()
        .use("*", async (c, next) => {
            c.set("log", testLog);
            c.set("requestId", "test-request");
            await next();
        })
        .get("/scan/:text", async (c) => {
            const text = await applySafety(c, c.req.param("text"));
            return withSafetyHeaders(c, new Response(text));
        })
        .post("/chat", async (c) => {
            const body = await c.req.json();
            const safeBody = await applySafetyToChatRequest(
                c,
                body as Parameters<typeof applySafetyToChatRequest>[1],
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

describe("applySafety", () => {
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

    it("fails closed when a safe prompt exceeds the text budget", async () => {
        const input = `a@example.com ${"safe tail ".repeat(2_500)}`;
        const response = await safetyApp().request(
            `/scan/${encodeURIComponent(input)}?safe=privacy`,
            undefined,
            configuredEnv,
        );

        expect(response.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(await response.json()).toMatchObject({
            error: {
                type: "safety_error",
                code: "input_too_large",
                safety: {
                    maxTextChars: 20_000,
                    maxTextParts: 25,
                },
            },
        });
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

describe("applySafetyToChatRequest", () => {
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

    it("fails closed when a safe chat request has too many text parts", async () => {
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

        expect(response.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(await response.json()).toMatchObject({
            error: {
                type: "safety_error",
                code: "input_too_large",
            },
        });
    });
});

describe("safety cache keys", () => {
    it("adds a safety namespace to text cache keys when safe is active", async () => {
        const noSafety = await generateTextCacheKey(
            new Request("https://gen.pollinations.ai/text/hello?model=openai"),
        );
        const withSafety = await generateTextCacheKey(
            new Request(
                "https://gen.pollinations.ai/text/hello?model=openai&safe=privacy",
            ),
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

    it("adds a visible safety namespace to media cache keys when safe is active", () => {
        const withSafety = generateMediaCacheKey(
            new URL("https://gen.pollinations.ai/image/hello?safe=true"),
        );
        const withoutSafety = generateMediaCacheKey(
            new URL("https://gen.pollinations.ai/image/hello?safe=false"),
        );

        expect(withSafety).toContain("safety_bedrock-input-v1");
        expect(withoutSafety).not.toContain("safety_bedrock-input-v1");
    });

    it("adds header safety to media cache keys", () => {
        const withHeaderSafety = generateMediaCacheKey(
            new URL("https://gen.pollinations.ai/image/hello"),
            "privacy",
        );
        const withQueryOverride = generateMediaCacheKey(
            new URL("https://gen.pollinations.ai/image/hello?safe=false"),
            "privacy",
        );

        expect(withHeaderSafety).toContain("safe_header_privacy");
        expect(withHeaderSafety).toContain("safety_bedrock-input-v1");
        expect(withQueryOverride).not.toContain("safe_header");
        expect(withQueryOverride).not.toContain("safety_bedrock-input-v1");
    });
});
