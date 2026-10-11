import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { budgetUsed, inferenceCost, main, reserve } from "./researcher.mjs";

const pricing = {
    promptTextTokens: 0.002,
    completionTextTokens: 0.01,
    promptCacheWriteTokens: 0.003,
    promptCachedTokens: 0.0002,
};
const usage = {
    prompt_tokens: 100,
    completion_tokens: 5,
    total_tokens: 105,
    prompt_tokens_details: { cached_tokens: 20, cache_write_tokens: 30 },
};

test("billed snapshots cannot absorb reservations made after their call boundary", () => {
    const report = {
        maxPollen: 10,
        reservedPollen: 4,
        billing: { pollen: 8, callCount: 1 },
        calls: [
            {
                kind: "inference:test",
                status: "received",
                reserved: 4,
                accountedPollen: 4,
            },
        ],
    };
    const call = reserve(report, 2, "inference:test");
    assert.equal(budgetUsed(report), 10);
    call.status = "received";
    call.accountedPollen = 2;
    assert.throws(
        () => reserve(report, 1, "inference:test"),
        /budget exhausted/,
    );
    assert.equal(report.calls.length, 2);
    report.billing = { pollen: 10, callCount: 2 };
    assert.equal(budgetUsed(report), 10);
});

test("unbound or malformed billing snapshots cannot release uncertain costs", () => {
    const report = {
        billing: { pollen: 8 },
        calls: [{ kind: "web_fetch_exa", status: "failed", reserved: 4 }],
    };
    assert.equal(budgetUsed(report), 12);
    for (const callCount of [-1, 2, 0.5])
        assert.throws(
            () => budgetUsed({ ...report, billing: { pollen: 8, callCount } }),
            /snapshot boundary/,
        );
});

test("main checks billing before and after paid work and stops on failure or the cap", async (t) => {
    const exitCode = process.exitCode;
    t.after(() => {
        process.exitCode = exitCode;
    });
    let failBilling = true,
        paid = 0,
        usageReads = 0,
        payOnce = false,
        failAfterPayment = false;
    t.mock.method(globalThis, "fetch", async (requestUrl) => {
        const url = String(requestUrl);
        if (url.includes("/models?"))
            return Response.json([
                {
                    name: "openai/gpt-6.1-sol",
                    community: false,
                    paid_only: false,
                    category: "text",
                    pricing: {
                        promptTextTokens: 0.000002,
                        completionTextTokens: 0.00001,
                    },
                },
                {
                    name: "publisher/test-v1",
                    community: false,
                    category: "text",
                },
            ]);
        if (url.endsWith("/mcp"))
            return Response.json({
                data: [
                    {
                        id: "exa",
                        pricing: {
                            rates: [
                                { kind: "search_request", price: 0.007 },
                                { kind: "page", price: 0.001 },
                            ],
                        },
                    },
                ],
            });
        if (String(url).includes("/account/key/usage")) {
            usageReads++;
            if (failBilling || (failAfterPayment && paid))
                return new Response("Unavailable", { status: 503 });
            return Response.json({
                count: 1,
                usage: [
                    {
                        timestamp: new Date(
                            Math.floor(Date.now() / 1000) * 1000,
                        )
                            .toISOString()
                            .slice(0, 19)
                            .replace("T", " "),
                        cursor_event_id: "event",
                        cost_usd: payOnce && paid === 0 ? 0 : 1,
                    },
                ],
            });
        }
        paid++;
        if (payOnce && paid === 1)
            return Response.json({
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 5,
                    total_tokens: 15,
                },
                choices: [
                    {
                        message: {
                            role: "assistant",
                            content: "No tool action",
                        },
                    },
                ],
            });
        throw new Error("Billing stop must prevent this paid call");
    });
    for (const unavailable of [true, false]) {
        failBilling = unavailable;
        const out = await mkdtemp(
            join(tmpdir(), "research-billing-integration-"),
        );
        const report = await main({
            POLLINATIONS_API_KEY: "test-key",
            MODELS: "publisher/test-v1",
            MAX_POLLEN: "1",
            CHECK_BILLING: "true",
            RESEARCH_OUT: out,
        });
        assert.equal(report.status, "partial");
        assert.equal(report.calls.length, 0);
        if (unavailable) assert.match(report.billingGap, /unavailable/);
        else {
            assert.equal(report.billing.pollen, 1);
            assert.equal(report.billing.callCount, 0);
            assert.equal(budgetUsed(report), 1);
        }
    }
    assert.equal(paid, 0);
    assert.ok(usageReads >= 2);
    for (const unavailable of [false, true]) {
        payOnce = true;
        failBilling = false;
        failAfterPayment = unavailable;
        paid = 0;
        const out = await mkdtemp(
            join(tmpdir(), "research-billing-after-payment-"),
        );
        const report = await main({
            POLLINATIONS_API_KEY: "test-key",
            MODELS: "publisher/test-v1",
            MAX_POLLEN: "1",
            CHECK_BILLING: "true",
            RESEARCH_OUT: out,
        });
        assert.equal(
            paid,
            1,
            "The post-research billing check must stop the next task",
        );
        assert.equal(report.calls.length, 1);
        assert.equal(report.calls[0].status, "received");
        assert.ok(report.calls[0].accountedPollen > 0);
        if (unavailable) assert.match(report.billingGap, /unavailable/);
        else {
            assert.equal(report.billing.callCount, 1);
            assert.equal(budgetUsed(report), 1);
        }
    }
});

