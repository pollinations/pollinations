import assert from "node:assert/strict";
import { test } from "node:test";
import {
    CHECKING,
    COOLDOWN_MS,
    complete,
    conditions,
    RECOVER_CHECKS,
    render,
    step,
} from "./rules.js";

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

// One backend route of a model: a provider's attempts, primary by default.
const route = (model, provider, ok, total, extra = {}) =>
    row(model, ok, total, {
        is_rollup: 0,
        provider,
        fallback_used: false,
        ...extra,
    });
// Live case: gemma-4-26b's primary fails 3 in 4, its fallback saves all.
const weakPrimary = [
    row("a/model", 64, 64),
    route("a/model", "openrouter", 26, 102),
    route("a/model", "deepinfra", 38, 38, { fallback_used: true }),
];

test("primary weak: the primary route fails but callers are fine", () => {
    const found = conditions(quiet(weakPrimary));
    assert.deepEqual(Object.keys(found), ["primary:a/model"]);
    assert.equal(found["primary:a/model"].kind, "PRIMARY_WEAK");
});

test("a mostly healthy primary stays quiet, even with retried 503s", () => {
    // Live case: flux's primary at 94%, plus a primary too thin to judge.
    const found = conditions(
        quiet([
            row("a/model", 335, 335, {
                retried_503s: 20,
                fallback_rescues: 20,
            }),
            route("a/model", "vast", 315, 335, { retried_503s: 20 }),
            route("a/model", "deepinfra", 20, 20, { fallback_used: true }),
            row("b/model", 4, 4),
            route("b/model", "openrouter", 0, 4),
            route("b/model", "deepinfra", 4, 4, { fallback_used: true }),
        ]),
    );
    assert.deepEqual(found, {});
});

test("a weak primary is posted without a ping, naming each route", () => {
    const info = conditions(quiet(weakPrimary))["primary:a/model"];
    const { text, ping } = render({
        type: "alert",
        key: "primary:a/model",
        info,
    });
    assert.equal(ping, false);
    assert.match(text, /┌─ PRIMARY WEAK: a\/model ─/);
    assert.match(text, /PRIMARY\s+openrouter 26\/102 \(25%\)/);
    assert.match(text, /FALLBACK deepinfra 38\/38/);
    assert.doesNotMatch(text, /\bBY\b/);
});

test("degraded panels name each route and still ping", () => {
    const info = conditions(
        quiet([
            row("a/model", 50, 100),
            route("a/model", "azure", 40, 90),
            route("a/model", "openai", 10, 50, { fallback_used: true }),
        ]),
    )["degraded:a/model"];
    const { text, ping } = render({
        type: "alert",
        key: "degraded:a/model",
        info,
    });
    assert.equal(ping, true);
    assert.match(text, /PRIMARY\s+azure 40\/90 \(44%\)/);
    assert.match(text, /FALLBACK openai 10\/50 \(20%\)/);
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
    for (let i = 1; i < RECOVER_CHECKS; i++) {
        r = step(r.state, {}, COOLDOWN_MS + 1 + i, [row("a/model", 20, 20)]);
        assert.equal(r.posts.length, 0);
    }
    r = step(r.state, {}, COOLDOWN_MS + 99, [row("a/model", 20, 20)]);
    assert.deepEqual(
        r.posts.map((p) => p.type),
        ["recovered"],
    );
    assert.deepEqual(r.state.active, {});
});

test("a recovery retried after a failed post still needs a fresh sample", () => {
    // 15 clean checks reached, but the recovery post failed (kept active).
    const state = {
        active: { "degraded:a/model": { postedAt: 0, kind: "DEGRADED" } },
        clears: { "degraded:a/model": RECOVER_CHECKS },
    };
    assert.equal(step(state, {}, 1, [row("a/model", 0, 9)]).posts.length, 0);
    assert.deepEqual(
        step(state, {}, 1, [row("a/model", 20, 20)]).posts.map((p) => p.type),
        ["recovered"],
    );
});

