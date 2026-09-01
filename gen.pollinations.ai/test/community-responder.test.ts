import { env } from "cloudflare:test";
import {
    communityEndpointPrices,
    communityModelDefinition,
} from "@shared/community-endpoints.ts";
import {
    account as accountTable,
    user as userTable,
} from "@shared/db/better-auth.ts";
import { encryptSecret } from "@shared/secret-encryption.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env.ts";
import {
    humanCallerId,
    humanResponderDiscordId,
    resolveHumanResponderUserId,
    stripHumanResponderMetadata,
    validateHumanResponderCompletion,
} from "@/text/communityResponder.ts";
import { generateChatCompletion } from "../src/routes/generation-handlers.ts";

const db = drizzle(env.DB);
const testLog = {
    getChild: () => testLog,
    debug() {},
    info() {},
    warn() {},
    error() {},
} as never;

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

async function linkDiscord({
    discordId,
    banned = false,
    banExpires = null,
}: {
    discordId: string;
    banned?: boolean;
    banExpires?: Date | null;
}) {
    const userId = `responder-${crypto.randomUUID()}`;
    const now = new Date();
    await db.insert(userTable).values({
        id: userId,
        email: `${userId}@test.local`,
        name: "Human responder",
        banned,
        banExpires,
        createdAt: now,
        updatedAt: now,
    });
    await db.insert(accountTable).values({
        id: `account-${crypto.randomUUID()}`,
        accountId: discordId,
        providerId: "discord",
        userId,
        createdAt: now,
        updatedAt: now,
    });
    return userId;
}

