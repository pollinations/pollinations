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
 * A stream flag that the route never honors still lands in the text cache
 * identity and in track's streamRequested:
 *  - `?stream=true` as a *query* param on POST routes: extractStreamRequested
 *    reads only the body for POST, but generateCacheKey folds the query param
 *    into both the filtered params and the STREAM_CACHE_VERSION part.
 *  - a stray body `stream` on /alpha/decisions: zod strips the field (the route
 *    has no streaming), yet the raw body is hashed into the key and the raw
 *    clone is re-read by extractStreamRequested, which skips the Generation
 *    Coordinator.
 */

const db = drizzle(env.DB);

afterEach(() => vi.restoreAllMocks());

/** Portkey gateway upstream for openai/gpt-5.4-nano. */
function mockPortkeyChat(tinybird: ReturnType<typeof createMockTinybird>) {
    let executions = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = new URL(
            input instanceof Request ? input.url : String(input),
        );
        if (url.host === "portkey.test") {
            executions++;
            return Response.json({
                id: "chatcmpl_stream_test",
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

const chatRequest = (key: string, query = "") =>
    new Request(`https://gen.pollinations.ai/v1/chat/completions${query}`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            model: "openai/gpt-5.4-nano",
            messages: [{ role: "user", content: "say kiwi" }],
        }),
    });

workerTest(
    "ignores a stream query flag on POST in the cache identity",
    async () => {
        const owner = await createTestApiKey({
            user: { packBalance: 100 },
        });
        const tinybird = createMockTinybird();
        const provider = mockPortkeyChat(tinybird);

        const ctxPlain = createExecutionContext();
        const plain = await worker.fetch(chatRequest(owner.key), env, ctxPlain);
        expect(plain.status).toBe(200);
        expect((await plain.text()).length).toBeGreaterThan(0);
        await waitOnExecutionContext(ctxPlain);
        expect(provider.executions).toBe(1);
        await drain(tinybird);

        const balanceBefore = await getUserBalance(db, owner.userId);

        // The query flag changes nothing on a POST route: the body decides
        // streaming. The same request must reuse the cache entry instead of
        // regenerating and rebilling it.
        const ctxStreamed = createExecutionContext();
        const streamed = await worker.fetch(
            chatRequest(owner.key, "?stream=true"),
            env,
            ctxStreamed,
        );
        await waitOnExecutionContext(ctxStreamed);
        expect(streamed.status).toBe(200);
        expect(streamed.headers.get("content-type")).not.toContain(
            "text/event-stream",
        );
        // Consume the R2-backed body before asserting so no storage handle
        // outlives a failing assertion either.
        expect((await streamed.text()).length).toBeGreaterThan(0);
        expect(streamed.headers.get("x-cache")).toBe("HIT");
        expect(provider.executions).toBe(1);

        const balanceAfter = await getUserBalance(db, owner.userId);
        expect(balanceBefore.packBalance - balanceAfter.packBalance).toBe(0);
    },
    30_000,
);

/** OpenRouter decisions upstream; can be held slow for concurrency tests. */
function mockOpenRouterDecisions(
    tinybird: ReturnType<typeof createMockTinybird>,
    hold: boolean,
) {
    let executions = 0;
    let releaseGeneration: () => void = () => {};
    const inFlight = hold
        ? new Promise<void>((resolve) => {
              releaseGeneration = resolve;
          })
        : Promise.resolve();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = new URL(
            input instanceof Request ? input.url : String(input),
        );
        if (url.host === "openrouter.ai") {
            executions++;
            await inFlight;
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
        release: releaseGeneration,
        async drain() {
            await vi.waitFor(() => {
                expect(
                    tinybird.state.events.some((event) => event.isBilledUsage),
                ).toBe(true);
            });
        },
    };
}

const decisionRequest = (key: string, stream: boolean, mark: string) =>
    new Request("https://gen.pollinations.ai/alpha/decisions", {
        method: "POST",
        headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            model: "respan/span-01-lite",
            state: `A trolley will kill five unless diverted. ${mark}`,
            questions: {
                pull: {
                    type: "noul",
                    instructions: "Should the switch be pulled?",
                    criteria: { true: "Pull", false: "Leave" },
                },
            },
            ...(stream ? { stream: true } : {}),
        }),
    });

