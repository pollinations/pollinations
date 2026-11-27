import assert from "node:assert/strict";
import test from "node:test";
import timers from "node:timers/promises";
import { budgetUsed, paidPost, reserve } from "./researcher.mjs";
import { readJsonWithRetries, retryDelay, transientHttp } from "./retries.mjs";

function setup(t, responses, { cap = 10, deadlineAt } = {}) {
    const report = { calls: [], maxPollen: cap, reservedPollen: 0, deadlineAt };
    const requests = [],
        waits = [],
        snapshots = [];
    t.mock.method(timers, "setTimeout", async (delay) => waits.push(delay));
    t.mock.method(globalThis, "fetch", async (url, options) => {
        requests.push({ url, ...options, body: JSON.parse(options.body) });
        assert.equal(snapshots.at(-1).calls.at(-1).status, "pending");
        assert.equal(snapshots.at(-1).calls.length, requests.length);
        const response = responses[requests.length - 1];
        if (response instanceof Error) throw response;
        return typeof response === "function" ? response(options) : response;
    });
    const save = async () => snapshots.push(structuredClone(report));
    const receipt = reserve(report, 1, "inference:test");
    return { report, requests, waits, snapshots, receipt, save };
}

const body = {
    model: "typesafe/jev-1.13",
    state: { evidence: "unchanged" },
    questions: { result: {} },
};
const invoke = (
    { report, receipt, save },
    payload = body,
    path = "/alpha/decisions",
) => paidPost(report, path, payload, receipt, "fixture-key", save);

test("paid transient retries persist separate reservations and unchanged native requests", async (t) => {
    const context = setup(t, [
        new Response("unavailable", { status: 503 }),
        new Response("rate limited", { status: 429 }),
        Response.json({ ok: true }),
    ]);
    const result = await invoke(context);
    assert.deepEqual(context.waits, [2000, 4000]);
    assert.equal(context.report.calls.length, 3);
    assert.equal(result.receipt, context.report.calls[2]);
    assert.deepEqual(
        context.report.calls.map(({ attempt, operationId, status }) => ({
            attempt,
            operationId,
            status,
        })),
        [1, 2, 3].map((attempt) => ({
            attempt,
            operationId: 0,
            status: "pending",
        })),
    );
    assert.equal(budgetUsed(context.report), 3);
    assert.ok(
        context.requests.every(
            (request) => JSON.stringify(request.body) === JSON.stringify(body),
        ),
    );
    assert.throws(
        () => reserve(context.report, 1, "inference:test"),
        /uncertain/,
    );
});

test("paid retries cannot overspend the cap or release a failed attempt", async (t) => {
    const context = setup(t, [new Response("unavailable", { status: 503 })], {
        cap: 1.5,
    });
    await assert.rejects(invoke(context), /budget exhausted/);
    assert.equal(context.requests.length, 1);
    assert.equal(context.report.calls.length, 1);
    assert.equal(context.report.calls[0].status, "pending");
    assert.equal(budgetUsed(context.report), 1);
});

for (const status of [400, 401, 403, 404])
    test(`paid HTTP ${status} has one attempt`, async (t) => {
        const context = setup(t, [new Response("client failure", { status })]);
        await assert.rejects(invoke(context), new RegExp(String(status)));
        assert.equal(context.requests.length, 1);
        assert.deepEqual(context.waits, []);
        assert.equal(context.report.calls[0].status, "failed");
        assert.equal(budgetUsed(context.report), 1);
    });

test("paid timeout and interrupted response body recover with reserved attempts", async (t) => {
    const interrupted = new Response(
        new ReadableStream({
            start(controller) {
                controller.error(new TypeError("terminated"));
            },
        }),
    );
    const context = setup(t, [
        new DOMException("timed out", "TimeoutError"),
        interrupted,
        Response.json({ ok: true }),
    ]);
    await invoke(context);
    assert.deepEqual(context.waits, [2000, 4000]);
    assert.equal(context.report.calls[1].http, 200);
    assert.equal(context.report.calls[1].transportFailure, "transient");
    assert.equal(budgetUsed(context.report), 3);
});

test("exhausted paid retries leave the operation blocking and fully reserved", async (t) => {
    const context = setup(
        t,
        [408, 429, 503].map(
            (status) => new Response("transient failure", { status }),
        ),
    );
    await assert.rejects(invoke(context), /503/);
    assert.equal(context.requests.length, 3);
    assert.deepEqual(context.waits, [2000, 4000]);
    assert.ok(context.report.calls.every(({ status }) => status === "pending"));
    assert.equal(budgetUsed(context.report), 3);
    assert.throws(
        () => reserve(context.report, 1, "inference:other"),
        /uncertain/,
    );
});

test("a retry cannot pass an unrelated pending operation", async (t) => {
    const context = setup(t, [
        () => {
            context.report.calls.push({
                kind: "inference:other",
                reserved: 1,
                status: "pending",
                operationId: 99,
            });
            return new Response("transient failure", { status: 503 });
        },
    ]);
    await assert.rejects(invoke(context), /uncertain/);
    assert.equal(context.requests.length, 1);
    assert.equal(context.report.calls.length, 2);
    assert.equal(budgetUsed(context.report), 2);
});

