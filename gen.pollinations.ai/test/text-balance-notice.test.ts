import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import { apikey, user } from "@shared/db/better-auth.ts";
import type { TinybirdEvent } from "@shared/schemas/generation-event.ts";
import { createTestApiKey } from "@shared/test/fixtures/index.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index.ts";
import { TEXT_BALANCE_NOTICE_ENABLED } from "../src/middleware/text-balance-notice.ts";
import { withInlineGenerationCoordinator } from "./helpers/inline-generation-coordinator.ts";

afterEach(() => vi.restoreAllMocks());

const model = "openai/gpt-5.4-nano";

beforeEach(async () => {
    await env.KV.put(
        "model-stats-v3",
        JSON.stringify({
            value: { data: [{ model, avg_cost_usd: 0.001 }] },
            ttl: 3600,
        }),
    );
});

describe("text balance notice", () => {
    const enabled = TEXT_BALANCE_NOTICE_ENABLED;

    it.each([false, true])("handles HEAD with json=%s", async (json) => {
        const caller = await createTestApiKey();
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({ data: [] }),
        );
        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request(
                `https://gen.pollinations.ai/text/hello?model=${model}&json=${json}`,
                {
                    method: "HEAD",
                    headers: { Authorization: `Bearer ${caller.key}` },
                },
            ),
            env,
            ctx,
        );
        expect(response.status).toBe(enabled && !json ? 200 : 402);
        expect(await response.text()).toBe("");
        await waitOnExecutionContext(ctx);
    });

    it.each([
        { path: "/text/hello", body: undefined, textOnly: false },
        { path: "/text", body: {}, textOnly: false },
        {
            path: "/v1/chat/completions",
            body: { modalities: ["text", "audio"] },
            textOnly: false,
        },
        {
            path: "/v1/chat/completions",
            body: { modalities: ["text"] },
            textOnly: true,
        },
    ])("preserves audio contracts on $path textOnly=$textOnly", async ({
        path,
        body,
        textOnly,
    }) => {
        const caller = await createTestApiKey();
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({ data: [] }),
        );
        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request(
                `https://gen.pollinations.ai${path}?model=openai-audio`,
                {
                    method: body ? "POST" : "GET",
                    headers: {
                        Authorization: `Bearer ${caller.key}`,
                        "Content-Type": "application/json",
                    },
                    ...(body && {
                        body: JSON.stringify({
                            model: "openai-audio",
                            messages: [{ role: "user", content: "hello" }],
                            ...body,
                        }),
                    }),
                },
            ),
            env,
            ctx,
        );
        const text = await response.text();
        expect(response.status, text).toBe(enabled && textOnly ? 200 : 402);
        expect(text).toContain(
            enabled && textOnly
                ? "The account behind this API key"
                : "INSUFFICIENT_BALANCE",
        );
        await waitOnExecutionContext(ctx);
    });

    it.each([
        { path: "/text/hello", stream: false },
        { path: "/text/hello", stream: true },
        { path: "/text", stream: false },
        { path: "/text", stream: true },
        { path: "/v1/chat/completions", stream: false },
        { path: "/v1/chat/completions", stream: true },
        { path: "/v1/responses", stream: false },
        { path: "/v1/responses", stream: true },
    ])("presents $path stream=$stream without caching or billing", async ({
        path,
        stream,
    }) => {
        const caller = await createTestApiKey({
            user: { tierBalance: 0, packBalance: 0 },
            pollenBudget: 1,
        });
        const events: TinybirdEvent[] = [];
        const otherRequests: string[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                const request = new Request(input, init);
                if (new URL(request.url).pathname === "/v0/events") {
                    events.push(
                        ...(await request.text())
                            .trim()
                            .split("\n")
                            .map((line) => JSON.parse(line)),
                    );
                } else {
                    otherRequests.push(request.url);
                }
                return Response.json({ data: [] });
            },
        );
        const bindings = {
            ...withInlineGenerationCoordinator(env),
            TINYBIRD_INGEST_URL:
                "https://tinybird.test/v0/events?name=generation_event_v2",
        };
        const get = path.startsWith("/text/");
        const url = `https://gen.pollinations.ai${path}?model=${model}&stream=${stream}&seed=123`;
        const request = () =>
            new Request(url, {
                method: get ? "GET" : "POST",
                headers: {
                    Authorization: `Bearer ${caller.key}`,
                    "Content-Type": "application/json",
                },
                ...(!get && {
                    body: JSON.stringify({
                        model,
                        stream,
                        ...(path === "/v1/responses"
                            ? { input: "hello" }
                            : {
                                  messages: [
                                      { role: "user", content: "hello" },
                                  ],
                              }),
                    }),
                }),
            });
        const beforeCache = (await env.TEXT_BUCKET.list()).objects.map(
            (object) => object.key,
        );
        // An identical retry must be checked again, never served the notice from cache.
        for (let attempt = 0; attempt < 2; attempt++) {
            const ctx = createExecutionContext();
            const response = await worker.fetch(request(), bindings, ctx);
            const body = await response.text();
            await waitOnExecutionContext(ctx);
            expect(response.status, body).toBe(
                TEXT_BALANCE_NOTICE_ENABLED ? 200 : 402,
            );
            expect(response.headers.get("x-cache")).not.toBe("HIT");
            if (TEXT_BALANCE_NOTICE_ENABLED) {
                expect(response.headers.get("cache-control")).toBe(
                    "private, no-store",
                );
                expect(body).toContain(
                    `?ref=agent_low_balance_topup&key_id=${caller.id}`,
                );
                expect(body).toContain(
                    `?ref=agent_low_balance_quests&key_id=${caller.id}`,
                );
                if (stream) {
                    expect(response.headers.get("content-type")).toContain(
                        "text/event-stream",
                    );
                    expect(body).toContain("data: [DONE]");
                    expect(body).toContain(
                        path === "/v1/responses"
                            ? '"type":"response.completed"'
                            : '"finish_reason":"stop"',
                    );
                } else if (path === "/v1/responses") {
                    expect(JSON.parse(body)).toMatchObject({
                        status: "completed",
                        usage: { total_tokens: 0 },
                        output: [{ role: "assistant" }],
                    });
                } else if (path === "/v1/chat/completions") {
                    expect(JSON.parse(body)).toMatchObject({
                        usage: { total_tokens: 0 },
                        choices: [
                            {
                                message: { role: "assistant" },
                                finish_reason: "stop",
                            },
                        ],
                    });
                }
            }
        }
        expect(otherRequests).toEqual([]);
        expect(
            (await env.TEXT_BUCKET.list()).objects.map((object) => object.key),
        ).toEqual(beforeCache);
        expect(events).toHaveLength(2);
        for (const event of events)
            expect(event).toMatchObject({
                responseStatus: 402,
                errorResponseCode: "INSUFFICIENT_BALANCE",
                isBilledUsage: false,
                totalPrice: 0,
            });
        const db = drizzle(env.DB);
        expect(await getUserBalance(db, caller.userId)).toMatchObject({
            tierBalance: 0,
            packBalance: 0,
        });
        expect(
            (await db.select().from(apikey).where(eq(apikey.id, caller.id)))[0]
                .pollenBalance,
        ).toBe(1);

        // A funded retry must pass access checks, not replay the previous notice.
        await db
            .update(user)
            .set({ packBalance: 10 })
            .where(eq(user.id, caller.userId));
        const fundedCtx = createExecutionContext();
        const funded = await worker.fetch(request(), bindings, fundedCtx);
        expect(await funded.text()).not.toContain(
            "?ref=agent_low_balance_topup",
        );
        expect(funded.status).not.toBe(402);
        await waitOnExecutionContext(fundedCtx);
    });

    it.each([
        { path: "/text/hello?json=true", body: undefined },
        { path: "/text", body: { jsonMode: true } },
        { path: "/text", body: { json: "TRUE", stream: true } },
        { path: "/v1/chat/completions", body: { jsonMode: true } },
        { path: "/v1/chat/completions", body: { json: "true" } },
        { path: "/text", body: { response_format: { type: "json_object" } } },
        {
            path: "/v1/chat/completions",
            body: { response_format: { type: "json_object" } },
        },
        {
            path: "/v1/chat/completions",
            body: {
                response_format: {
                    type: "json_schema",
                    json_schema: { name: "test", schema: { type: "object" } },
                },
                stream: true,
            },
        },
        {
            path: "/v1/responses",
            body: {
                text: {
                    format: {
                        type: "json_schema",
                        name: "test",
                        schema: { type: "object" },
                    },
                },
            },
        },
    ])("preserves 402 for JSON output on $path", async ({ path, body }) => {
        const caller = await createTestApiKey();
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({ data: [] }),
        );
        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request(`https://gen.pollinations.ai${path}`, {
                method: body ? "POST" : "GET",
                headers: {
                    Authorization: `Bearer ${caller.key}`,
                    "Content-Type": "application/json",
                },
                ...(body && {
                    body: JSON.stringify({
                        model,
                        ...(path === "/v1/responses"
                            ? { input: "hello" }
                            : {
                                  messages: [
                                      { role: "user", content: "hello" },
                                  ],
                              }),
                        ...body,
                    }),
                }),
            }),
            env,
            ctx,
        );
        const text = await response.text();
        expect(response.status, text).toBe(402);
        expect(text).toContain("INSUFFICIENT_BALANCE");
        await waitOnExecutionContext(ctx);
    });
});

it("keeps API key budget exhaustion as HTTP 402", async () => {
    const caller = await createTestApiKey({
        user: { packBalance: 10 },
        pollenBudget: 0,
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
        Response.json({ data: [] }),
    );
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request("https://gen.pollinations.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${caller.key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model,
                messages: [{ role: "user", content: "hello" }],
            }),
        }),
        env,
        ctx,
    );
    expect(response.status).toBe(402);
    expect(await response.text()).toContain("KEY_BUDGET_EXHAUSTED");
    await waitOnExecutionContext(ctx);
});
