import assert from "node:assert/strict";
import { test } from "node:test";
import {
    CHECKING,
    CONFIRM_CHECKS,
    conditions,
    duration,
    escalates,
    escalation,
    kvPut,
    noteworthy,
    RECOVER_CHECKS,
    renderCard,
    snapshot,
    step,
    waiting,
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
const MIN = 60 * 1000;

// --- detection -------------------------------------------------------------

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
    assert.deepEqual(Object.keys(found), ["model:a/model"]);
    assert.equal(found["model:a/model"].kind, "DEGRADED");
    assert.equal(found["model:a/model"].success, 0.8);
});

test("degraded needs at least 5 failed requests", () => {
    // Live case: deepseek 11/13 is 84.6%, but only 2 requests failed.
    assert.deepEqual(conditions(quiet([row("a/model", 11, 13)])), {});
    assert.equal(
        conditions(quiet([row("a/model", 25, 30)]))["model:a/model"].kind,
        "DEGRADED",
    );
});

test("primary weak: the primary route fails but callers are fine", () => {
    const found = conditions(quiet(weakPrimary));
    assert.equal(found["model:a/model"].kind, "PRIMARY_WEAK");
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

test("platform drop against the previous 50 minutes", () => {
    const found = conditions({
        recent: [],
        last10: [row("a/model", 1000, 1000)],
        last60: [row("a/model", 31000, 31000)],
        official,
    });
    assert.equal(found.platform.kind, "PLATFORM_DROP");
});

test("hostname split tells Worker down from domain down", () => {
    const none = { public: false, upstream: false };
    assert.deepEqual(Object.keys(conditions({ hosts: none })), ["gen"]);
    const pubDown = conditions({
        ...quiet([]),
        hosts: { public: false, upstream: true },
    });
    assert.equal(pubDown.public.kind, "PUBLIC_DOWN");
});

// --- incidents -------------------------------------------------------------

const degraded = (success = 0.5, extra = {}) => ({
    "model:a/model": {
        kind: "DEGRADED",
        model: "a/model",
        success,
        nonClient: 20,
        routes: [],
        ...extra,
    },
});
const healthy = [row("a/model", 20, 20)];

test("an incident opens once, then only updates while the problem lasts", () => {
    let r = step({}, degraded(), 0);
    assert.deepEqual(r.actions, [{ type: "open", key: "model:a/model" }]);
    assert.equal(r.state.open["model:a/model"].openedAt, 0);
    // Hours later, still the same card: no reposts, no reminders.
    for (const t of [1, 60, 180, 400]) {
        r = step(r.state, degraded(), t * MIN);
        assert.deepEqual(r.actions, [{ type: "update", key: "model:a/model" }]);
    }
    assert.equal(r.state.open["model:a/model"].openedAt, 0);
});

test("a status change counts only after it held for 3 checks", () => {
    const weak = degraded(1, { kind: "PRIMARY_WEAK" });
    let r = step({}, weak, 0);
    for (let t = 1; t < CONFIRM_CHECKS; t++) {
        r = step(r.state, degraded(), t * MIN);
        assert.equal(r.state.open["model:a/model"].kind, "PRIMARY_WEAK");
    }
    r = step(r.state, degraded(), CONFIRM_CHECKS * MIN);
    assert.equal(r.state.open["model:a/model"].kind, "DEGRADED");
    // The newest numbers are always kept, even before a change counts.
    assert.equal(r.state.open["model:a/model"].info.kind, "DEGRADED");
});

test("an incident closes after 15 clean checks; thin samples don't count", () => {
    let r = step({}, degraded(), 0);
    r = step(r.state, {}, 1 * MIN, [row("a/model", 3, 3)]);
    assert.equal(r.state.clears["model:a/model"], 0);
    for (let i = 1; i < RECOVER_CHECKS; i++) {
        r = step(r.state, {}, (1 + i) * MIN, healthy);
        assert.equal(r.actions.length, 0);
    }
    r = step(r.state, {}, 20 * MIN, healthy);
    const [close] = r.actions;
    assert.equal(close.type, "close");
    assert.equal(close.incident.closedAt, 20 * MIN);
    assert.equal(close.incident.latest.success, 1);
    assert.equal(r.state.open["model:a/model"], undefined);
});

test("a hovering model keeps one card open instead of flapping", () => {
    let r = step({}, degraded(), 0);
    const actions = [];
    for (let t = 1; t < 60; t++) {
        r =
            t % 2 === 0
                ? step(r.state, degraded(), t * MIN)
                : step(r.state, {}, t * MIN, healthy);
        actions.push(...r.actions.map((a) => a.type));
    }
    assert.ok(!actions.includes("open") && !actions.includes("close"));
});

test("a model failing again within the hour opens a new card marked AGAIN", () => {
    let r = step({}, degraded(), 0);
    for (let i = 1; i <= RECOVER_CHECKS; i++)
        r = step(r.state, {}, i * MIN, healthy);
    const closedAt = RECOVER_CHECKS * MIN;
    r = step(r.state, degraded(), closedAt + 20 * MIN);
    assert.equal(r.actions[0].type, "open");
    assert.equal(r.state.open["model:a/model"].again, closedAt);
    // Past the hour, it's a fresh problem.
    let late = step({}, degraded(), 0);
    for (let i = 1; i <= RECOVER_CHECKS; i++)
        late = step(late.state, {}, i * MIN, healthy);
    late = step(late.state, degraded(), closedAt + 90 * MIN);
    assert.equal(late.state.open["model:a/model"].again, null);
});

test("gen down needs 3 checks in a row, then closes as soon as gen is back", () => {
    const found = { gen: { kind: "GEN_DOWN" } };
    let r = step({}, found, 0);
    r = step(r.state, found, 1);
    assert.equal(r.actions.length, 0);
    r = step(r.state, found, 2);
    assert.equal(r.actions[0].type, "open");
    r = step(r.state, {}, 3);
    assert.equal(r.actions[0].type, "close");
});

test("analytics outage pauses model incidents but is not gen down", () => {
    let r = step({}, degraded(), 0);
    const blind = conditions({ analyticsDown: true });
    for (const t of [1, 2, 3]) r = step(r.state, blind, t);
    assert.deepEqual(
        r.actions.map((a) => a.key),
        ["analytics"],
    );
    assert.ok(r.state.open["model:a/model"]);
});

test("one hostname down, then both down: no false close", () => {
    let r = { state: {} };
    const pubDown = conditions({
        ...quiet([]),
        hosts: { public: false, upstream: true },
    });
    for (const t of [1, 2, 3]) r = step(r.state, pubDown, t);
    const bothDown = conditions({ hosts: { public: false, upstream: false } });
    for (const t of [4, 5, 6]) {
        r = step(r.state, bothDown, t);
        assert.ok(!r.actions.some((a) => a.type === "close"));
    }
    assert.ok(r.state.open.public);
    assert.ok(r.state.open.gen);
});

// --- what counts as a change -----------------------------------------------

const look = (kind, extra = {}) => ({
    kind,
    info: { success: 0.6, routes: [], callers: null, ...extra },
});

test("the same problem with similar numbers is not a change", () => {
    const before = snapshot(look("DEGRADED", { success: 0.6 }));
    const after = snapshot(look("DEGRADED", { success: 0.7 }));
    assert.equal(noteworthy(before, after), null);
});

test("a new status, failing route, error kind, big move or more callers is", () => {
    const base = look("DEGRADED", {
        routes: [
            { provider: "fireworks", fallback: false, ok: 2, attempts: 10 },
        ],
        errorKind: "overloaded",
        callers: { callers: 9, failing_callers: 1 },
    });
    const before = snapshot(base);
    const changed = (kind, extra) =>
        noteworthy(before, snapshot(look(kind, { ...base.info, ...extra })));
    assert.match(changed("PRIMARY_WEAK", {}), /status/);
    assert.match(
        changed("DEGRADED", {
            routes: [
                ...base.info.routes,
                { provider: "deepinfra", fallback: true, ok: 0, attempts: 8 },
            ],
        }),
        /routes/,
    );
    assert.match(changed("DEGRADED", { errorKind: "rate_limited" }), /error/);
    assert.match(changed("DEGRADED", { success: 0.35 }), /success/);
    assert.match(
        changed("DEGRADED", { callers: { callers: 9, failing_callers: 4 } }),
        /callers/,
    );
});

test("it pings again only when it gets worse for callers", () => {
    const at = (kind, failing) => ({ kind, failingCallers: failing });
    assert.equal(escalates(at("PRIMARY_WEAK", 0), at("DEGRADED", 5)), true);
    assert.equal(escalates(at("DEGRADED", 1), at("DEGRADED", 3)), true);
    assert.equal(escalates(at("PRIMARY_WEAK", 0), at("DEGRADED", 1)), false);
    assert.equal(escalates(at("DEGRADED", 4), at("DEGRADED", 6)), false);
    assert.equal(escalates(at("DEGRADED", 4), at("PRIMARY_WEAK", 0)), false);
});

// --- the card --------------------------------------------------------------

const opened = (extra = {}) => {
    const info = {
        kind: "DEGRADED",
        model: "a/model",
        success: 0.62,
        nonClient: 40,
        callers: { callers: 9, failing_callers: 7 },
        routes: [
            { provider: "fireworks", fallback: false, ok: 25, attempts: 40 },
            { provider: "deepinfra", fallback: true, ok: 0, attempts: 15 },
        ],
    };
    return {
        kind: "DEGRADED",
        openedAt: 60 * MIN,
        again: null,
        start: info,
        info,
        ...extra,
    };
};

test("an open card: the box, then 'open since', then the AI lines", () => {
    const card = renderCard("model:a/model", opened(), {
        now: 60 * MIN,
        checking: true,
    });
    assert.equal(card.color, 0xd85a30);
    assert.equal(card.ping, true);
    assert.match(card.text, /┌─ DEGRADED: a\/model ─/);
    assert.match(card.text, /PRIMARY\s+fireworks 25\/40 \(63%\)/);
    assert.match(card.text, /\*open since <t:3600:R>\*/);
    assert.doesNotMatch(card.text, /START/);
    assert.ok(card.text.endsWith(CHECKING));
});

test("once updated, the card keeps its start and the AI timeline", () => {
    const later = opened({
        info: { ...opened().info, success: 0.3, nonClient: 50 },
        again: 20 * MIN,
    });
    const lines = [
        { at: 60 * MIN, text: "Provider fault." },
        { at: 100 * MIN, text: "Fallback fails too." },
    ];
    const { text } = renderCard("model:a/model", later, {
        now: 100 * MIN,
        lines,
    });
    assert.match(text, /FINAL\s+30\.0% of 50 reqs 15m/);
    assert.match(text, /START\s+62\.0% of 40 reqs, 7 of 9 failing/);
    assert.match(text, /AGAIN\s+last closed 40 min ago/);
    assert.match(text, /↳ <t:3600:t> Provider fault\.\n↳ <t:6000:t> Fallback/);
});

test("a closed card turns green with how long, what it cost, start and now", () => {
    const done = opened({
        closedAt: 181 * MIN,
        lost: { failures: 37, failing_callers: 5 },
        latest: { success: 1, nonClient: 22 },
        pinged: true,
    });
    const card = renderCard("model:a/model", done, {
        lines: [{ at: 60 * MIN, text: "Provider fault." }],
    });
    assert.equal(card.color, 0x639922);
    // The mentions of the opening post stay as they were.
    assert.equal(card.ping, true);
    assert.match(card.text, /┌─ RECOVERED: a\/model ─/);
    assert.match(card.text, /DOWN\s+2 h 01 min/);
    assert.match(card.text, /LOST\s+37 requests, 5 callers/);
    assert.match(card.text, /START\s+62\.0% of 40 reqs/);
    assert.match(card.text, /NOW\s+100\.0% of 22 reqs 15m/);
    assert.doesNotMatch(card.text, /open since/);
    assert.match(card.text, /Provider fault\./);
});

test("infrastructure cards follow the same life: red open, green closed", () => {
    const gen = { kind: "GEN_DOWN", openedAt: 0, info: { kind: "GEN_DOWN" } };
    const open = renderCard("gen", gen, { now: 0 });
    assert.equal(open.color, 0xe24b4a);
    assert.match(open.text, /┌─ DOWN: gen Worker ─/);
    const closed = renderCard("gen", { ...gen, closedAt: 7 * MIN });
    assert.match(closed.text, /┌─ RECOVERED: gen Worker ─/);
    assert.match(closed.text, /DOWN\s+7 min/);
});

test("who an opening card pings", () => {
    const ping = (incident) => renderCard("k", incident, { now: 0 }).ping;
    const one = opened({
        info: { ...opened().info, callers: { callers: 6, failing_callers: 1 } },
    });
    assert.equal(ping(one), false);
    assert.equal(ping(opened({ kind: "PRIMARY_WEAK" })), false);
    const host = (kind) => ({ kind, openedAt: 0, info: { kind } });
    assert.equal(ping(host("PUBLIC_DOWN")), true);
    assert.equal(ping(host("UPSTREAM_DOWN")), false);
});

test("the box title carries the status and the full model id", () => {
    const longest = "inferenceport-ai/lightning-image-turbo";
    const { text } = renderCard(`model:${longest}`, opened(), {
        now: 60 * MIN,
    });
    const lines = text.split("\n");
    assert.equal(lines[0], "```");
    assert.ok(lines[1].startsWith(`┌─ DEGRADED: ${longest} ─`));
    const box = lines.filter((l) => /^[│┌└]/.test(l));
    for (const line of box) assert.equal([...line].length, [...box[0]].length);
});

test("an escalation links to the card and pings", () => {
    const post = escalation("model:a/model", opened(), "https://x.test/m/1");
    assert.equal(post.ping, true);
    assert.match(
        post.text,
        /`a\/model` is now DEGRADED.*https:\/\/x\.test\/m\/1/,
    );
});

test("durations read plainly", () => {
    assert.equal(duration(20 * 1000), "under 1 min");
    assert.equal(duration(47 * MIN), "47 min");
    assert.equal(duration(121 * MIN), "2 h 01 min");
});

test("a status change must hold on consecutive checks; a clean check resets it", () => {
    const weak = degraded(1, { kind: "PRIMARY_WEAK" });
    let r = step({}, weak, 0);
    // bad, healthy, bad, healthy, bad: never 3 bad checks in a row.
    const pattern = [true, false, true, false, true];
    pattern.forEach((bad, i) => {
        r = bad
            ? step(r.state, degraded(), (i + 1) * MIN)
            : step(r.state, {}, (i + 1) * MIN, healthy);
    });
    assert.equal(r.state.open["model:a/model"].kind, "PRIMARY_WEAK");
});

test("an AI line pending for too long counts as abandoned", () => {
    // A restart drops the in-memory AI task, but its pending flag was saved.
    assert.equal(waiting({ pending: true, pendingAt: 0 }, 2 * MIN), true);
    assert.equal(waiting({ pending: true, pendingAt: 0 }, 11 * MIN), false);
    assert.equal(waiting({ pending: true }, 0), false);
    assert.equal(waiting({ pending: false, pendingAt: 0 }, 1), false);
});

test("a sign-up burst opens a quiet card while the domain is over the limit, and ends", () => {
    const signup = { domain: "farm.com", accounts: 31, since: 1_793_404_800 };
    const found = conditions({ ...quiet(busy), signups: [signup] });
    assert.deepEqual(found, {
        "signup:farm.com": { kind: "SIGNUP_BURST", ...signup },
    });
    let r = step({}, found, 0);
    assert.deepEqual(
        r.actions.map((a) => a.type),
        ["open"],
    );
    r = step(r.state, found, MIN);
    assert.deepEqual(
        r.actions.map((a) => a.type),
        ["update"],
    );
    r = step(r.state, {}, 2 * MIN);
    assert.deepEqual(
        r.actions.map((a) => a.type),
        ["close"],
    );

    const incident = { ...r.actions[0].incident, closedAt: undefined };
    const open = renderCard("signup:farm.com", incident, { now: 2 * MIN });
    assert.equal(open.ping, false);
    assert.equal(open.color, 0xef9f27);
    assert.match(open.text, /FLAGGED: domain farm\.com/);
    assert.match(open.text, /31 in 24h/);
    assert.match(open.text, /2026-10-31 00:00 UTC/);
    assert.match(open.text, /still paid, review the domain/);
    const ended = renderCard("signup:farm.com", r.actions[0].incident);
    assert.match(ended.text, /ENDED: domain farm\.com/);
    assert.match(ended.text, /LASTED +2 min/);
    assert.equal(ended.color, 0x639922);
});

test("a held burst says so and shows how to release the domain", () => {
    const card = (hold) =>
        renderCard(
            "signup:farm.com",
            {
                kind: "SIGNUP_BURST",
                openedAt: 0,
                info: {
                    kind: "SIGNUP_BURST",
                    domain: "farm.com",
                    accounts: 31,
                    since: 0,
                    hold,
                },
            },
            { now: 0 },
        ).text;
    assert.match(card("held"), /Setup quests held/);
    assert.match(
        card("held"),
        /kv key put --binding SETUP_HOLDS --env production --remote 'release:farm\.com' released/,
    );
    assert.match(card("released"), /released by a maintainer/);
    assert.doesNotMatch(card("released"), /kv key put/);
    assert.match(card(undefined), /still paid, review the domain/);
});

test("a command is built only for keys of ids and plain domain names", () => {
    assert.match(
        kvPut("decision:AbC_1-2", "approved"),
        /'decision:AbC_1-2' approved$/,
    );
    assert.doesNotMatch(
        kvPut("release:a';rm -rf ~;'.com", "released"),
        /rm -rf/,
    );
});
