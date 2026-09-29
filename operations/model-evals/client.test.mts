import assert from "node:assert/strict";
import { test } from "node:test";

import {
    extractFinishReason,
    extractReportedModel,
    extractText,
    extractUsage,
    fetchAccountBalance,
    requestChat,
} from "./src/client.mts";

const BASE = "https://gen.test";

function jsonResponse(
    payload: unknown,
    status = 200,
    headers: Record<string, string> = {},
): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json", ...headers },
    });
}

function chatPayload(content: string): unknown {
    return {
        model: "gpt-6-luna-2026-01-01",
        choices: [
            { message: { role: "assistant", content }, finish_reason: "stop" },
        ],
        usage: { prompt_tokens: 50, completion_tokens: 8, total_tokens: 58 },
    };
}

test("extractText reads the assistant message", () => {
    assert.equal(extractText(chatPayload("### Answer: 2")), "### Answer: 2");
    assert.equal(
        extractText({
            choices: [{ message: { content: [{ text: "a" }, { text: "b" }] } }],
        }),
        "ab",
    );
    assert.equal(
        extractText({ choices: [{ message: { tool_calls: [{ id: "1" }] } }] }),
        "",
    );
    assert.equal(extractText({ choices: [] }), "");
    assert.equal(extractText(null), "");
});

test("extractFinishReason and extractReportedModel tolerate missing fields", () => {
    assert.equal(extractFinishReason(chatPayload("x")), "stop");
    assert.equal(extractFinishReason({}), null);
    assert.equal(
        extractReportedModel(chatPayload("x")),
        "gpt-6-luna-2026-01-01",
    );
    // Some community endpoints return `"model": null`.
    assert.equal(extractReportedModel({ model: null }), null);
});

test("extractUsage prefers the body and falls back to the usage headers", () => {
    assert.deepEqual(extractUsage(chatPayload("x")), {
        prompt: 50,
        completion: 8,
    });
    const headers = new Headers({
        "x-usage-prompt-text-tokens": "120",
        "x-usage-completion-text-tokens": "40",
    });
    assert.deepEqual(extractUsage({}, headers), {
        prompt: 120,
        completion: 40,
    });
    assert.equal(extractUsage({}), null);
});

test("requestChat sends the model, prompt and seed and reports usage", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = async (_url: string, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return jsonResponse(chatPayload("### Answer: 2"), 200, {
            "x-model-used": "gpt-6-luna",
        });
    };
    const outcome = await requestChat({
        apiKey: "k",
        baseUrl: BASE,
        model: "openai/gpt-6-luna",
        prompt: "How many sisters?",
        seed: 7,
        maxTokens: 400,
        tokenLimitParameter: "max_tokens",
        fetchImpl,
    });
    assert.equal(outcome.status, "ok");
    assert.equal(outcome.text, "### Answer: 2");
    assert.deepEqual(outcome.usage, { prompt: 50, completion: 8 });
    assert.equal(outcome.effectiveModel, "gpt-6-luna");
    assert.equal(outcome.finishReason, "stop");
    assert.equal(outcome.attempts, 1);
    assert.equal(bodies.length, 1);
    assert.deepEqual(bodies[0].messages, [
        { role: "user", content: "How many sisters?" },
    ]);
    assert.equal(bodies[0].seed, 7);
    assert.equal(bodies[0].max_tokens, 400);
});

test("requestChat omits the token cap for models that do not advertise one", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = async (_url: string, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return jsonResponse(chatPayload("### Answer: 2"));
    };
    await requestChat({
        apiKey: "k",
        baseUrl: BASE,
        model: "community/Saauf/gpt-6-luna",
        prompt: "p",
        seed: 1,
        maxTokens: 400,
        tokenLimitParameter: null,
        fetchImpl,
    });
    assert.equal("max_tokens" in bodies[0], false);
    assert.equal("max_completion_tokens" in bodies[0], false);
});

test("requestChat retries a rate limit and honours retry-after", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const fetchImpl = async () => {
        calls += 1;
        if (calls === 1) {
            return new Response("slow down", {
                status: 429,
                headers: { "retry-after": "3" },
            });
        }
        return jsonResponse(chatPayload("### Answer: 2"));
    };
    const outcome = await requestChat({
        apiKey: "k",
        baseUrl: BASE,
        model: "m",
        prompt: "p",
        seed: 1,
        fetchImpl,
        sleep: async (ms) => {
            sleeps.push(ms);
        },
    });
    assert.equal(outcome.status, "ok");
    assert.equal(outcome.attempts, 2);
    assert.deepEqual(sleeps, [3000]);
});

