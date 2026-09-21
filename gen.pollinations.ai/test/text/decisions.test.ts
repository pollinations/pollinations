import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { apikey } from "@shared/db/better-auth.ts";
import {
    test as baseTest,
    createTestApiKey,
} from "@shared/test/fixtures/index.ts";
import {
    createFetchMock,
    teardownFetchMock,
} from "@shared/test/mocks/fetch.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, beforeEach, expect } from "vitest";
import worker from "../../src/index.ts";
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

test("existing Jev key permissions allow the canonical model and both aliases", async ({
    mocks,
}) => {
    const { key, id } = await createTestApiKey({
        allowedModels: ["typesafe/jev-1.13"],
        user: { tierBalance: 100 },
    });
    await drizzle(env.DB)
        .update(apikey)
        .set({ permissions: JSON.stringify({ models: ["typesafe/jev"] }) })
        .where(eq(apikey.id, id));

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
