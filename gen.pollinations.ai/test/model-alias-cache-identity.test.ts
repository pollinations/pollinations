import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import {
    createTestApiKey,
    test as workerTest,
} from "@shared/test/fixtures/index.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, expect, vi } from "vitest";
import worker from "../src/index.ts";
import { withInlineGenerationCoordinator } from "./helpers/inline-generation-coordinator.ts";

/**
 * The generation-cache identity uses the *requested* model string, not the
 * resolved canonical id. Every text/media route that accepts aliases
 * ("openai" = openai/gpt-5.4-nano, "jev" = typesafe/jev-1.13, "flash" =
 * elevenlabs/eleven-flash-v2.5, ...) fragments one generation across one cache
 * entry per spelling, so the same request is regenerated and rebilled, and
 * concurrent spellings do not single-flight. mediaResponses.ts:119 already
 * rewrites `model` to `entry.id` on its re-entry path — the rest of the
 * platform never applied the same normalization.
 */

const db = drizzle(env.DB);

afterEach(() => vi.restoreAllMocks());

/** Portkey gateway upstream for openai/gpt-5.4-nano (alias "openai"). */
function mockPortkeyChat(tinybird: ReturnType<typeof createMockTinybird>) {
    let executions = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = new URL(
            input instanceof Request ? input.url : String(input),
        );
        if (url.host === "portkey.test") {
            executions++;
            return Response.json({
                id: "chatcmpl_alias_test",
                object: "chat.completion",
                created: 1,
                model: "openai/gpt-5.4-nano",
                choices: [
                    {
                        index: 0,
                        message: { role: "assistant", content: "kiwi" },
                        finish_reason: "stop",
                    },
                ],
                usage: {
                    prompt_tokens: 12,
                    completion_tokens: 7,
                    total_tokens: 19,
                },
            });
        }
        if (url.pathname === "/v0/pipes/public_model_stats.json") {
            return Response.json({ data: [] });
        }
        const handler = tinybird.handlerMap[url.host];
        if (handler) return handler(new Request(input, init));
        throw new Error(
            `Unexpected outbound request: ${url.host}${url.pathname}`,
        );
    });
    return {
        get executions() {
            return executions;
        },
    };
}

async function drain(tinybird: ReturnType<typeof createMockTinybird>) {
    await vi.waitFor(() => {
        expect(tinybird.state.events.some((event) => event.isBilledUsage)).toBe(
            true,
        );
    });
}

const chatRequest = (key: string, model: string) =>
    new Request("https://gen.pollinations.ai/v1/chat/completions", {
        method: "POST",
        headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "say kiwi" }],
        }),
    });

workerTest(
    "shares the chat cache entry across model aliases",
    async () => {
        const owner = await createTestApiKey({
            user: { packBalance: 100 },
        });
        const tinybird = createMockTinybird();
        const provider = mockPortkeyChat(tinybird);

        const ctxCanonical = createExecutionContext();
        const canonical = await worker.fetch(
            chatRequest(owner.key, "openai/gpt-5.4-nano"),
            env,
            ctxCanonical,
        );
        expect(canonical.status).toBe(200);
        expect((await canonical.text()).length).toBeGreaterThan(0);
        await waitOnExecutionContext(ctxCanonical);
        expect(provider.executions).toBe(1);
        await drain(tinybird);

        const balanceBefore = await getUserBalance(db, owner.userId);

        // The same request through the alias "openai" resolves to the same
        // model and must reuse the entry, not regenerate and rebill it.
        const ctxAlias = createExecutionContext();
        const alias = await worker.fetch(
            chatRequest(owner.key, "openai"),
            env,
            ctxAlias,
        );
        await waitOnExecutionContext(ctxAlias);
        expect(alias.status).toBe(200);
        // Consume the R2-backed body before asserting so no storage handle
        // outlives a failing assertion either.
        expect((await alias.text()).length).toBeGreaterThan(0);
        expect(alias.headers.get("x-cache")).toBe("HIT");
        expect(provider.executions).toBe(1);

        const balanceAfter = await getUserBalance(db, owner.userId);
        expect(balanceBefore.packBalance - balanceAfter.packBalance).toBe(0);
    },
    30_000,
);

workerTest(
    "shares the simple text cache entry across model aliases",
    async () => {
        const owner = await createTestApiKey({
            user: { packBalance: 100 },
        });
        const tinybird = createMockTinybird();
        const provider = mockPortkeyChat(tinybird);
        const prompt = `alias-get-${crypto.randomUUID()}`;

        const url = (model: string) =>
            new Request(
                `https://gen.pollinations.ai/text/${encodeURIComponent(prompt)}?model=${encodeURIComponent(model)}`,
                { headers: { authorization: `Bearer ${owner.key}` } },
            );
        const ctxCanonical = createExecutionContext();
        const canonical = await worker.fetch(
            url("openai/gpt-5.4-nano"),
            env,
            ctxCanonical,
        );
        expect(canonical.status).toBe(200);
        expect(await canonical.text()).toBe("kiwi");
        await waitOnExecutionContext(ctxCanonical);
        expect(provider.executions).toBe(1);
        await drain(tinybird);

        const ctxAlias = createExecutionContext();
        const alias = await worker.fetch(url("openai"), env, ctxAlias);
        await waitOnExecutionContext(ctxAlias);
        expect(alias.status).toBe(200);
        expect(await alias.text()).toBe("kiwi");
        expect(alias.headers.get("x-cache")).toBe("HIT");
        expect(provider.executions).toBe(1);
    },
    30_000,
);