test("requestChat reports a rate limit that never clears instead of skipping it", async () => {
    const fetchImpl = async () => new Response("slow down", { status: 429 });
    const outcome = await requestChat({
        apiKey: "k",
        baseUrl: BASE,
        model: "m",
        prompt: "p",
        seed: 1,
        maxAttempts: 2,
        fetchImpl,
        sleep: async () => {},
        random: () => 0,
    });
    assert.equal(outcome.status, "rate_limited");
    assert.equal(outcome.httpStatus, 429);
    assert.equal(outcome.attempts, 2);
});

test("requestChat retries a server error, then gives up with the status", async () => {
    let calls = 0;
    const fetchImpl = async () => {
        calls += 1;
        return new Response("boom", { status: 503 });
    };
    const outcome = await requestChat({
        apiKey: "k",
        baseUrl: BASE,
        model: "m",
        prompt: "p",
        seed: 1,
        maxAttempts: 2,
        fetchImpl,
        sleep: async () => {},
        random: () => 0,
    });
    assert.equal(outcome.status, "error");
    assert.equal(outcome.errorMessage, "HTTP 503");
    assert.equal(calls, 2);
});

test("requestChat does not retry a permanent client error", async () => {
    let calls = 0;
    const fetchImpl = async () => {
        calls += 1;
        return jsonResponse(
            {
                error: {
                    message:
                        "credit insufficient balance: balance=0 required=102",
                },
            },
            400,
        );
    };
    const outcome = await requestChat({
        apiKey: "k",
        baseUrl: BASE,
        model: "community/xiaotian1171/glm-5.3-flash",
        prompt: "p",
        seed: 1,
        fetchImpl,
    });
    assert.equal(outcome.status, "error");
    assert.equal(
        outcome.errorMessage,
        "credit insufficient balance: balance=0 required=102",
    );
    assert.equal(calls, 1);
});

test("requestChat marks an aborted request as a timeout", async () => {
    const fetchImpl = (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
                reject(
                    Object.assign(new Error("aborted"), { name: "AbortError" }),
                );
            });
        });
    const outcome = await requestChat({
        apiKey: "k",
        baseUrl: BASE,
        model: "m",
        prompt: "p",
        seed: 1,
        timeoutMs: 5,
        fetchImpl,
        sleep: async () => {},
        random: () => 0,
    });
    assert.equal(outcome.status, "timeout");
    assert.match(String(outcome.errorMessage), /timed out/);
    // A timeout is retried once, then recorded as a failure.
    assert.equal(outcome.attempts, 2);
});

test("requestChat reports a network error as an error", async () => {
    const fetchImpl = async () => {
        throw new TypeError("fetch failed");
    };
    const outcome = await requestChat({
        apiKey: "k",
        baseUrl: BASE,
        model: "m",
        prompt: "p",
        seed: 1,
        maxAttempts: 1,
        fetchImpl,
        sleep: async () => {},
        random: () => 0,
    });
    assert.equal(outcome.status, "error");
    assert.equal(outcome.errorMessage, "TypeError: fetch failed");
});

test("fetchAccountBalance reads the billing balance and survives failures", async () => {
    const ok = async () =>
        jsonResponse({
            balance: 86.81695288,
            accountBalance: { total: 86.81695288 },
        });
    assert.equal(
        await fetchAccountBalance({
            apiKey: "k",
            baseUrl: "https://enter.test",
            fetchImpl: ok,
        }),
        86.81695288,
    );

    const notFound = async () => new Response("nope", { status: 404 });
    assert.equal(
        await fetchAccountBalance({
            apiKey: "k",
            baseUrl: "https://enter.test",
            fetchImpl: notFound,
        }),
        null,
    );

    const weird = async () => jsonResponse({ balance: "many" });
    assert.equal(
        await fetchAccountBalance({
            apiKey: "k",
            baseUrl: "https://enter.test",
            fetchImpl: weird,
        }),
        null,
    );

    const broken = async () => {
        throw new Error("offline");
    };
    assert.equal(
        await fetchAccountBalance({
            apiKey: "k",
            baseUrl: "https://enter.test",
            fetchImpl: broken,
        }),
        null,
    );
});
