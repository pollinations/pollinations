import assert from "node:assert/strict";
import { test } from "node:test";
import { COOLDOWN_MS, conditions, render, step } from "./rules.js";

const row = (model, ok, total, extra = {}) => ({
    model,
    is_rollup: 1,
    total_requests: total,
    status_2xx: ok,
    errors_4xx: 0,
    retried_503s: 0,
    fallback_rescues: 0,
    ...extra,
});
const official = new Set(["a/model", "b/model"]);
const busy = [row("a/model", 6000, 6000)];
const quiet = (rows) => ({
    recent: rows,
    last10: busy,
    last60: [row("a/model", 36000, 36000)],
    official,
});

test("healthy traffic raises nothing", () => {
    assert.deepEqual(conditions(quiet([row("a/model", 99, 100)])), {});
});

test("degraded official model, ignoring 4xx and thin samples", () => {
    const found = conditions(
        quiet([
            row("a/model", 80, 120, { errors_4xx: 20 }),
            row("b/model", 0, 9),
            row("community/x/y", 0, 500),
        ]),
    );
    assert.deepEqual(Object.keys(found), ["degraded:a/model"]);
    assert.equal(found["degraded:a/model"].success, 0.8);
});

test("spillover only when final success stays high", () => {
    const found = conditions(
        quiet([
            row("a/model", 100, 100, {
                retried_503s: 15,
                fallback_rescues: 15,
            }),
        ]),
    );
    assert.deepEqual(Object.keys(found), ["spillover:a/model"]);
});

test("platform drop against the previous 50 minutes", () => {
    const found = conditions({
        recent: [],
        last10: [row("a/model", 1000, 1000)],
        last60: [row("a/model", 31000, 31000)],
        official,
    });
    assert.equal(found.platform.kind, "PLATFORM_DROP");
});

test("alerts once, respects cooldown, then announces recovery", () => {
    const found = {
        "degraded:a/model": {
            kind: "DEGRADED",
            model: "a/model",
            success: 0.5,
            nonClient: 20,
        },
    };
    let r = step({}, found, 0);
    assert.equal(r.posts.length, 1);
    r = step(r.state, found, 60_000);
    assert.equal(r.posts.length, 0);
    r = step(r.state, found, COOLDOWN_MS + 1);
    assert.equal(r.posts.length, 1);
    r = step(r.state, {}, COOLDOWN_MS + 2, [row("a/model", 20, 20)]);
    assert.deepEqual(
        r.posts.map((p) => p.type),
        ["recovered"],
    );
    assert.deepEqual(r.state.active, {});
});

test("recovery waits for a fresh sample", () => {
    const found = {
        "degraded:a/model": {
            kind: "DEGRADED",
            model: "a/model",
            success: 0.5,
            nonClient: 20,
        },
    };
    const r = step(step({}, found, 0).state, {}, 1000, [row("a/model", 3, 3)]);
    assert.equal(r.posts.length, 0);
});

test("gen down and platform drop need 3 checks in a row", () => {
    const found = { gen: { kind: "GEN_DOWN" } };
    let r = step({}, found, 0);
    r = step(r.state, found, 1);
    assert.equal(r.posts.length, 0);
    r = step(r.state, found, 2);
    assert.equal(r.posts.length, 1);
    const reset = step(step({}, found, 0).state, {}, 1);
    assert.equal(step(reset.state, found, 2).posts.length, 0);
});

test("panel stays 44 chars wide", () => {
    const { text, ping } = render({
        type: "alert",
        key: "degraded:x",
        info: {
            kind: "DEGRADED",
            model: "a-very-long-provider/a-very-long-model-name-x",
            success: 0.5,
            nonClient: 20,
        },
    });
    assert.equal(ping, true);
    for (const line of text.split("\n").filter((l) => /^[│┌└]/.test(l))) {
        assert.equal([...line].length, 46);
    }
});

test("analytics outage pauses recovery but is not gen down", () => {
    const degraded = {
        "degraded:a/model": {
            kind: "DEGRADED",
            model: "a/model",
            success: 0.5,
            nonClient: 20,
        },
    };
    let r = step({}, degraded, 0);
    const blind = conditions({ analyticsDown: true });
    assert.deepEqual(Object.keys(blind), ["analytics"]);
    for (const t of [1, 2, 3]) r = step(r.state, blind, t);
    assert.deepEqual(
        r.posts.map((p) => p.info.kind),
        ["ANALYTICS_DOWN"],
    );
    assert.ok(r.state.active["degraded:a/model"]);
});

test("degraded alerts are labelled unconfirmed", () => {
    const { text } = render({
        type: "alert",
        key: "degraded:a/model",
        info: {
            kind: "DEGRADED",
            model: "a/model",
            success: 0.5,
            nonClient: 20,
        },
    });
    assert.match(text, /unconfirmed: callers unknown/);
});
