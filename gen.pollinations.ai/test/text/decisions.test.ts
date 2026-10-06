import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import {
    test as baseTest,
    createTestApiKey,
} from "@shared/test/fixtures/index.ts";
import {
    createFetchMock,
    teardownFetchMock,
} from "@shared/test/mocks/fetch.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, beforeEach, expect } from "vitest";
import worker from "../../src/index.ts";
import { TEXT_BALANCE_NOTICE_ENABLED } from "../../src/middleware/text-balance-notice.ts";
import { withInlineGenerationCoordinator } from "../helpers/inline-generation-coordinator.ts";

const DECISIONS_HOST = "openrouter.ai";

const answers = {
    overdue: { type: "noul", noul: 0.96 },
    action: {
        type: "choice",
        choice: "remind",
        probabilities: { wait: 0.01, remind: 0.79, escalate: 0.2 },
        confidence: 0.69,
    },
};

const questions = {
    overdue: { type: "noul", instructions: "Is this invoice overdue?" },
    action: {
        type: "choice",
        instructions: "What is the right next step?",
        criteria: {
            wait: "Do nothing",
            remind: "Send a reminder",
            escalate: null,
        },
    },
};

type UpstreamState = {
    requests: Record<string, unknown>[];
    response?: Response;
};

function createDecisionsMock() {
    const state: UpstreamState = { requests: [] };
    return {
        state,
        reset: () => {
            state.requests = [];
            state.response = undefined;
        },
        handlerMap: {
            "ai-gateway.vercel.sh": async (request: Request) => {
                state.requests.push({
                    pathname: new URL(request.url).pathname,
                    authorization: request.headers.get("authorization"),
                    body: await request.json(),
                });
                return Response.json({
                    model: "liquid/d1",
                    answers,
                    usage: { input_tokens: 452, output_tokens: 0 },
                });
            },
            [DECISIONS_HOST]: async (request: Request) => {
                state.requests.push({
                    pathname: new URL(request.url).pathname,
                    authorization: request.headers.get("authorization"),
                    body: await request.json(),
                });
                if (state.response) return state.response.clone();
                return Response.json({
                    model: "typesafe/jev-1.13-20260917",
                    answers,
                    usage: {
                        input_tokens: 452,
                        output_tokens: 73,
                        cost: 0.000019,
                    },
                    id: "gen-dec-upstream",
                    provider: "TypeSafe",
                });
            },
        },
    };
}

const test = baseTest.extend<{
    mocks: {
        tinybird: ReturnType<typeof createMockTinybird>;
        decisions: ReturnType<typeof createDecisionsMock>;
    };
}>({
    // biome-ignore lint/correctness/noEmptyPattern: vitest fixture pattern requires object destructuring
    mocks: async ({}, use) => {
        env.OPENROUTER_API_KEY = "openrouter-test-key";
        env.AI_GATEWAY_API_KEY = "vercel-test-key";
        const tinybird = createMockTinybird();
        const decisions = createDecisionsMock();
        const fetchMock = createFetchMock({ tinybird, decisions });
        await fetchMock.enable("tinybird", "decisions");
        await use({ tinybird, decisions });
    },
});

beforeEach(async () => {
    await env.KV.put(
        "model-stats-v3",
        JSON.stringify({
            value: {
                data: [{ model: "typesafe/jev-1.13", avg_cost_usd: 0.001 }],
            },
            ttl: 3600,
        }),
    );
});

afterEach(async () => {
    await teardownFetchMock();
});

async function fetchWorker(path: string, init: RequestInit) {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://gen.pollinations.ai${path}`, init),
        withInlineGenerationCoordinator(env),
        ctx,
    );
    return { response, wait: () => waitOnExecutionContext(ctx) };
}

function post(path: string, key: string, body: unknown) {
    return fetchWorker(path, {
        method: "POST",
        headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
        },
        body: JSON.stringify(body),
    });
}

