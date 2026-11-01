import assert from "node:assert/strict";
import { test } from "node:test";
import {
    CHECKING,
    CONFIRM_CHECKS,
    conditions,
    duration,
    escalates,
    heartbeat,
    legacyDown,
    noteworthy,
    RECOVER_CHECKS,
    releaseCommands,
    renderCard,
    STALE_MS,
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
// A card's text as the phone shows it: without the title's colour codes.
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI codes start with ESC
const plain = (text) => text.replace(/\u001b\[[\d;]*m/g, "");

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

test("an incident remembers the worst status it reached", () => {
    const weak = degraded(1, { kind: "PRIMARY_WEAK" });
    let r = step({}, weak, 0);
    assert.equal(r.state.open["model:a/model"].worst, "PRIMARY_WEAK");
    for (let t = 1; t <= CONFIRM_CHECKS; t++)
        r = step(r.state, degraded(), t * MIN);
    for (let t = 1; t <= CONFIRM_CHECKS; t++)
        r = step(r.state, weak, (CONFIRM_CHECKS + t) * MIN);
    const incident = r.state.open["model:a/model"];
    assert.equal(incident.kind, "PRIMARY_WEAK");
    assert.equal(incident.worst, "DEGRADED");
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
    assert.match(plain(card.text), /┌─ DEGRADED: a\/model ─/);
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
    assert.match(text, /<t:3600:t> Provider fault\.\n<t:6000:t> Fallback/);
});

test("a closed card keeps its status and takes the colour of what it cost", () => {
    const done = opened({
        closedAt: 181 * MIN,
        lost: { requests: 900, failures: 37, callers: 40, failing_callers: 5 },
        latest: { success: 1, nonClient: 22 },
        pinged: true,
    });
    const card = renderCard("model:a/model", done, {
        lines: [{ at: 60 * MIN, text: "Provider fault." }],
    });
    // 37 of 900 requests failed: orange, under half.
    assert.equal(card.color, 0xd85a30);
    // The mentions of the opening post stay as they were.
    assert.equal(card.ping, true);
    assert.match(plain(card.text), /┌─ DEGRADED: a\/model ─/);
    // How long and what it cost move out of the box into the summary.
    assert.doesNotMatch(card.text, /DOWN\s|LOST\s/);
    assert.match(card.text, /START\s+62\.0% of 40 reqs/);
    assert.match(card.text, /NOW\s+100\.0% of 22 reqs 15m/);
    assert.doesNotMatch(card.text, /open since/);
    assert.match(card.text, /Provider fault\./);
    assert.equal(
        card.text.split("\n").at(-1),
        "### ⏱️ 2 h 01 min · 👥 5/40 users hit · 📉 37/900 requests failed (4%)",
    );
});

test("a closed outage's colour and summary say what it cost callers", () => {
    // Opened at minute 60, so 20 minutes long.
    const close = (lost) =>
        renderCard("model:a/model", opened({ closedAt: 80 * MIN, lost }));
    const last = (card) => card.text.split("\n").at(-1);
    const total = { requests: 152, callers: 9 };
    const none = close({ ...total, failures: 0, failing_callers: 0 });
    assert.equal(none.color, 0x639922);
    assert.equal(
        last(none),
        "### ⏱️ 20 min · 👥 0/9 users hit · 📉 0/152 requests failed",
    );
    const most = close({ ...total, failures: 140, failing_callers: 9 });
    assert.equal(most.color, 0xe24b4a);
    assert.equal(
        last(most),
        "### ⏱️ 20 min · 👥 9/9 users hit · 📉 140/152 requests failed (92%)",
    );
    // A share under 1% doesn't read as 0%.
    assert.match(
        last(
            close({
                requests: 500,
                callers: 40,
                failures: 1,
                failing_callers: 1,
            }),
        ),
        /📉 1\/500 requests failed \(<1%\)$/,
    );
    const unknown = close(null);
    assert.equal(unknown.color, 0x888780);
    assert.equal(last(unknown), "### ⏱️ 20 min · impact unknown");
});

test("a closed card's title keeps the worst status its incident reached", () => {
    const done = opened({
        kind: "PRIMARY_WEAK",
        worst: "DEGRADED",
        closedAt: 80 * MIN,
    });
    assert.match(
        plain(renderCard("model:a/model", done).text),
        /┌─ DEGRADED: a\/model ─/,
    );
});

test("each AI line keeps the colour its card had when it was written", () => {
    const done = opened({ closedAt: 181 * MIN, pinged: true });
    const { text } = renderCard("model:a/model", done, {
        lines: [
            { at: 60 * MIN, text: "Primary weak.", color: 0xef9f27 },
            { at: 90 * MIN, text: "Worse.", color: 0xd85a30 },
            { at: 181 * MIN, text: "Closed.", color: 0x639922 },
        ],
    });
    assert.match(
        text,
        /🟡 <t:3600:t> Primary weak\.\n🟠 <t:5400:t> Worse\.\n🟢 <t:10860:t> Closed\./,
    );
});

test("infrastructure cards follow the same life and stay red when closed", () => {
    const gen = { kind: "GEN_DOWN", openedAt: 0, info: { kind: "GEN_DOWN" } };
    const open = renderCard("gen", gen, { now: 0 });
    assert.equal(open.color, 0xe24b4a);
    assert.match(plain(open.text), /┌─ DOWN: gen Worker ─/);
    const closed = renderCard("gen", { ...gen, closedAt: 7 * MIN });
    // No request counts: it keeps its status, and red.
    assert.match(plain(closed.text), /┌─ DOWN: gen Worker ─/);
    assert.equal(closed.color, 0xe24b4a);
    assert.equal(closed.text.split("\n").at(-1), "### ⏱️ 7 min");
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

test("the box title carries the status and full model id, in the card's colour", () => {
    const longest = "inferenceport-ai/lightning-image-turbo";
    const { text, color } = renderCard(`model:${longest}`, opened(), {
        now: 60 * MIN,
    });
    const lines = text.split("\n");
    assert.equal(lines[0], "```ansi");
    // The side-bar orange, 0xd85a30, as an RGB text colour around the title.
    assert.equal(color, 0xd85a30);
    assert.ok(
        lines[1].startsWith(
            `┌─ \u001b[38;2;216;90;48mDEGRADED: ${longest}\u001b[0m ─`,
        ),
    );
    // The colour codes take no width: every visible line is as wide.
    const visible = (l) => [...plain(l)].length;
    const box = lines.filter((l) => /^[│┌└]/.test(l));
    for (const line of box) assert.equal(visible(line), visible(box[0]));
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
    assert.equal(open.color, 0xe24b4a);
    assert.match(open.text, /QUEST POLLEN RESTRICTED: domain farm\.com/);
    assert.match(open.text, /31 in 24h/);
    assert.match(open.text, /2026-10-31 00:00 UTC/);
    assert.match(open.text, /spending frozen; Paid usable/);
    const ended = renderCard("signup:farm.com", r.actions[0].incident);
    assert.match(ended.text, /ENDED: domain farm\.com/);
    assert.match(ended.text, /LASTED +2 min/);
    assert.equal(ended.color, 0x639922);
});

test("a burst card says the domain is held and shows how to release it", () => {
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
    assert.match(card("held"), /QUEST POLLEN RESTRICTED: domain farm\.com/);
    assert.match(card("held"), /spending frozen; Paid usable/);
    assert.match(
        card("held"),
        /kv key put --binding SETUP_HOLDS --env production --remote 'release:farm\.com' released/,
    );
    assert.match(card("released"), /RELEASED: domain farm\.com/);
    assert.match(card("released"), /released by a maintainer/);
    assert.doesNotMatch(card("released"), /kv key put/);
});

test("release commands clear existing accounts and reject unsafe domains", () => {
    const commands = releaseCommands("farm.com").join("\n");
    assert.match(commands, /release:farm\.com/);
    assert.match(commands, /UPDATE user SET quest_pollen_restricted = 0/);
    assert.match(commands, /lower\(email\) LIKE '%@farm\.com'/);
    assert.match(commands, /lower\(email\) LIKE '%\.farm\.com'/);
    assert.doesNotMatch(
        releaseCommands("a';rm -rf ~;'.com").join("\n"),
        /rm -rf/,
    );
});

test("heartbeat stays quiet while infra-watch checks", () => {
    const r = heartbeat({}, 1000 * MIN, 1002 * MIN);
    assert.equal(r.post, undefined);
    assert.equal(r.edit, undefined);
    assert.deepEqual(r.state, {});
});

test("heartbeat opens one card with a ping when checks stop, then waits", () => {
    const last = 1000 * MIN;
    const r = heartbeat({}, last, last + STALE_MS);
    assert.equal(r.post.ping, true);
    assert.equal(r.post.color, 0xe24b4a);
    assert.match(r.post.text, /DOWN: infra-watch/);
    assert.match(r.post.text, /no completed check for 10\+ min/);
    // "open since" counts from the last completed check, live in Discord.
    assert.match(r.post.text, new RegExp(`open since <t:${last / 1000}:R>`));
    // No reminders: hours later, still nothing new while the card is open.
    const open = { incident: { ...r.state.incident, messageId: "m1" } };
    const later = heartbeat(open, last, last + 5 * 60 * MIN);
    assert.equal(later.post, undefined);
    assert.equal(later.edit, undefined);
    assert.deepEqual(later.state, open);
});

test("heartbeat says so when /health doesn't answer at all", () => {
    const r = heartbeat({}, null, 5000 * MIN);
    assert.equal(r.post.ping, true);
    assert.match(r.post.text, /\/health unreachable/);
    assert.equal(r.state.incident.openedAt, 5000 * MIN);
});

test("heartbeat closes the same card when checks resume", () => {
    const last = 1000 * MIN;
    const { state } = heartbeat({}, last, last + STALE_MS);
    const open = { incident: { ...state.incident, messageId: "m1" } };
    const r = heartbeat(open, last + 47 * MIN, last + 48 * MIN);
    assert.equal(r.post, undefined);
    assert.equal(r.edit.id, "m1");
    assert.equal(r.edit.card.color, 0xe24b4a);
    assert.equal(r.edit.card.ping, true);
    assert.match(plain(r.edit.card.text), /DOWN: infra-watch/);
    assert.equal(r.edit.card.text.split("\n").at(-1), "### ⏱️ 47 min");
    assert.doesNotMatch(r.edit.card.text, /open since/);
    assert.deepEqual(r.state, {});
});

// --- legacy bridges ----------------------------------------------------------

// A pipe row, as live on 2026-10-31: the text bridge's last hour and medians.
const bridge = (extra = {}) => ({
    bridge: "text",
    last_hour_requests: 10515,
    last_hour_success: 90.3,
    median_requests: 10790,
    median_success: 97.4,
    last_hour_top_error: [400],
    degraded: 0,
    ...extra,
});

test("a legacy bridge is down when the pipe says so, then judged by its old medians", () => {
    assert.deepEqual(legacyDown([bridge()]), {});
    const down = bridge({ last_hour_requests: 40, degraded: 1 });
    const found = legacyDown([down]);
    assert.equal(found["legacy:text"].kind, "LEGACY_DOWN");
    const { state } = step({}, found, 1000 * MIN);
    // Days later the outage is its own median, so the pipe no longer says
    // degraded: against the medians it started with, it still is.
    const later = bridge({
        last_hour_requests: 40,
        median_requests: 60,
        degraded: 0,
    });
    const still = legacyDown([later], state.open)["legacy:text"];
    assert.equal(still.median_requests, 10790);
    // No traffic in the whole window drops the row: still down.
    assert.deepEqual(Object.keys(legacyDown([], state.open)), ["legacy:text"]);
    // Back above half of those medians: recovered.
    const back = bridge({ last_hour_requests: 5400, median_requests: 60 });
    assert.deepEqual(legacyDown([back], state.open), {});
});

test("a legacy bridge card gives the last hour against its medians and pings", () => {
    const found = legacyDown([
        bridge({
            last_hour_success: 12.5,
            last_hour_top_error: [402],
            degraded: 1,
        }),
    ]);
    const { state } = step({}, found, 1000 * MIN);
    const card = renderCard("legacy:text", state.open["legacy:text"], {
        now: 1000 * MIN,
    });
    assert.equal(card.ping, true);
    assert.equal(card.color, 0xd85a30);
    const text = plain(card.text);
    assert.match(text, /DEGRADED: legacy text bridge/);
    assert.match(text, /REQS {4}10515 last hour, median 10790/);
    assert.match(text, /FINAL {3}12\.5% last hour, median 97\.4%/);
    assert.match(text, /WHY {5}top error 402/);
    // Requests down, success fine: no top error to blame.
    const quiet = legacyDown([bridge({ last_hour_requests: 40, degraded: 1 })]);
    const opened = step({}, quiet, 1000 * MIN).state.open["legacy:text"];
    assert.doesNotMatch(renderCard("legacy:text", opened).text, /WHY/);
});