test("a model hovering at the threshold alerts once, without flapping", () => {
    const bad = {
        "degraded:a/model": {
            kind: "DEGRADED",
            model: "a/model",
            success: 0.89,
            nonClient: 58,
        },
    };
    let r = { state: {} };
    const posts = [];
    for (let t = 0; t < 60; t++) {
        r =
            t % 2 === 0
                ? step(r.state, bad, t * 60_000)
                : step(r.state, {}, t * 60_000, [row("a/model", 53, 58)]);
        posts.push(...r.posts.map((p) => p.type));
    }
    assert.deepEqual(posts, ["alert"]);
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

test("the box title carries the status and the full model id", () => {
    const longest = "inferenceport-ai/lightning-image-turbo";
    const { text, ping } = render({
        type: "alert",
        key: `degraded:${longest}`,
        info: { kind: "DEGRADED", model: longest, success: 0.5, nonClient: 20 },
    });
    assert.equal(ping, true);
    const lines = text.split("\n");
    // Nothing above the box: it opens the message.
    assert.equal(lines[0], "```");
    assert.ok(lines[1].startsWith(`┌─ DEGRADED: ${longest} ─`));
    assert.doesNotMatch(text, /MONITOR|STATUS|MODEL /);
    const box = lines.filter((l) => /^[│┌└]/.test(l));
    const width = [...box[0]].length;
    for (const line of box) assert.equal([...line].length, width);
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

const degradedInfo = (callers) => ({
    kind: "DEGRADED",
    model: "a/model",
    success: 0.5,
    nonClient: 20,
    callers,
});

test("CALLERS shows how many accounts fail, or unknown", () => {
    const known = render({
        type: "alert",
        key: "degraded:a/model",
        info: degradedInfo({ callers: 6, failing_callers: 2 }),
    });
    assert.match(known.text, /CALLERS\s+2 of 6 failing/);
    const unknown = render({
        type: "alert",
        key: "degraded:a/model",
        info: degradedInfo(),
    });
    assert.match(unknown.text, /CALLERS\s+unknown/);
    assert.doesNotMatch(unknown.text, /unconfirmed/);
});

test("a degraded model with one failing caller is posted without a ping", () => {
    const one = { type: "alert", key: "degraded:a/model" };
    assert.equal(
        render({
            ...one,
            info: degradedInfo({ callers: 6, failing_callers: 1 }),
        }).ping,
        false,
    );
    assert.equal(
        render({
            ...one,
            info: degradedInfo({ callers: 6, failing_callers: 3 }),
        }).ping,
        true,
    );
    assert.equal(render({ ...one, info: degradedInfo() }).ping, true);
});

test("degraded needs at least 5 failed requests", () => {
    // Live case: deepseek 11/13 is 84.6%, but only 2 requests failed.
    assert.deepEqual(conditions(quiet([row("a/model", 11, 13)])), {});
    assert.deepEqual(Object.keys(conditions(quiet([row("a/model", 25, 30)]))), [
        "degraded:a/model",
    ]);
});

test("the AI line completes the alert, or the waiting line just goes", () => {
    const alert = `top\npanel\n${CHECKING}`;
    assert.equal(
        complete(alert, "One caller, not an outage."),
        "top\npanel\n↳ One caller, not an outage.",
    );
    assert.equal(complete(alert, null), "top\npanel");
});

test("hostname split tells Worker down from domain down", () => {
    const none = { public: false, upstream: false };
    assert.deepEqual(Object.keys(conditions({ hosts: none })), ["gen"]);
    const pubDown = conditions({
        ...quiet([]),
        hosts: { public: false, upstream: true },
    });
    assert.equal(pubDown.public.kind, "PUBLIC_DOWN");
    const { text, ping } = render({
        type: "alert",
        key: "public",
        info: pubDown.public,
    });
    assert.match(text, /gen\.pollinations\.ai\s+DOWN/);
    assert.match(text, /gen\.myceli\.ai\s+up/);
    assert.equal(ping, true);
    const upDown = conditions({
        ...quiet([]),
        hosts: { public: true, upstream: false },
    });
    assert.equal(
        render({ type: "alert", key: "upstream", info: upDown.upstream }).ping,
        false,
    );
});

test("model alerts keep working when only one hostname is down", () => {
    const found = conditions({
        ...quiet([row("a/model", 50, 100)]),
        hosts: { public: false, upstream: true },
    });
    assert.deepEqual(Object.keys(found).sort(), ["degraded:a/model", "public"]);
});

test("one hostname down, then both down: no false recovery", () => {
    let r = { state: {} };
    const pubDown = conditions({
        ...quiet([]),
        hosts: { public: false, upstream: true },
    });
    for (const t of [1, 2, 3]) r = step(r.state, pubDown, t);
    const bothDown = conditions({ hosts: { public: false, upstream: false } });
    for (const t of [4, 5, 6]) {
        r = step(r.state, bothDown, t);
        assert.ok(!r.posts.some((p) => p.type === "recovered"));
    }
    assert.ok(r.state.active.public);
    assert.ok(r.state.active.gen);
});

test("each alert carries its colour: red down, orange degraded, yellow weak, green recovered", () => {
    const colorOf = (post) => render(post).color;
    assert.equal(
        colorOf({ type: "alert", key: "gen", info: { kind: "GEN_DOWN" } }),
        0xe24b4a,
    );
    assert.equal(
        colorOf({
            type: "alert",
            key: "analytics",
            info: { kind: "ANALYTICS_DOWN" },
        }),
        0xe24b4a,
    );
    assert.equal(
        colorOf({
            type: "alert",
            key: "degraded:a/model",
            info: degradedInfo(),
        }),
        0xd85a30,
    );
    const weak = conditions(quiet(weakPrimary))["primary:a/model"];
    assert.equal(
        colorOf({ type: "alert", key: "primary:a/model", info: weak }),
        0xef9f27,
    );
    assert.equal(
        colorOf({
            type: "recovered",
            key: "degraded:a/model",
            info: { model: "a/model", success: 1, nonClient: 20 },
        }),
        0x639922,
    );
});

test("a sign-up burst is posted once a day without a ping, and never recovers", () => {
    const signup = { domain: "farm.com", accounts: 31, since: 1_793_404_800 };
    const found = conditions({ ...quiet(busy), signups: [signup] });
    assert.deepEqual(found, {
        "signup:farm.com": { kind: "SIGNUP_BURST", ...signup },
    });
    const day = 24 * 60 * 60 * 1000;
    let r = step({}, found, 0);
    assert.equal(r.posts.length, 1);
    r = step(r.state, found, COOLDOWN_MS + 1);
    assert.equal(r.posts.length, 0);
    r = step(r.state, {}, day - 1);
    assert.equal(r.posts.length, 0);
    assert.ok(r.state.active["signup:farm.com"]);
    r = step(r.state, {}, day);
    assert.equal(r.posts.length, 0);
    assert.deepEqual(r.state.active, {});

    const { text, ping, color } = render({
        type: "alert",
        key: "signup:farm.com",
        info: found["signup:farm.com"],
    });
    assert.equal(ping, false);
    assert.equal(color, 0xef9f27);
    assert.match(text, /FLAGGED: domain farm\.com/);
    assert.match(text, /31 in 24h/);
    assert.match(text, /2026-10-31 00:00 UTC/);
    assert.match(text, /still paid, review the domain/);
});

test("a held burst says so and shows how to release the domain", () => {
    const info = {
        kind: "SIGNUP_BURST",
        domain: "farm.com",
        accounts: 31,
        since: 1_793_404_800,
    };
    const post = (hold) =>
        render({
            type: "alert",
            key: "signup:farm.com",
            info: { ...info, hold },
        }).text;
    assert.match(post("held"), /Setup quests held/);
    assert.match(
        post("held"),
        /kv key put --binding SETUP_HOLDS --env production --remote "hold:farm\.com" released/,
    );
    assert.match(post("released"), /released by a maintainer/);
    assert.doesNotMatch(post("released"), /kv key put/);
    assert.match(post(undefined), /still paid, review the domain/);
});
