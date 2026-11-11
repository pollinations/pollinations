// Unit tests for the frugal router.
//
// Run with:  node --test agent.test.ts
// (Node 22.6+; Node 23+ strips types by default. No dependencies.)

import assert from "node:assert/strict";
import test from "node:test";

import agent, {
    countImages,
    estimatedCost,
    flatText,
    healthPenalty,
    inputTokensFor,
    outputTokensFor,
    select,
    tierForBody,
} from "./agent.ts";

type Model = {
    id: string;
    category: string;
    community?: boolean;
    agent?: boolean;
    context_length?: number;
    input_modalities?: string[];
    supported_endpoints?: string[];
    capabilities?: string[];
    pricing?: { promptTextTokens?: string; completionTextTokens?: string };
};

type Row = {
    model: string;
    is_rollup: number;
    event_type: string;
    total_requests: number;
    errors_4xx?: number;
    errors_5xx?: number;
    status_2xx?: number;
    served?: number;
    fallback_rescues?: number;
    retried_503s?: number;
};

function fakePollinations(models: Model[], status: Row[] = []) {
    return async (path: string): Promise<Response> => {
        if (path.startsWith("/v1/models"))
            return Response.json({ data: models });
        if (path.startsWith("/models/status"))
            return Response.json({ data: status });
        return new Response("not found", { status: 404 });
    };
}

const priced = (id: string, over: Partial<Model> = {}): Model => ({
    id,
    category: "text",
    supported_endpoints: ["/v1/responses"],
    input_modalities: ["text"],
    pricing: {
        promptTextTokens: "0.0000001",
        completionTextTokens: "0.0000001",
    },
    ...over,
});

const row = (model: string, over: Partial<Row> = {}): Row => ({
    model,
    is_rollup: 1,
    event_type: "generate.text",
    total_requests: 100,
    errors_5xx: 0,
    status_2xx: 100,
    served: 100,
    fallback_rescues: 0,
    retried_503s: 0,
    ...over,
});

/* ------------------------------- text helpers ---------------------------- */

test("flatText reads strings, parts and nested content", () => {
    assert.equal(flatText("hello"), "hello");
    assert.equal(flatText([{ text: "a" }, { input_text: "b" }]), "a b");
    assert.equal(flatText([{ content: [{ text: "deep" }] }]), "deep");
});

test("countImages sees input_image items and nested content", () => {
    assert.equal(countImages("plain"), 0);
    assert.equal(countImages([{ type: "input_image" }]), 1);
    assert.equal(
        countImages([{ content: [{ type: "input_image" }, { text: "t" }] }]),
        1,
    );
});

/* ----------------------------- classification ---------------------------- */

test("tierForBody: short plain prompt is FAST", () => {
    assert.equal(tierForBody({ input: "What is 2+2?" }).tier, "FAST");
});

test("tierForBody: reasoning keywords are DEEP", () => {
    assert.equal(
        tierForBody({ input: "Prove the Pythagorean theorem" }).tier,
        "DEEP",
    );
});

test("tierForBody: long input is DEEP", () => {
    const out = tierForBody({ input: "word ".repeat(400) });
    assert.equal(out.tier, "DEEP");
    assert.equal(out.is_long, true);
});

test("tierForBody: code fences are BALANCED", () => {
    assert.equal(
        tierForBody({ input: "```js\nconst x = 1;\n```" }).tier,
        "BALANCED",
    );
});

test("tierForBody: tools push to BALANCED", () => {
    assert.equal(
        tierForBody({ input: "hi", tools: [{ type: "function" }] }).tier,
        "BALANCED",
    );
});

test("tierForBody: images push to BALANCED", () => {
    assert.equal(
        tierForBody({ input: [{ type: "input_image" }] }).tier,
        "BALANCED",
    );
});

test("tierForBody: a continuation is BALANCED", () => {
    assert.equal(
        tierForBody({ input: "hi", previous_response_id: "resp_1" }).tier,
        "BALANCED",
    );
});

test("tierForBody: a large max_output_tokens is DEEP", () => {
    assert.equal(
        tierForBody({ input: "hi", max_output_tokens: 2000 }).tier,
        "DEEP",
    );
});

/* ------------------------------ cost maths ------------------------------- */

test("inputTokensFor measures characters over four, floor one", () => {
    assert.equal(inputTokensFor({ input: "" }), 1);
    assert.equal(inputTokensFor({ input: "abcd" }), 1);
    assert.equal(inputTokensFor({ input: "a".repeat(40) }), 10);
});

test("outputTokensFor maps tiers to estimates", () => {
    assert.equal(outputTokensFor("FAST"), 128);
    assert.equal(outputTokensFor("BALANCED"), 512);
    assert.equal(outputTokensFor("DEEP"), 2048);
});

test("estimatedCost prices input and output separately", () => {
    const model = priced("a/b") as Model;
    const cost = estimatedCost(model as never, 100, 50);
    assert.equal(cost, 100 * 1e-7 + 50 * 1e-7);
});

/* ------------------------------- health ---------------------------------- */

test("healthPenalty: unknown models carry a small penalty", () => {
    assert.equal(healthPenalty(undefined), 1.15);
    assert.equal(healthPenalty(row("m", { total_requests: 3 })), 1.15);
});

