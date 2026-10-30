import assert from "node:assert/strict";
import { test } from "node:test";
import {
    allow,
    ask,
    DAILY_LIMIT,
    evidence,
    investigates,
    MODEL,
    reply,
} from "./investigate.js";

const row = (model, extra = {}) => ({
    model,
    event_type: "generate.text",
    model_used: model,
    provider: "vercel",
    is_rollup: 1,
    fallback_used: false,
    total_requests: 100,
    status_2xx: 80,
    errors_4xx: 0,
    errors_402: 0,
    errors_5xx: 20,
    fallback_rescues: 0,
    retried_503s: 0,
    tokens_per_second: 90,
    ...extra,
});
const degraded = {
    type: "alert",
    key: "degraded:a/model",
    info: { kind: "DEGRADED", model: "a/model", success: 0.8, nonClient: 100 },
};

test("only degraded and platform-drop alerts are investigated", () => {
    assert.equal(investigates(degraded), true);
    const drop = { type: "alert", info: { kind: "PLATFORM_DROP" } };
    assert.equal(investigates(drop), true);
    for (const kind of ["SPILLOVER", "GEN_DOWN", "ANALYTICS_DOWN"])
        assert.equal(investigates({ type: "alert", info: { kind } }), false);
    assert.equal(investigates({ ...degraded, type: "recovered" }), false);
});

test("evidence holds only the alerted model's rows and allowlisted fields", () => {
    const data = {
        recent: [row("a/model"), row("b/model")],
        last60: [row("a/model"), row("a/model", { is_rollup: 0 })],
    };
    const e = evidence(degraded, data);
    assert.equal(e.last15.length, 1);
    assert.equal(e.last60.length, 2);
    assert.equal(e.last15[0].tokens_per_second, undefined);
    assert.equal(e.last15[0].errors_5xx, 20);
});

test("platform-drop evidence lists the models that lost the most traffic", () => {
    const last10 = [row("a/model", { total_requests: 10 }), row("b/model")];
    const last60 = [
        row("a/model", { total_requests: 1010 }),
        row("b/model", { total_requests: 600 }),
    ];
    const drop = { type: "alert", info: { kind: "PLATFORM_DROP" } };
    const e = evidence(drop, { last10, last60 });
    assert.equal(e.biggestDrops[0].model, "a/model");
    assert.equal(e.biggestDrops[0].baseline10, 200);
});

test("reply keeps a WHY line and one sentence, and rejects anything else", () => {
    assert.deepEqual(reply("WHY vercel 5xx (20)\nProvider issue.\nextra"), [
        "WHY vercel 5xx (20)",
        "Provider issue.",
    ]);
    assert.equal(reply("The model is fine."), null);
    assert.equal(reply(""), null);
    const [why] = reply(`WHY ${"x".repeat(500)}\nok`);
    assert.ok(why.length <= 200);
});

test("ask sends the key only as a header and parses the answer", async () => {
    let sent;
    const fetchImpl = async (url, init) => {
        sent = { url, init, body: JSON.parse(init.body) };
        return {
            ok: true,
            json: async () => ({
                choices: [{ message: { content: "WHY x\nSentence." } }],
            }),
        };
    };
    const lines = await ask("sk_test", { alert: {} }, { fetchImpl });
    assert.deepEqual(lines, ["WHY x", "Sentence."]);
    assert.equal(sent.init.headers.authorization, "Bearer sk_test");
    assert.equal(sent.body.model, MODEL);
    assert.ok(!sent.init.body.includes("sk_test"));
});

test("ask fails loudly on an error response", async () => {
    const fetchImpl = async () => ({
        ok: false,
        status: 402,
        text: async () => "",
    });
    await assert.rejects(ask("sk_test", {}, { fetchImpl }), /402/);
});

test("at most DAILY_LIMIT investigations per UTC day", () => {
    const day1 = Date.UTC(2026, 9, 30, 12);
    let budget = {};
    for (let i = 0; i < DAILY_LIMIT; i++) {
        budget = allow(budget, day1);
        assert.ok(budget);
    }
    assert.equal(allow(budget, day1), null);
    assert.deepEqual(allow(budget, day1 + 24 * 3600 * 1000), {
        day: "2026-10-31",
        count: 1,
    });
});