workerTest(
    "ignores a stray body stream field on decisions in the cache identity",
    async () => {
        const owner = await createTestApiKey({
            user: { packBalance: 100 },
        });
        const tinybird = createMockTinybird();
        const provider = mockOpenRouterDecisions(tinybird, false);
        const bindings = withInlineGenerationCoordinator({
            ...env,
            OPENROUTER_API_KEY: "workers-test-only",
        });
        const mark = `stray-${crypto.randomUUID()}`;

        const ctxPlain = createExecutionContext();
        const plain = await worker.fetch(
            decisionRequest(owner.key, false, mark),
            bindings,
            ctxPlain,
        );
        expect(plain.status).toBe(200);
        expect(plain.headers.get("content-type")).not.toContain(
            "text/event-stream",
        );
        await expect(plain.clone().json()).resolves.toMatchObject({
            model: "respan/span-01-lite",
        });
        await waitOnExecutionContext(ctxPlain);
        expect(provider.executions).toBe(1);
        await provider.drain();

        const balanceBefore = await getUserBalance(db, owner.userId);

        // The schema strips `stream`: the route has no streaming, the response
        // stays JSON, and the field must not fragment the cache identity.
        const ctxStreamed = createExecutionContext();
        const streamed = await worker.fetch(
            decisionRequest(owner.key, true, mark),
            bindings,
            ctxStreamed,
        );
        await waitOnExecutionContext(ctxStreamed);
        expect(streamed.status).toBe(200);
        expect(streamed.headers.get("content-type")).not.toContain(
            "text/event-stream",
        );
        // Consume the R2-backed body before asserting so no storage handle
        // outlives a failing assertion either.
        const streamedBody = await streamed.json();
        expect(streamedBody).toMatchObject({
            model: "respan/span-01-lite",
        });
        expect(streamed.headers.get("x-cache")).toBe("HIT");
        expect(provider.executions).toBe(1);

        const balanceAfter = await getUserBalance(db, owner.userId);
        expect(balanceBefore.packBalance - balanceAfter.packBalance).toBe(0);
    },
    30_000,
);

workerTest(
    "coordinates identical decisions across the stray stream field",
    async () => {
        const owner = await createTestApiKey({
            user: { packBalance: 100 },
        });
        const joiner = await createTestApiKey({
            user: { packBalance: 100 },
        });
        const tinybird = createMockTinybird();
        const provider = mockOpenRouterDecisions(tinybird, true);
        const bindings = withInlineGenerationCoordinator({
            ...env,
            OPENROUTER_API_KEY: "workers-test-only",
        });
        const mark = `join-${crypto.randomUUID()}`;

        // Two identical requests racing while the provider is slow, both with
        // a stray `stream` body field: the coordinator must collapse them into
        // one upstream generation.
        const ctxA = createExecutionContext();
        const ctxB = createExecutionContext();
        const pending = [
            worker.fetch(
                decisionRequest(owner.key, true, mark),
                bindings,
                ctxA,
            ),
            worker.fetch(
                decisionRequest(joiner.key, true, mark),
                bindings,
                ctxB,
            ),
        ];
        try {
            await vi.waitFor(() =>
                expect(provider.executions).toBeGreaterThanOrEqual(1),
            );
        } finally {
            provider.release();
        }
        const [a, b] = await Promise.all(pending);
        await waitOnExecutionContext(ctxA);
        await waitOnExecutionContext(ctxB);

        expect(a.status).toBe(200);
        expect(b.status).toBe(200);
        await expect(a.clone().json()).resolves.toMatchObject({
            model: "respan/span-01-lite",
        });
        await expect(b.clone().json()).resolves.toMatchObject({
            model: "respan/span-01-lite",
        });
        expect(provider.executions).toBe(1);
        await provider.drain();
    },
    30_000,
);
