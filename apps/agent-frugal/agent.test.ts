// Unit tests for the frugal router.
//
// Run with:  node --test agent.test.ts
// (Node 22.6+; Node 23+ strips types by default. No dependencies.)

import assert from "node:assert/strict";
import test from "node:test";

import {
    asResponses,
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

/* ------------------------------- asResponses ----------------------------- */

test("asResponses passes a Responses body through unchanged", () => {
    const out = asResponses({ input: "hi" });
    assert.equal(out.input, "hi");
});

test("asResponses converts chat messages into Responses input", () => {
    const out = asResponses({
        messages: [{ role: "user", content: "hello" }],
    });
    assert.equal(out.input, "hello");
    assert.equal(out.messages, undefined, "messages must not be forwarded");
});

test("asResponses keeps system messages as instructions", () => {
    const out = asResponses({
        input: [
            { role: "developer", content: "be terse" },
            { role: "user", content: "hi" },
        ],
    });
    assert.equal(out.input, "hi");
    assert.equal(out.instructions, "be terse");
});

test("asResponses merges body instructions and system turns", () => {
    const out = asResponses({
        instructions: "defaults",
        input: [
            { role: "system", content: "system rule" },
            { role: "user", content: "hi" },
        ],
    });
    assert.equal(out.instructions, "defaults\n\nsystem rule");
});

test("asResponses flattens multi-turn input to a role-prefixed string", () => {
    const out = asResponses({
        input: [
            { role: "user", content: "What is 2+2?" },
            { role: "assistant", content: "4" },
            { role: "user", content: "And 3+3?" },
        ],
    });
    assert.equal(out.input, "user: What is 2+2?\nassistant: 4\nuser: And 3+3?");
});

test("asResponses flattens an array input that carries no media", () => {
    const out = asResponses({
        input: [
            { role: "user", content: [{ type: "input_text", text: "hi" }] },
        ],
    });
    assert.equal(out.input, "hi");
});

test("asResponses keeps the structured array when the input has media", () => {
    const out = asResponses({
        input: [
            {
                role: "user",
                content: [{ type: "input_image" }, { text: "what is this?" }],
            },
        ],
    });
    assert.ok(Array.isArray(out.input), "media input must stay an array");
    assert.equal((out.input as unknown[]).length, 1);
});

test("asResponses converts a text prompt into input", () => {
    const out = asResponses({ prompt: "say hi" });
    assert.equal(out.input, "say hi");
    assert.equal(out.prompt, undefined);
});

test("asResponses maps max_tokens to max_output_tokens", () => {
    assert.equal(
        asResponses({ input: "x", max_tokens: 99 }).max_output_tokens,
        99,
    );
});

test("asResponses keeps an explicit max_output_tokens", () => {
    const out = asResponses({
        input: "x",
        max_output_tokens: 7,
        max_tokens: 99,
    });
    assert.equal(out.max_output_tokens, 7);
});

test("asResponses never leaves input undefined", () => {
    const out = asResponses({});
    assert.equal(out.input, "");
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
    const agent = priced("community/x/other", { community: true });
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

test("select falls back to the default model on an empty catalog", async () => {
    const pick = await select({ input: "hi" }, fakePollinations([]));
    assert.equal(pick.model, "openai/gpt-5.4-nano");
});

test("select degrades when the catalog call fails", async () => {
    const broken = async (): Promise<Response> => {
        throw new Error("network");
    };
    const pick = await select({ input: "hi" }, broken);
    assert.equal(pick.model, "openai/gpt-5.4-nano");
});