describe("human responder identity", () => {
    it("creates a stable endpoint-scoped opaque caller id", async () => {
        const callerId = "internal-user-id";
        const first = await humanCallerId("secret", "endpoint-a", callerId);
        const same = await humanCallerId("secret", "endpoint-a", callerId);
        const otherEndpoint = await humanCallerId(
            "secret",
            "endpoint-b",
            callerId,
        );

        expect(first).toBe(same);
        expect(first).not.toBe(otherEndpoint);
        expect(first).not.toContain(callerId);
        expect(first).toMatch(/^hc_[A-Za-z0-9_-]{43}$/);
    });

    it("reads and strips only valid internal responder metadata", () => {
        const completion = {
            id: "chatcmpl-test",
            _pollinations: {
                responder: { discordId: "123456789012345678" },
            },
        };

        expect(humanResponderDiscordId(completion)).toBe("123456789012345678");
        expect(stripHumanResponderMetadata(completion)).toEqual({
            id: "chatcmpl-test",
        });
        expect(
            humanResponderDiscordId({
                _pollinations: { responder: { discordId: "not-discord" } },
            }),
        ).toBeNull();
    });

    it("requires exactly one choice and integer token usage", () => {
        const completion = {
            choices: [
                {
                    message: { role: "assistant", content: "answer" },
                },
            ],
            usage: {
                prompt_tokens: 4,
                completion_tokens: 3,
                total_tokens: 7,
            },
            _pollinations: {
                responder: { discordId: "123456789012345678" },
            },
        };

        expect(validateHumanResponderCompletion(completion)).toEqual({
            discordId: "123456789012345678",
        });
        expect(
            validateHumanResponderCompletion({
                ...completion,
                choices: [...completion.choices, ...completion.choices],
            }),
        ).toEqual({
            error: "Human responder returned an invalid number of choices",
        });
        expect(
            validateHumanResponderCompletion({
                ...completion,
                usage: { ...completion.usage, completion_tokens: 2.5 },
            }),
        ).toEqual({ error: "Human responder returned invalid token usage" });
    });

    it("requires exactly one active Better Auth Discord link", async () => {
        const activeDiscordId = "123456789012345671";
        const activeUserId = await linkDiscord({
            discordId: activeDiscordId,
        });
        expect(await resolveHumanResponderUserId(env.DB, activeDiscordId)).toBe(
            activeUserId,
        );

        const bannedDiscordId = "223456789012345672";
        await linkDiscord({ discordId: bannedDiscordId, banned: true });
        expect(
            await resolveHumanResponderUserId(env.DB, bannedDiscordId),
        ).toBeNull();

        const duplicateDiscordId = "323456789012345673";
        await linkDiscord({ discordId: duplicateDiscordId });
        await linkDiscord({ discordId: duplicateDiscordId });
        expect(
            await resolveHumanResponderUserId(env.DB, duplicateDiscordId),
        ).toBeNull();
    });

    it("sends only trusted caller metadata and strips responder metadata", async () => {
        const responderDiscordId = "423456789012345674";
        const responderUserId = await linkDiscord({
            discordId: responderDiscordId,
        });
        const callerUserId = `caller-${crypto.randomUUID()}`;
        const now = new Date();
        await db.insert(userTable).values({
            id: callerUserId,
            email: `${callerUserId}@test.local`,
            name: "Human model caller",
            createdAt: now,
            updatedAt: now,
        });
        const [caller] = await db
            .select()
            .from(userTable)
            .where(eq(userTable.id, callerUserId));

        const secret = "human-model-test-secret";
        const endpoint = {
            type: "proxy" as const,
            id: "human-endpoint-id",
            ownerUserId: "human-owner-id",
            modelId: "voodoohop/humans",
            name: "humans",
            title: "Humans",
            description: null,
            humanResponders: true,
            modality: "text" as const,
            imagePricing: "request" as const,
            inputModalities: ["text" as const],
            baseUrl: "https://human.example.test/v1",
            upstreamModel: "humans",
            visibility: "public" as const,
            paidOnly: false,
            perUserRpm: null,
            fallbacks: [],
            hiddenAt: null,
            hiddenReason: null,
            bearerTokenCiphertext: await encryptSecret("upstream-key", secret),
            ...communityEndpointPrices({
                promptTextPrice: 10,
                completionTextPrice: 50,
            }),
        };
        const setResponderUserId = vi.fn();
        const upstreamFetch = vi.fn(
            async (_input: RequestInfo | URL, init?: RequestInit) => {
                const body = JSON.parse(String(init?.body));
                expect(body._pollinations).toEqual({
                    caller: {
                        id: expect.stringMatching(/^hc_/),
                    },
                });
                expect(JSON.stringify(body._pollinations)).not.toContain(
                    callerUserId,
                );
                return Response.json({
                    id: "chatcmpl-human",
                    object: "chat.completion",
                    created: 1,
                    model: "humans",
                    choices: [
                        {
                            index: 0,
                            message: {
                                role: "assistant",
                                content: "A human answer",
                            },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 4,
                        completion_tokens: 3,
                        total_tokens: 7,
                    },
                    _pollinations: {
                        responder: { discordId: responderDiscordId },
                    },
                });
            },
        );
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                Response.json({ action: "NONE", assessments: [] }),
            ),
        );

        const app = new Hono<Env>()
            .use("*", async (c, next) => {
                const body = await c.req.json();
                c.set("log", testLog);
                c.set("requestId", "human-request-id");
                c.set("auth", {
                    user: caller,
                    requireUser: () => caller,
                    requireModelAccess() {},
                });
                c.set("track", {
                    modelRequested: endpoint.modelId,
                    resolvedModelRequested: endpoint.modelId,
                    streamRequested: body.stream === true,
                    overrideResponseTracking() {},
                    setPricingInput() {},
                    setCommunityResponderUserId: setResponderUserId,
                    attempts: [],
                });
                c.set("model", {
                    requested: endpoint.modelId,
                    resolved: endpoint.modelId,
                    definition: communityModelDefinition(endpoint),
                    communityEndpoint: endpoint,
                });
                c.req.addValidatedData("json", body);
                await next();
            })
            .post("/v1/chat/completions", generateChatCompletion);

        const bindings = {
            DB: env.DB,
            BETTER_AUTH_SECRET: secret,
            PORTKEY_GATEWAY_URL: "https://portkey.test",
            PORTKEY: { fetch: upstreamFetch },
            AWS_ACCESS_KEY_ID: "test-access-key",
            AWS_SECRET_ACCESS_KEY: "test-secret-key",
            AWS_REGION: "us-east-1",
            BEDROCK_GUARDRAIL_ID: "test-guardrail",
            BEDROCK_GUARDRAIL_VERSION: "1",
        } as unknown as CloudflareBindings;
        const response = await app.request(
            "/v1/chat/completions",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    model: endpoint.modelId,
                    safe: false,
                    messages: [{ role: "user", content: "Please answer" }],
                    _pollinations: { caller: { id: callerUserId } },
                }),
            },
            bindings,
        );

        expect(response.status, await response.clone().text()).toBe(200);
        const body = await response.json<Record<string, unknown>>();
        expect(body).not.toHaveProperty("_pollinations");
        expect(setResponderUserId).toHaveBeenCalledWith(responderUserId);

        const streamResponse = await app.request(
            "/v1/chat/completions",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    model: endpoint.modelId,
                    safe: false,
                    stream: true,
                    messages: [{ role: "user", content: "Please answer" }],
                }),
            },
            bindings,
        );

        expect(streamResponse.status, await streamResponse.clone().text()).toBe(
            200,
        );
        expect(streamResponse.headers.get("content-type")).toContain(
            "text/event-stream",
        );
        const streamBody = await streamResponse.text();
        expect(streamBody).toContain('"delta":{"content":"A human answer"}');
        expect(streamBody).toContain('"finish_reason":"stop"');
        expect(streamBody).toContain(
            '"usage":{"prompt_tokens":4,"completion_tokens":3,"total_tokens":7}',
        );
        expect(streamBody).toContain("data: [DONE]");
        expect(streamBody).not.toContain("_pollinations");
        expect(setResponderUserId).toHaveBeenCalledTimes(2);

        const streamedUpstreamBody = JSON.parse(
            String(upstreamFetch.mock.calls.at(-1)?.[1]?.body),
        );
        expect(streamedUpstreamBody.stream).toBe(false);
        expect(streamedUpstreamBody).not.toHaveProperty("stream_options");
    });
});