// A Quest-Pollen-only key: jev is deliberately not paid-only, so the free tier
// must reach the decisions route.
test("answers a decision, forwards the native body, and bills input tokens", async ({
    apiKey,
    mocks,
}) => {
    const { response, wait } = await post("/alpha/decisions", apiKey, {
        model: "typesafe/jev-1.13",
        state: "Invoice issued 2026-08-01, net-30. Today is 2026-09-19.",
        questions,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
        id: expect.stringMatching(/^dec-/),
        // Our canonical id, not the provider's dated build.
        model: "typesafe/jev-1.13",
        provider: "TypeSafe",
        answers,
        usage: { input_tokens: 452, output_tokens: 73 },
    });
    // The upstream's own cost must not reach the caller.
    expect(body.usage).not.toHaveProperty("cost");

    expect(mocks.decisions.state.requests).toHaveLength(1);
    expect(mocks.decisions.state.requests[0]).toMatchObject({
        pathname: "/api/alpha/decisions",
        authorization: "Bearer openrouter-test-key",
        // Forwarded untouched, under the upstream's pinned model id.
        body: {
            model: "typesafe/jev-1.13",
            state: "Invoice issued 2026-08-01, net-30. Today is 2026-09-19.",
            questions,
        },
    });

    await wait();
    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        eventType: "generate.text",
        responseStatus: 200,
        modelRequested: "typesafe/jev-1.13",
        tokenCountPromptText: 452,
        tokenCountCompletionText: 73,
        isBilledUsage: true,
    });
});

test("routes Kev 4B under its own id and publisher", async ({ mocks }) => {
    const { key, userId } = await createTestApiKey({
        user: { tierBalance: 1, packBalance: 0 },
    });
    const { response, wait } = await post("/alpha/decisions", key, {
        model: "jaredpalmer/kev-4b",
        state: "Disk at 93%.",
        questions: { act: { type: "noul", instructions: "Act now?" } },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
        model: "jaredpalmer/kev-4b",
        provider: "Jared Palmer",
    });
    expect(mocks.decisions.state.requests[0]).toMatchObject({
        pathname: "/api/alpha/decisions",
        body: { model: "jaredpalmer/kev-4b" },
    });
    await wait();
    expect(mocks.decisions.state.requests).toHaveLength(1);
    expect(mocks.tinybird.state.events).toHaveLength(1);
    const event = mocks.tinybird.state.events[0];
    expect(event).toMatchObject({
        eventType: "generate.text",
        responseStatus: 200,
        modelRequested: "jaredpalmer/kev-4b",
        modelProviderUsed: "openrouter",
        tokenCountPromptText: 452,
        tokenCountCompletionText: 73,
        isBilledUsage: true,
    });
    expect(event.totalCost).toBeCloseTo((452 * 0.042 * 1.055) / 1_000_000, 12);
    expect(event.totalPrice).toBe(0.00002003);
    expect(await getUserBalance(drizzle(env.DB), userId)).toEqual({
        tierBalance: 0.99997997,
        packBalance: 0,
    });
});

test("routes Span-01 Lite under its own id and bills nothing", async ({
    mocks,
}) => {
    const { key, userId } = await createTestApiKey({
        user: { tierBalance: 1, packBalance: 0 },
    });
    const { response, wait } = await post("/alpha/decisions", key, {
        model: "respan/span-01-lite",
        state: "Disk at 93%.",
        questions: { act: { type: "noul", instructions: "Act now?" } },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
        model: "respan/span-01-lite",
        provider: "Respan",
    });
    expect(mocks.decisions.state.requests[0]).toMatchObject({
        pathname: "/api/alpha/decisions",
        body: { model: "respan/span-01-lite" },
    });
    await wait();
    expect(mocks.tinybird.state.events).toHaveLength(1);
    expect(mocks.tinybird.state.events[0]).toMatchObject({
        eventType: "generate.text",
        responseStatus: 200,
        modelRequested: "respan/span-01-lite",
        modelProviderUsed: "openrouter",
        totalCost: 0,
        totalPrice: 0,
    });
    expect(await getUserBalance(drizzle(env.DB), userId)).toEqual({
        tierBalance: 1,
        packBalance: 0,
    });
});