test("inference cost accounts uncached, cache read, cache write, and output tokens once", () => {
    assert.equal(
        inferenceCost(usage, pricing),
        50 * 0.002 + 20 * 0.0002 + 30 * 0.003 + 5 * 0.01,
    );
    assert.equal(
        inferenceCost(usage, { ...pricing, promptCachedTokens: undefined }),
        70 * 0.002 + 30 * 0.003 + 5 * 0.01,
    );
});

test("missing cache information conservatively charges the larger input rate", () => {
    assert.equal(
        inferenceCost({ ...usage, prompt_tokens_details: undefined }, pricing),
        100 * 0.003 + 5 * 0.01,
    );
    assert.equal(
        inferenceCost(
            { ...usage, prompt_tokens_details: null },
            { ...pricing, promptCacheWriteTokens: 0.001 },
        ),
        100 * 0.002 + 5 * 0.01,
    );
});

test("malformed or excessive cache counts fail closed", () => {
    for (const details of [
        { cached_tokens: -1 },
        { cached_tokens: Infinity },
        { cached_tokens: NaN },
        { cached_tokens: "20" },
        { cached_tokens: 1.5 },
        { cache_write_tokens: -1 },
        { cache_write_tokens: Infinity },
        { cached_tokens: 80, cache_write_tokens: 30 },
        { cached_tokens: Number.MAX_SAFE_INTEGER + 1 },
        { cached_tokens: Number.MAX_SAFE_INTEGER, cache_write_tokens: 1 },
    ]) {
        assert.throws(
            () =>
                inferenceCost(
                    { ...usage, prompt_tokens_details: details },
                    pricing,
                ),
            /cache usage/,
        );
    }
});

test("cache and ordinary rates must be finite nonnegative quotes", () => {
    for (const rate of [-1, NaN, Infinity]) {
        for (const field of [
            "promptTextTokens",
            "completionTextTokens",
            "promptCacheWriteTokens",
            "promptCachedTokens",
        ]) {
            assert.throws(
                () => inferenceCost(usage, { ...pricing, [field]: rate }),
                /price/,
            );
        }
    }
    assert.throws(
        () => inferenceCost(usage, { ...pricing, promptCachedTokens: 0.004 }),
        /cache price/,
    );
});

test("budget above ten Pollen is rejected before any network or output write", async (t) => {
    const out = await mkdtemp(join(tmpdir(), "research-cost-"));
    let requests = 0;
    t.mock.method(globalThis, "fetch", async () => {
        requests++;
        throw new Error("Unexpected network");
    });
    await assert.rejects(
        main({
            POLLINATIONS_API_KEY: "test-key",
            MAX_POLLEN: "10.01",
            RESEARCH_OUT: out,
        }),
        /<=10/,
    );
    assert.equal(requests, 0);
    await assert.rejects(readFile(join(out, "research.json")), {
        code: "ENOENT",
    });
});

test("real main settles cache-aware usage within one invocation budget", async (t) => {
    const out = await mkdtemp(join(tmpdir(), "research-cost-"));
    const exit = process.exitCode;
    t.after(() => {
        process.exitCode = exit;
    });
    const rates = {
        promptTextTokens: 0.000002,
        completionTextTokens: 0.00001,
        promptCacheWriteTokens: 0.000004,
        promptCachedTokens: 0.0000002,
    };
    const bill = {
        ...usage,
        prompt_tokens_details: { cached_tokens: 20, cache_write_tokens: 30 },
    };
    let paid = 0;
    t.mock.method(globalThis, "fetch", async (url, options) => {
        if (url.includes("/models?"))
            return Response.json([
                {
                    name: "openai/gpt-6.1-sol",
                    community: false,
                    paid_only: false,
                    category: "text",
                    pricing: rates,
                },
                {
                    name: "publisher/test-v1",
                    community: false,
                    category: "text",
                },
            ]);
        if (url.endsWith("/mcp"))
            return Response.json({
                data: [
                    {
                        id: "exa",
                        pricing: {
                            rates: [
                                { kind: "search_request", price: 0.007 },
                                { kind: "page", price: 0.001 },
                            ],
                        },
                    },
                ],
            });
        assert.ok(url.endsWith("/v1/chat/completions"));
        paid++;
        const payload = JSON.parse(options.body);
        assert.equal(
            payload.max_tokens,
            JSON.parse(payload.messages[1].content).models ? 2000 : 6000,
        );
        return Response.json({
            usage: bill,
            choices: [
                {
                    message: {
                        role: "assistant",
                        content: "No usable research action",
                    },
                },
            ],
        });
    });
    const report = await main({
        POLLINATIONS_API_KEY: "test-key",
        MAX_POLLEN: "1",
        MODELS: "publisher/test-v1",
        RESEARCH_OUT: out,
    });
    assert.equal(paid, 2);
    assert.ok(report.calls.every((call) => call.status === "received"));
    assert.equal(report.budgetUsedPollen, 2 * inferenceCost(bill, rates));
    assert.equal(report.budgetUsedPollen, budgetUsed(report));
    assert.ok(report.budgetUsedPollen < report.reservedPollen);
    assert.ok(report.budgetUsedPollen <= report.maxPollen);
});

