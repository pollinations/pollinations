import { parseSafeFeatures, SafeSchema } from "@shared/schemas/safety.ts";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";
import { applySafety, withSafetyHeaders } from "@/middleware/safety.ts";
import type { BedrockResponse } from "@/utils/bedrock-guardrail.ts";
import { generateCacheKey as generateMediaCacheKey } from "@/utils/media-cache.ts";
import { generateCacheKey as generateTextCacheKey } from "@/utils/text-cache.ts";

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
        expect(SafeSchema.parse(false)).toBeUndefined();
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
});