test("routes Liquid D1 under its own id and bills input tokens", async ({
    mocks,
}) => {
    const { key, userId } = await createTestApiKey({
        user: { tierBalance: 0, packBalance: 1 },
    });
    const { response, wait } = await post("/alpha/decisions", key, {
        model: "liquid/d1",
        state: "Disk at 93%.",
        questions: { act: { type: "noul", instructions: "Act now?" } },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
        model: "liquid/d1",
        provider: "Liquid AI",
    });
    expect(mocks.decisions.state.requests[0]).toMatchObject({
        pathname: "/api/alpha/decisions",
        body: { model: "liquid/d1" },
    });
    await wait();
    expect(mocks.tinybird.state.events).toHaveLength(1);
    const event = mocks.tinybird.state.events[0];
    expect(event).toMatchObject({
        eventType: "generate.text",
        responseStatus: 200,
        modelRequested: "liquid/d1",
        modelProviderUsed: "openrouter",
        tokenCountPromptText: 452,
        tokenCountCompletionText: 73,
        isBilledUsage: true,
    });
    expect(event.totalCost).toBeCloseTo((452 * 0.04 * 1.055) / 1_000_000, 12);
    const { tierBalance, packBalance } = await getUserBalance(
        drizzle(env.DB),
        userId,
    );
    expect(tierBalance).toBe(0);
    expect(packBalance).toBeCloseTo(1 - (452 * 0.04 * 1.055) / 1_000_000, 7);
});

test("falls back native D1 decisions and records Vercel cost with the public quote", async ({
    mocks,
}) => {
    const { key, userId } = await createTestApiKey({
        user: { tierBalance: 0, packBalance: 1 },
        allowedModels: ["liquid/d1"],
    });
    mocks.decisions.state.response = Response.json(
        { error: { message: "Upstream unavailable" } },
        { status: 503 },
    );
    const { response, wait } = await post("/alpha/decisions", key, {
        model: "liquid/d1",
        state: "Fictional weather: heavy rain tomorrow.",
        questions,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-model-used")).toBe("liquid/d1:vercel");
    expect(response.headers.get("x-fallback-target")).toBe("config.targets[1]");
    await expect(response.json()).resolves.toMatchObject({
        model: "liquid/d1",
        provider: "Liquid AI",
        answers,
        usage: { input_tokens: 452, output_tokens: 0 },
    });
    await wait();
    expect(mocks.decisions.state.requests).toHaveLength(2);
    expect(mocks.decisions.state.requests[1]).toMatchObject({
        pathname: "/typesafe/v1/systemone",
        authorization: "Bearer vercel-test-key",
        body: { model: "liquid/d1" },
    });
    const events = mocks.tinybird.state.events;
    expect(events.filter((event) => event.isBilledUsage)).toHaveLength(1);
    const billed = events.find((event) => event.isBilledUsage);
    expect(billed).toMatchObject({
        modelRequested: "liquid/d1",
        modelUsed: "liquid/d1:vercel",
        modelProviderUsed: "vercel",
        isFinal: true,
    });
    expect(billed?.totalCost).toBeCloseTo((452 * 0.04) / 1_000_000, 12);
    expect(billed?.totalPrice).toBeCloseTo((452 * 0.04 * 1.055) / 1_000_000, 8);
    expect(events).toContainEqual(
        expect.objectContaining({
            modelUsed: "liquid/d1",
            modelProviderUsed: "openrouter",
            isBilledUsage: false,
            isFinal: false,
        }),
    );
    const balance = await getUserBalance(drizzle(env.DB), userId);
    expect(balance.tierBalance).toBe(0);
    expect(balance.packBalance).toBeCloseTo(1 - (billed?.totalPrice ?? 0), 8);
});

test("rejects Quest-only Liquid D1 calls before reaching the provider", async ({
    apiKey,
    mocks,
}) => {
    const payload = {
        state: "Fictional weather: heavy rain tomorrow.",
        questions: { rain: { type: "noul", instructions: "Will it rain?" } },
    };
    for (const [path, body] of [
        ["/alpha/decisions", { model: "liquid/d1", ...payload }],
        [
            "/v1/chat/completions",
            {
                model: "liquid/d1",
                messages: [{ role: "user", content: JSON.stringify(payload) }],
            },
        ],
    ] as const) {
        const { response, wait } = await post(path, apiKey, body);
        const showsNotice =
            path === "/v1/chat/completions" && TEXT_BALANCE_NOTICE_ENABLED;
        expect(response.status).toBe(showsNotice ? 200 : 402);
        if (showsNotice) {
            const notice = (await response.json()) as {
                choices: { message: { content: string } }[];
                usage: { total_tokens: number };
            };
            expect(notice.choices[0].message.content).toContain(
                "This model needs paid Pollen",
            );
            expect(notice.usage.total_tokens).toBe(0);
            expect(response.headers.get("cache-control")).toBe(
                "private, no-store",
            );
        }
        await wait();
    }
    expect(mocks.decisions.state.requests).toHaveLength(0);
});

test("defaults to jev and accepts the alias", async ({ apiKey, mocks }) => {
    const withoutModel = await post("/alpha/decisions", apiKey, {
        state: "Disk at 91%.",
        questions: { act: { type: "noul", instructions: "Act now?" } },
    });
    expect(withoutModel.response.status).toBe(200);
    await expect(withoutModel.response.json()).resolves.toMatchObject({
        model: "typesafe/jev-1.13",
    });
    await withoutModel.wait();

    const viaAlias = await post("/alpha/decisions", apiKey, {
        model: "jev",
        state: "Disk at 92%.",
        questions: { act: { type: "noul", instructions: "Act now?" } },
    });
    expect(viaAlias.response.status).toBe(200);
    await expect(viaAlias.response.json()).resolves.toMatchObject({
        model: "typesafe/jev-1.13",
    });
    await viaAlias.wait();

    expect(mocks.decisions.state.requests).toHaveLength(2);
});

test("a text key reaches Jev by its canonical ID and both aliases", async ({
    mocks,
}) => {
    const { key } = await createTestApiKey({
        allowedModels: ["text"],
        user: { tierBalance: 100 },
    });

    for (const model of ["typesafe/jev-1.13", "typesafe/jev", "jev"]) {
        const { response, wait } = await post("/alpha/decisions", key, {
            model,
            state: `Request through ${model}`,
            questions,
        });
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            model: "typesafe/jev-1.13",
        });
        await wait();
    }
    expect(mocks.decisions.state.requests).toHaveLength(3);
});