test("invalid component prices are rejected before any paid inference", async (t) => {
    const exit = process.exitCode;
    t.after(() => {
        process.exitCode = exit;
    });
    let rates;
    let paid = 0;
    t.mock.method(globalThis, "fetch", async (url) => {
        if (url.includes("/models?"))
            return Response.json([
                {
                    name: "openai/gpt-6.1-sol",
                    community: false,
                    paid_only: false,
                    category: "text",
                    pricing: rates,
                },
                {
                    name: "publisher/test-v1",
                    community: false,
                    category: "text",
                },
            ]);
        if (url.endsWith("/mcp"))
            return Response.json({
                data: [
                    {
                        id: "exa",
                        pricing: {
                            rates: [
                                { kind: "search_request", price: 0.007 },
                                { kind: "page", price: 0.001 },
                            ],
                        },
                    },
                ],
            });
        paid++;
        throw new Error("Invalid price must not authorize a paid request");
    });
    for (const [field, rate] of [
        ["promptTextTokens", -0.001],
        ["completionTextTokens", -0.001],
        ["promptCacheWriteTokens", -0.001],
        ["promptCachedTokens", -0.001],
        ["promptCachedTokens", 0.004],
    ]) {
        rates = { ...pricing, [field]: rate };
        const out = await mkdtemp(join(tmpdir(), "research-cost-"));
        const report = await main({
            POLLINATIONS_API_KEY: "test-key",
            MAX_POLLEN: "1",
            MODELS: "publisher/test-v1",
            RESEARCH_OUT: out,
        });
        assert.equal(report.calls.length, 0);
        assert.equal(report.budgetUsedPollen, 0);
        assert.match(report.discovery.reason, /price/);
    }
    assert.equal(paid, 0);
});

test("the next quote exceeding the remaining budget stops before payment and preserves settlement", async (t) => {
    const out = await mkdtemp(join(tmpdir(), "research-cost-"));
    const exit = process.exitCode;
    t.after(() => {
        process.exitCode = exit;
    });
    const rates = { promptTextTokens: 0.000002, completionTextTokens: 0.00001 };
    const bill = {
        prompt_tokens: 10000,
        completion_tokens: 6000,
        total_tokens: 16000,
    };
    let paid = 0;
    let firstQuote;
    t.mock.method(globalThis, "fetch", async (url, options) => {
        if (url.includes("/models?"))
            return Response.json([
                {
                    name: "openai/gpt-6.1-sol",
                    community: false,
                    paid_only: false,
                    category: "text",
                    pricing: rates,
                },
                {
                    name: "publisher/test-v1",
                    community: false,
                    category: "text",
                },
            ]);
        if (url.endsWith("/mcp"))
            return Response.json({
                data: [
                    {
                        id: "exa",
                        pricing: {
                            rates: [
                                { kind: "search_request", price: 0.007 },
                                { kind: "page", price: 0.001 },
                            ],
                        },
                    },
                ],
            });
        paid++;
        const payload = JSON.parse(options.body);
        firstQuote =
            (Buffer.byteLength(
                JSON.stringify({
                    messages: payload.messages,
                    tools: payload.tools,
                }),
            ) +
                4096) *
                rates.promptTextTokens +
            payload.max_tokens * rates.completionTextTokens;
        assert.ok(firstQuote <= 0.12, "The first call must fit the whole cap");
        assert.ok(
            inferenceCost(bill, rates) <= firstQuote,
            "Usage must fit its reserved quote",
        );
        return Response.json({
            usage: bill,
            choices: [
                {
                    message: {
                        role: "assistant",
                        content: "No usable research action",
                    },
                },
            ],
        });
    });
    const report = await main({
        POLLINATIONS_API_KEY: "test-key",
        MAX_POLLEN: "0.12",
        MODELS: "publisher/test-v1",
        RESEARCH_OUT: out,
    });
    assert.equal(
        paid,
        1,
        "The second reservation must fail before another paid request",
    );
    assert.equal(report.calls.length, 1);
    assert.equal(report.calls[0].status, "received");
    assert.deepEqual(report.calls[0].usage, bill);
    assert.equal(report.calls[0].accountedPollen, 0.08);
    assert.equal(report.reservedPollen, firstQuote);
    assert.equal(report.budgetUsedPollen, 0.08);
    assert.ok(
        report.budgetUsedPollen < report.maxPollen,
        "The loop guard alone must not stop research",
    );
    assert.match(report.models[0].reason, /budget exhausted/i);
    assert.deepEqual(
        JSON.parse(await readFile(join(out, "research.json"), "utf8")),
        report,
    );
});