test("healthPenalty escalates with the 5xx rate", () => {
    assert.equal(
        healthPenalty(row("m", { errors_5xx: 0, status_2xx: 100 })),
        1,
    );
    assert.equal(
        healthPenalty(row("m", { errors_5xx: 3, status_2xx: 97 })),
        1.35,
    );
    assert.equal(
        healthPenalty(row("m", { errors_5xx: 6, status_2xx: 94 })),
        2.5,
    );
    assert.equal(
        healthPenalty(row("m", { errors_5xx: 12, status_2xx: 88 })),
        5,
    );
});

/* ------------------------------ selection -------------------------------- */

test("select picks the cheapest eligible model", async () => {
    const cheap = priced("a/cheap");
    const pricey = priced("b/pricey", {
        pricing: {
            promptTextTokens: "0.00001",
            completionTextTokens: "0.00001",
        },
    });
    const pick = await select(
        { input: "hi" },
        fakePollinations([pricey, cheap]),
    );
    assert.equal(pick.model, "a/cheap");
    assert.equal(pick.tier, "FAST");
});

test("select never routes to a community agent", async () => {
    const agent = priced("community/x/other", { community: true, agent: true });
    const real = priced("a/real");
    const pick = await select({ input: "hi" }, fakePollinations([agent, real]));
    assert.equal(pick.model, "a/real");
});

test("select never routes to itself", async () => {
    const self = priced("x/frugal");
    const real = priced("a/real");
    const pick = await select({ input: "hi" }, fakePollinations([self, real]));
    assert.equal(pick.model, "a/real");
});

test("select skips unpriced models", async () => {
    const free = priced("a/free", { pricing: {} });
    const real = priced("b/real");
    const pick = await select({ input: "hi" }, fakePollinations([free, real]));
    assert.equal(pick.model, "b/real");
});

test("select skips models without a responses endpoint", async () => {
    const legacy = priced("a/legacy", {
        supported_endpoints: ["/v1/chat/completions"],
    });
    const real = priced("b/real");
    const pick = await select(
        { input: "hi" },
        fakePollinations([legacy, real]),
    );
    assert.equal(pick.model, "b/real");
});

test("select rejects partially missing prices", async () => {
    const unknown = priced("unknown", {
        pricing: { completionTextTokens: "0.000001" },
    });
    assert.equal(
        (
            await select(
                { input: "hi" },
                fakePollinations([unknown, priced("known")]),
            )
        ).model,
        "known",
    );
});

test("select honours an image request", async () => {
    const textOnly = priced("a/text");
    const vision = priced("b/vision", { input_modalities: ["text", "image"] });
    const pick = await select(
        { input: [{ type: "input_image" }] },
        fakePollinations([textOnly, vision]),
    );
    assert.equal(pick.model, "b/vision");
});

test("select honours a tool request", async () => {
    const noTools = priced("a/plain");
    const tools = priced("b/tools", { capabilities: ["tool_calling"] });
    const pick = await select(
        { input: "hi", tools: [{ type: "function" }] },
        fakePollinations([noTools, tools]),
    );
    assert.equal(pick.model, "b/tools");
});

test("select skips a model that is failing 5xx", async () => {
    const sick = priced("a/sick");
    const healthy = priced("b/healthy", {
        pricing: {
            promptTextTokens: "0.00001",
            completionTextTokens: "0.00001",
        },
    });
    const pick = await select(
        { input: "hi" },
        fakePollinations(
            [sick, healthy],
            [row("a/sick", { errors_5xx: 30, status_2xx: 70 })],
        ),
    );
    assert.equal(pick.model, "b/healthy");
});

test("select fails rather than bypassing eligibility on an empty catalog", async () => {
    await assert.rejects(
        select({ input: "hi" }, fakePollinations([])),
        /No compatible/,
    );
});

test("select fails when the catalog is unavailable", async () => {
    await assert.rejects(
        select({ input: "hi" }, async () => {
            throw new Error("network");
        }),
        /No compatible/,
    );
});

test("a deep request with one eligible model stays within the eligible pool", async () => {
    const model = priced("a/only");
    assert.equal(
        (
            await select(
                { input: "Prove this theorem" },
                fakePollinations([model]),
            )
        ).model,
        model.id,
    );
});

test("request instructions count toward context fit", async () => {
    await assert.rejects(
        select(
            {
                input: "hi",
                instructions: "x".repeat(400),
                max_output_tokens: 20,
            },
            fakePollinations([priced("a/tiny", { context_length: 100 })]),
        ),
        /No compatible/,
    );
});

test("agent preserves roles, function calls, results and streaming bytes", async () => {
    const body = {
        instructions: "Keep roles",
        input: [
            { role: "developer", content: "Be concise" },
            {
                type: "function_call",
                call_id: "call1",
                name: "weather",
                arguments: "{}",
            },
            { type: "function_call_output", call_id: "call1", output: "sunny" },
        ],
        tools: [
            {
                type: "function",
                name: "weather",
                parameters: { type: "object" },
            },
        ],
        stream: true,
        max_output_tokens: 100,
    };
    let forwarded: Record<string, unknown> = {};
    const response = await agent({
        request: new Request("https://example.com", {
            method: "POST",
            body: JSON.stringify(body),
        }),
        pollinations: async (path, init) => {
            if (!init?.body)
                return fakePollinations([
                    priced("a/tools", { capabilities: ["tool_calling"] }),
                ])(path);
            forwarded = JSON.parse(init.body as string);
            return new Response("data: unchanged\\n\\n", {
                headers: { "content-type": "text/event-stream" },
            });
        },
    });
    assert.deepEqual(forwarded, { ...body, model: "a/tools" });
    assert.equal(await response.text(), "data: unchanged\\n\\n");
});