test("rejects a malformed question before calling upstream", async ({
    apiKey,
    mocks,
}) => {
    const { response, wait } = await post("/alpha/decisions", apiKey, {
        state: "Anything",
        // `instructions` is required on every question type.
        questions: { late: { type: "noul" } },
    });
    expect(response.status).toBe(400);
    await wait();
    expect(mocks.decisions.state.requests).toHaveLength(0);
});

test("rejects an empty questions map", async ({ apiKey }) => {
    const { response, wait } = await post("/alpha/decisions", apiKey, {
        state: "Anything",
        questions: {},
    });
    expect(response.status).toBe(400);
    await wait();
});

test("a chat model cannot be used on the decisions route", async ({
    apiKey,
    mocks,
}) => {
    const { response, wait } = await post("/alpha/decisions", apiKey, {
        model: "openai/gpt-5-nano",
        state: "Anything",
        questions: { late: { type: "noul", instructions: "Late?" } },
    });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("/alpha/decisions");
    await wait();
    expect(mocks.decisions.state.requests).toHaveLength(0);
});

// The registry now pins jev to two endpoints, so the chat adapter that shipped
// first must keep working.
test("jev still answers on chat completions", async ({ apiKey, mocks }) => {
    const { response, wait } = await post("/v1/chat/completions", apiKey, {
        model: "jev",
        messages: [
            {
                role: "user",
                content: JSON.stringify({ state: "Disk at 91%.", questions }),
            },
        ],
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
        choices: { message: { content: string } }[];
    };
    expect(JSON.parse(body.choices[0].message.content)).toEqual(answers);
    await wait();
    expect(mocks.decisions.state.requests).toHaveLength(1);
});

for (const stream of [false, true]) {
    test(`Kev answers on chat completions with stream=${stream}`, async ({
        apiKey,
        mocks,
    }) => {
        mocks.decisions.state.response = Response.json({
            model: "jaredpalmer/kev-4b-20260924",
            answers,
            usage: { input_tokens: 452, output_tokens: 73 },
        });
        const { response, wait } = await post("/v1/chat/completions", apiKey, {
            model: "jaredpalmer/kev-4b",
            stream,
            messages: [
                {
                    role: "user",
                    content: JSON.stringify({
                        state: `Disk at ${stream ? 94 : 93}%`,
                        questions,
                    }),
                },
            ],
        });
        expect(response.status).toBe(200);
        if (stream) {
            const events = (await response.text())
                .split("\n\n")
                .filter(Boolean)
                .map((event) => event.replace(/^data: /, ""));
            expect(events.at(-1)).toBe("[DONE]");
            const chunks = events
                .slice(0, -1)
                .map((event) => JSON.parse(event));
            expect(JSON.parse(chunks[0].choices[0].delta.content)).toEqual(
                answers,
            );
            expect(chunks.at(-1)?.usage).toMatchObject({
                prompt_tokens: 452,
                completion_tokens: 73,
            });
        } else {
            const body = (await response.json()) as {
                choices: { message: { content: string } }[];
            };
            expect(JSON.parse(body.choices[0].message.content)).toEqual(
                answers,
            );
        }
        await wait();
        expect(mocks.decisions.state.requests).toHaveLength(1);
        expect(mocks.decisions.state.requests[0]).toMatchObject({
            body: { model: "jaredpalmer/kev-4b" },
        });
        expect(mocks.tinybird.state.events).toHaveLength(1);
        expect(mocks.tinybird.state.events[0]).toMatchObject({
            modelRequested: "jaredpalmer/kev-4b",
            isBilledUsage: true,
        });
    });
}

test("jev is not offered on the plain text route", async ({
    apiKey,
    mocks,
}) => {
    const { response, wait } = await post("/text", apiKey, {
        model: "jev",
        messages: [{ role: "user", content: "{}" }],
    });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("/alpha/decisions");
    await wait();
    expect(mocks.decisions.state.requests).toHaveLength(0);
});

for (const { code, tierBalance, pollenBudget } of [
    { code: "INSUFFICIENT_BALANCE", tierBalance: 0, pollenBudget: 1 },
    { code: "KEY_BUDGET_EXHAUSTED", tierBalance: 100, pollenBudget: 0 },
]) {
    test(`returns JSON HTTP 402 for ${code}`, async ({ mocks }) => {
        const { key } = await createTestApiKey({
            user: { tierBalance, packBalance: 0 },
            pollenBudget,
        });
        const { response, wait } = await post("/alpha/decisions", key, {
            state: "Balance failure",
            questions,
        });
        expect(response.status).toBe(402);
        expect(response.headers.get("content-type")).toContain(
            "application/json",
        );
        await expect(response.json()).resolves.toMatchObject({
            error: { code },
        });
        await wait();
        expect(mocks.decisions.state.requests).toHaveLength(0);
        expect(
            mocks.tinybird.state.events.some((event) => event.isBilledUsage),
        ).toBe(false);
    });
}

test("returns an upstream HTTP 502 when Jev omits usage", async ({
    apiKey,
    mocks,
}) => {
    mocks.decisions.state.response = Response.json({ answers });
    const { response, wait } = await post("/alpha/decisions", apiKey, {
        state: "Missing provider usage",
        questions,
    });
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
        error: { code: "BAD_GATEWAY", details: { name: "UpstreamError" } },
    });
    await wait();
    expect(mocks.decisions.state.requests).toHaveLength(1);
    expect(
        mocks.tinybird.state.events.some((event) => event.isBilledUsage),
    ).toBe(false);
});