test("deadline and server-required long delays prevent a paid retry", async (t) => {
    const context = setup(t, [new Response("unavailable", { status: 503 })], {
        deadlineAt: new Date(Date.now() + 1000).toISOString(),
    });
    await assert.rejects(invoke(context), /deadline/);
    assert.deepEqual(context.waits, []);
    assert.equal(context.requests.length, 1);
});

test("paid retry stops rather than shortening a server-required delay", async (t) => {
    const context = setup(t, [
        new Response("rate limited", {
            status: 429,
            headers: { "Retry-After": "120" },
        }),
    ]);
    await assert.rejects(invoke(context), /30-second/);
    assert.equal(context.requests.length, 1);
    assert.deepEqual(context.waits, []);
    assert.equal(context.report.calls[0].status, "pending");
});

test("a paid response that arrives after the deadline remains pending", async (t) => {
    const context = setup(
        t,
        [
            async (options) => {
                await new Promise((resolve) => setTimeout(resolve, 30));
                assert.equal(options.signal.aborted, true);
                return Response.json({ ok: true });
            },
        ],
        { deadlineAt: new Date(Date.now() + 15).toISOString() },
    );
    await assert.rejects(invoke(context), /deadline/);
    assert.equal(context.requests.length, 1);
    assert.equal(context.report.calls[0].status, "pending");
    assert.deepEqual(context.waits, []);
});

test("each Sol attempt varies context seed while preserving messages and quoted bound", async (t) => {
    const messages = [
        { role: "system", content: "Reason only from evidence." },
        { role: "user", content: "Source fact unchanged." },
    ];
    const context = setup(t, [
        new Response("unavailable", { status: 503 }),
        Response.json({ ok: true }),
    ]);
    context.receipt.promptUpperBound =
        Buffer.byteLength(JSON.stringify({ messages })) + 4096 + 256;
    await invoke(
        context,
        { model: "openai/gpt-6.1-sol", messages },
        "/v1/chat/completions",
    );
    const seeds = context.report.calls.map(({ contextSeed }) => contextSeed);
    assert.equal(new Set(seeds).size, 2);
    for (const [index, request] of context.requests.entries()) {
        assert.match(
            request.body.messages[0].content,
            new RegExp(seeds[index]),
        );
        assert.deepEqual(request.body.messages[1], messages[1]);
        assert.equal(request.body.seed, undefined);
        assert.ok(
            Buffer.byteLength(
                JSON.stringify({ messages: request.body.messages }),
            ) <= context.report.calls[index].promptUpperBound,
        );
    }
    assert.equal(messages[0].content, "Reason only from evidence.");
});

test("free JSON reads retry transient failures and respect a bounded Retry-After", async (t) => {
    const waits = [];
    t.mock.method(timers, "setTimeout", async (delay) => waits.push(delay));
    let calls = 0;
    const result = await readJsonWithRetries(
        "https://gen.pollinations.ai/models",
        {},
        async () => {
            calls++;
            if (calls === 1) throw new TypeError("fetch failed");
            if (calls === 2)
                return new Response("retry", {
                    status: 429,
                    headers: { "Retry-After": "7" },
                });
            return Response.json({ rows: 1 });
        },
    );
    assert.deepEqual(result, { rows: 1 });
    assert.equal(calls, 3);
    assert.deepEqual(waits, [2000, 7000]);
});

test("free JSON reads do not retry malformed JSON, auth or long server delays", async (t) => {
    const waits = [];
    t.mock.method(timers, "setTimeout", async (delay) => waits.push(delay));
    for (const response of [
        new Response("invalid JSON"),
        new Response("denied", { status: 401 }),
        new Response("retry", {
            status: 429,
            headers: { "Retry-After": "120" },
        }),
    ]) {
        let calls = 0;
        await assert.rejects(
            readJsonWithRetries(
                "https://gen.pollinations.ai/models",
                {},
                async () => {
                    calls++;
                    return response;
                },
            ),
        );
        assert.equal(calls, 1);
    }
    assert.deepEqual(waits, []);
});

test("retry delays handle date, malformed and negative values without shortened server waits", () => {
    assert.equal(retryDelay(new Headers(), 1), 2000);
    assert.equal(
        retryDelay(new Headers({ "Retry-After": "nonsense" }), 2),
        4000,
    );
    assert.equal(retryDelay(new Headers({ "Retry-After": "-1" }), 1), 2000);
    const delay = retryDelay(
        new Headers({
            "Retry-After": new Date(Date.now() + 10000).toUTCString(),
        }),
        1,
    );
    assert.ok(delay >= 9000 && delay <= 10000);
    assert.throws(
        () =>
            retryDelay(
                new Headers({
                    "Retry-After": new Date(Date.now() + 120000).toUTCString(),
                }),
                1,
            ),
        /30-second/,
    );
});

test("transient HTTP classification retains the complete 5xx boundary", () => {
    for (const status of [408, 429, 500, 502, 503, 599])
        assert.equal(transientHttp(status), true, status);
    for (const status of [200, 400, 401, 403, 499, 600])
        assert.equal(transientHttp(status), false, status);
});