/** OpenRouter decisions upstream shared by jev + span models. */
function mockOpenRouterDecisions(
    tinybird: ReturnType<typeof createMockTinybird>,
) {
    let executions = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = new URL(
            input instanceof Request ? input.url : String(input),
        );
        if (url.host === "openrouter.ai") {
            executions++;
            return Response.json({
                answers: {
                    pull: { type: "noul", noul: 0.73 },
                },
                usage: { input_tokens: 10, output_tokens: 0 },
            });
        }
        if (url.pathname === "/v0/pipes/public_model_stats.json") {
            return Response.json({ data: [] });
        }
        const handler = tinybird.handlerMap[url.host];
        if (handler) return handler(new Request(input, init));
        throw new Error(
            `Unexpected outbound request: ${url.host}${url.pathname}`,
        );
    });
    return {
        get executions() {
            return executions;
        },
    };
}

const decisionRequest = (key: string, model: string, mark: string) =>
    new Request("https://gen.pollinations.ai/alpha/decisions", {
        method: "POST",
        headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            model,
            state: `A trolley will kill five unless diverted. ${mark}`,
            questions: {
                pull: {
                    type: "noul",
                    instructions: "Should the switch be pulled?",
                    criteria: { true: "Pull", false: "Leave" },
                },
            },
        }),
    });

workerTest(
    "shares the decisions cache entry across model aliases",
    async () => {
        const owner = await createTestApiKey({
            user: { packBalance: 100 },
        });
        const tinybird = createMockTinybird();
        const provider = mockOpenRouterDecisions(tinybird);
        // The DO isolate does not see per-test env mutations, so run the
        // coordinator inline with the OpenRouter key attached.
        const bindings = withInlineGenerationCoordinator({
            ...env,
            OPENROUTER_API_KEY: "workers-test-only",
        });
        const mark = `alias-${crypto.randomUUID()}`;

        const ctxCanonical = createExecutionContext();
        const canonical = await worker.fetch(
            decisionRequest(owner.key, "typesafe/jev-1.13", mark),
            bindings,
            ctxCanonical,
        );
        expect(canonical.status).toBe(200);
        await expect(canonical.clone().json()).resolves.toMatchObject({
            model: "typesafe/jev-1.13",
        });
        await waitOnExecutionContext(ctxCanonical);
        expect(provider.executions).toBe(1);
        await drain(tinybird);

        const ctxAlias = createExecutionContext();
        const alias = await worker.fetch(
            decisionRequest(owner.key, "jev", mark),
            bindings,
            ctxAlias,
        );
        await waitOnExecutionContext(ctxAlias);
        expect(alias.status).toBe(200);
        // Consume the R2-backed body before asserting so no storage handle
        // outlives a failing assertion either.
        const aliasBody = await alias.json();
        expect(aliasBody).toMatchObject({ model: "typesafe/jev-1.13" });
        expect(alias.headers.get("x-cache")).toBe("HIT");
        expect(provider.executions).toBe(1);
    },
    30_000,
);

/** ElevenLabs upstream for elevenlabs/eleven-flash-v2.5 (alias "flash"). */
const MP3 = Uint8Array.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00]);

function mockElevenlabs(tinybird: ReturnType<typeof createMockTinybird>) {
    let executions = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = new URL(
            input instanceof Request ? input.url : String(input),
        );
        if (url.host === "api.elevenlabs.io") {
            executions++;
            return new Response(MP3, {
                headers: { "content-type": "audio/mpeg" },
            });
        }
        if (url.pathname === "/v0/pipes/public_model_stats.json") {
            return Response.json({ data: [] });
        }
        const handler = tinybird.handlerMap[url.host];
        if (handler) return handler(new Request(input, init));
        throw new Error(
            `Unexpected outbound request: ${url.host}${url.pathname}`,
        );
    });
    return {
        get executions() {
            return executions;
        },
    };
}

workerTest(
    "shares the audio cache entry across model aliases",
    async () => {
        const owner = await createTestApiKey({
            user: { packBalance: 100 },
        });
        const tinybird = createMockTinybird();
        const provider = mockElevenlabs(tinybird);
        const bindings = withInlineGenerationCoordinator({
            ...env,
            ELEVENLABS_API_KEY: "workers-test-only",
        });
        const prompt = `alias-audio-${crypto.randomUUID()}`;
        const url = (model: string) =>
            new Request(
                `https://gen.pollinations.ai/audio/${encodeURIComponent(prompt)}?model=${encodeURIComponent(model)}`,
                { headers: { authorization: `Bearer ${owner.key}` } },
            );

        const ctxCanonical = createExecutionContext();
        const canonical = await worker.fetch(
            url("elevenlabs/eleven-flash-v2.5"),
            bindings,
            ctxCanonical,
        );
        expect(canonical.status).toBe(200);
        expect((await canonical.arrayBuffer()).byteLength).toBeGreaterThan(0);
        await waitOnExecutionContext(ctxCanonical);
        expect(provider.executions).toBe(1);
        await drain(tinybird);

        const ctxAlias = createExecutionContext();
        const alias = await worker.fetch(url("flash"), bindings, ctxAlias);
        await waitOnExecutionContext(ctxAlias);
        expect(alias.status).toBe(200);
        // Consume the R2-backed body before asserting so no storage handle
        // outlives a failing assertion either.
        expect((await alias.arrayBuffer()).byteLength).toBeGreaterThan(0);
        expect(provider.executions).toBe(1);
    },
    30_000,
);
