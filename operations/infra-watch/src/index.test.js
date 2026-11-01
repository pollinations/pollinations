import {
    applyD1Migrations,
    env,
    evictDurableObject,
    runInDurableObject,
} from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { DAILY_LIMIT } from "./investigate.js";
import {
    holdDomains,
    releaseDomainSql,
    restrictionPreviewSql,
    restrictionSql,
} from "./quest-restrictions.js";
import { CHECKING, RECOVER_CHECKS } from "./rules.js";

const GREEN = 0x639922;
// A closed outage card: it ends with its summary.
const over = (w) => w.text.includes("### ⏱️");
const KEY = "model:a/model";
const row = (ok, total, model = "a/model") => ({
    model,
    is_rollup: 1,
    total_requests: total,
    status_2xx: ok,
    errors_4xx: 0,
    retried_503s: 0,
    fallback_rescues: 0,
});
const BAD = [row(10, 40)];
const OK = [row(40, 40)];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The outside world as each test sets it: gen's status rows, how long the AI
// and Tinybird take, and how Discord answers. Every Discord write is
// recorded, and `seen` hears each one Discord accepts.
let world;

async function discord(url, init) {
    const { embeds } = JSON.parse(init.body);
    const write = {
        method: init.method,
        path: url.pathname,
        color: embeds[0].color,
        text: embeds[0].description,
    };
    await sleep(world.delay(write));
    write.ok = !world.fails(write);
    world.writes.push(write);
    if (!write.ok) return new Response("unavailable", { status: 503 });
    world.seen(write);
    if (init.method === "PATCH") return Response.json({});
    world.posts++;
    if (!world.receipt) return new Response("saved");
    return Response.json({ id: `m${world.posts}`, channel_id: "c1" });
}

async function fake(input, init = {}) {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "discord.test") return discord(url, init);
    if (url.pathname === "/") return new Response("ok");
    if (url.pathname === "/models/status")
        return Response.json({ data: world.rows });
    // The full catalog, or the default listing without filtered models.
    if (url.pathname === "/models")
        return Response.json(
            url.searchParams.has("reliability")
                ? world.catalog
                : (world.shown ?? world.catalog),
        );
    if (url.pathname.endsWith("/infra_watch_callers.json")) {
        await sleep(world.tinybirdDelay);
        return Response.json({
            data: [
                {
                    requests: 40,
                    failures: 30,
                    callers: 3,
                    failing_callers: 3,
                    top_caller_failures: 12,
                },
            ],
        });
    }
    if (url.pathname.endsWith("/infra_watch_legacy.json")) {
        world.legacyReads++;
        return world.legacy
            ? Response.json({ data: world.legacy })
            : new Response("unavailable", { status: 503 });
    }
    if (url.pathname.endsWith("/infra_watch_errors.json"))
        return Response.json({ data: [] });
    if (url.pathname.endsWith("/infra_watch_signups.json"))
        return world.signups
            ? Response.json({ data: world.signups })
            : new Response("unavailable", { status: 503 });
    if (url.pathname === "/v1/chat/completions") {
        await world.aiGate;
        await sleep(world.aiDelay);
        world.answers++;
        const content = `Line ${world.answers}.`;
        return Response.json({ choices: [{ message: { content } }] });
    }
    throw new Error(`unexpected fetch ${url}`);
}

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));

beforeEach(() => {
    world = {
        rows: [],
        legacy: [],
        legacyReads: 0,
        catalog: [{ name: "a/model" }, { name: "b/model" }],
        signups: [],
        aiGate: null,
        aiDelay: 0,
        tinybirdDelay: 0,
        receipt: true,
        fails: () => false,
        delay: () => 0,
        seen: () => {},
        writes: [],
        posts: 0,
        answers: 0,
    };
    vi.stubGlobal("fetch", fake);
});
afterEach(() => vi.unstubAllGlobals());

const watch = () => env.WATCH.get(env.WATCH.idFromName(crypto.randomUUID()));
const checks = async (stub, n) => {
    for (let i = 0; i < n; i++) await stub.check();
};
// Waits for the AI lines and card edits still running in the background.
const settle = (stub) =>
    runInDurableObject(stub, async (instance) => {
        await instance.background(async () => {});
        await instance.writes(async () => {});
    });
const stored = (stub, key) =>
    runInDurableObject(stub, (_, state) => state.storage.get(key));
// The edits Discord accepted for one card, in order.
const edits = (id) =>
    world.writes.filter(
        (w) => w.ok && w.method === "PATCH" && w.path.endsWith(`/${id}`),
    );

it("never edits a closed card back to open", async () => {
    const stub = watch();
    world.rows = BAD;
    world.aiDelay = 50;
    // The opening line's edit is slow: still on its way when the card closes.
    let slowed = false;
    world.delay = (w) => {
        if (slowed || !w.text.includes("Line 1.")) return 0;
        slowed = true;
        return 500;
    };
    await stub.check();
    await sleep(150);
    world.rows = OK;
    await checks(stub, RECOVER_CHECKS);
    await settle(stub);

    const card = edits("m1");
    const closed = card.findIndex(over);
    expect(closed).toBeGreaterThan(-1);
    expect(card.slice(closed).every(over)).toBe(true);
    expect(card.at(-1).text).toContain("Line 1.");
});

it("keeps a card green when a late line lands while another closes", async () => {
    const stub = watch();
    world.rows = [row(10, 40), row(10, 40, "b/model")];
    // The opening lines stay on their way until the first card closes.
    let release;
    world.aiGate = new Promise((resolve) => {
        release = resolve;
    });
    world.seen = (w) => w.path.endsWith("/m1") && over(w) && release();
    await stub.check();
    // No budget left for closing lines, so each close is the card's last
    // edit; the second close's slow Tinybird read lets the first card's late
    // line land before the check saves its state.
    await runInDurableObject(stub, (_, state) =>
        state.storage.put("ai", {
            day: new Date().toISOString().slice(0, 10),
            count: DAILY_LIMIT,
        }),
    );
    world.tinybirdDelay = 100;
    world.rows = [row(40, 40), row(40, 40, "b/model")];
    await checks(stub, RECOVER_CHECKS);
    await settle(stub);
    await checks(stub, 2);

    for (const id of ["m1", "m2"]) {
        const card = edits(id);
        const closed = card.findIndex(over);
        expect(closed).toBeGreaterThan(-1);
        expect(card.slice(closed).every(over)).toBe(true);
    }
});

it("opens a new card when a close was edited but never saved", async () => {
    const stub = watch();
    world.rows = BAD;
    await stub.check();
    await settle(stub);
    await runInDurableObject(stub, (_, state) =>
        state.storage.put("ai", {
            day: new Date().toISOString().slice(0, 10),
            count: DAILY_LIMIT,
        }),
    );
    world.rows = OK;
    await checks(stub, RECOVER_CHECKS - 1);
    // The closing check turns the card green, then fails to save its state.
    await runInDurableObject(stub, (_, state) => {
        const put = state.storage.put.bind(state.storage);
        state.storage.put = async (key, value) => {
            if (key === "state") throw new Error("storage unavailable");
            return put(key, value);
        };
    });
    const failure = await stub.check().catch((error) => error);
    expect(failure.message).toContain("storage unavailable");
    expect(over(edits("m1").at(-1))).toBe(true);

    await evictDurableObject(stub);
    world.rows = BAD;
    await stub.check();
    await settle(stub);
    const card = edits("m1");
    expect(card.slice(card.findIndex(over)).every(over)).toBe(true);
    // The new failure got its own card, which says it broke again.
    expect((await stored(stub, "state")).open[KEY].messageId).toBe("m2");
    const posts = world.writes.filter((w) => w.ok && w.method === "POST");
    expect(posts).toHaveLength(2);
    expect(posts[1].text).toContain("AGAIN");
});

it("drops a line lost in a restart instead of checking forever", async () => {
    const stub = watch();
    world.rows = BAD;
    await stub.check();
    await settle(stub);
    // A restart while a line was on its way: the saved flag survives, the
    // task doesn't. The stale text forces the next check to edit the card.
    await runInDurableObject(stub, async (_, state) => {
        const saved = await state.storage.get("state");
        saved.open[KEY].text = "stale";
        await state.storage.put("state", saved);
        await state.storage.put("lines:m1", {
            lines: [],
            pending: true,
            pendingAt: Date.now() - 11 * 60_000,
        });
    });
    await evictDurableObject(stub);
    await stub.check();
    await settle(stub);

    expect(edits("m1").at(-1).text).not.toContain(CHECKING);
});

it("opens a card only with a readable receipt", async () => {
    const stub = watch();
    world.rows = BAD;
    world.receipt = false;
    const first = await stub.check();
    await settle(stub);
    expect(first.failed).toBe(1);
    expect((await stored(stub, "state")).open[KEY]).toBeUndefined();

    world.receipt = true;
    await stub.check();
    await settle(stub);
    expect((await stored(stub, "state")).open[KEY].messageId).toBe("m2");
    expect(world.writes.some((w) => w.path.endsWith("/undefined"))).toBe(false);
});

// Opens and closes a card; Discord takes the green card with "checking why…"
// but not the last edit, with the closing line.
async function closeWithFailedEdit(stub) {
    world.rows = BAD;
    await stub.check();
    await settle(stub);
    world.rows = OK;
    world.fails = (w) => over(w) && !w.text.includes(CHECKING);
    await checks(stub, RECOVER_CHECKS);
    await settle(stub);
}

it("retries a closed card's last edit until Discord takes it", async () => {
    const stub = watch();
    await closeWithFailedEdit(stub);
    expect(edits("m1").at(-1).text).toContain(CHECKING);

    world.fails = () => false;
    await stub.check();
    await settle(stub);
    const last = edits("m1").at(-1);
    // Closed, it keeps its status, in the colour of what it cost: 30 of 40
    // requests failed, red.
    expect(last.color).toBe(0xe24b4a);
    expect(last.text).toContain("DEGRADED: a/model");
    expect(last.text.split("\n").at(-1)).toBe(
        "### ⏱️ under 1 min · 👥 3/3 users hit · 📉 30/40 requests failed (75%)",
    );
    expect(last.text).not.toContain(CHECKING);
    expect(last.text).toContain("Line 2.");
    // The opening line was written while degraded, the closing one closed.
    expect(last.text).toMatch(/🟠 <t:\d+:t> Line 1\.\n🟢 <t:\d+:t> Line 2\./);

    // Delivered: later checks leave the card alone and forget it.
    const count = edits("m1").length;
    await checks(stub, 2);
    expect(edits("m1").length).toBe(count);
    expect(await stored(stub, "lines:m1")).toBeUndefined();
});

it("gives up on a closed card's last edit after a day", async () => {
    const stub = watch();
    await closeWithFailedEdit(stub);
    await runInDurableObject(stub, async (_, state) => {
        const record = await state.storage.get("lines:m1");
        record.closed.incident.closedAt -= 25 * 60 * 60_000;
        await state.storage.put("lines:m1", record);
    });
    const tries = world.writes.length;
    await stub.check();
    expect(world.writes.length).toBe(tries);
    expect(await stored(stub, "lines:m1")).toBeUndefined();
});

const BURST = [{ domain: "farm.com", accounts: 31, since: 1_793_404_800 }];

it("restricts domain accounts once, preserves approvals and purchases, and leaves balances intact", async () => {
    const accounts = [
        ["farm", "a@cohort.test", null],
        ["subdomain", "a@SUB.COHORT.TEST", null],
        ["unrelated", "a@notcohort.test", null],
        ["cleared", "cleared@cohort.test", 0],
        ["approved", "approved@cohort.test", null],
        ["checkout", "checkout@cohort.test", null],
        ["auto", "auto@cohort.test", null],
        ["failed-auto", "failed-auto@cohort.test", null],
        ["polar", "polar@cohort.test", null],
    ];
    await env.DB.batch(
        accounts.map(([id, email, restricted]) =>
            env.DB.prepare(
                "INSERT INTO user (id, name, email, created_at, updated_at, tier_balance, pack_balance, quest_pollen_restricted) VALUES (?, ?, ?, 1, 1, 5, 3, ?)",
            ).bind(id, id, email, restricted),
        ),
    );
    await env.DB.batch([
        env.DB.prepare(
            "INSERT INTO stripe_checkout_credits (session_id, event_id, event_type, user_id, pollen_credited, created_at) VALUES ('checkout', 'checkout', 'checkout.session.completed', 'checkout', 5, 1)",
        ),
        env.DB.prepare(
            "INSERT INTO stripe_auto_top_up_attempt (id, user_id, amount_usd, status, created_at, updated_at) VALUES ('auto', 'auto', 5, 'paid', 1, 1), ('failed-auto', 'failed-auto', 5, 'failed', 1, 1)",
        ),
        env.DB.prepare(
            "INSERT INTO polar_checkout_credits (order_id, event_id, event_type, user_id, pollen_credited, polar_created_at, created_at) VALUES ('polar', 'polar', 'order.paid', 'polar', 5, 1, 1)",
        ),
    ]);
    await env.SETUP_HOLDS.put("decision:approved", "approved");
    expect(
        await env.DB.prepare(
            restrictionPreviewSql("cohort.test", ["approved"]),
        ).first(),
    ).toEqual({
        accounts: 7,
        restricted: 3,
        cleared: 4,
        quest_pollen_to_freeze: 15,
    });
    await holdDomains(env.DB, env.SETUP_HOLDS, [
        { domain: "cohort.test", accounts: 31, since: 1_793_404_800 },
    ]);
    const { results } = await env.DB.prepare(
        "SELECT id, quest_pollen_restricted, tier_balance, pack_balance FROM user",
    ).all();
    expect(
        Object.fromEntries(
            results.map((r) => [r.id, r.quest_pollen_restricted]),
        ),
    ).toEqual({
        farm: 1,
        subdomain: 1,
        unrelated: null,
        cleared: 0,
        approved: 0,
        checkout: 0,
        auto: 0,
        "failed-auto": 1,
        polar: 0,
    });
    expect(
        results.every((r) => r.tier_balance === 5 && r.pack_balance === 3),
    ).toBe(true);

    // A clear is permanent even while the domain keeps producing signups.
    await env.DB.prepare(
        "UPDATE user SET quest_pollen_restricted = 0 WHERE id = 'farm'",
    ).run();
    await env.DB.prepare(
        "INSERT INTO user (id, name, email, created_at, updated_at) VALUES ('late', 'late', 'late@cohort.test', 1, 1)",
    ).run();
    await holdDomains(env.DB, env.SETUP_HOLDS, [
        { domain: "cohort.test", accounts: 31, since: 1_793_404_800 },
    ]);
    expect(
        await env.DB.prepare(
            "SELECT quest_pollen_restricted FROM user WHERE id = 'farm'",
        ).first("quest_pollen_restricted"),
    ).toBe(0);
    expect(
        await env.DB.prepare(
            "SELECT quest_pollen_restricted FROM user WHERE id = 'late'",
        ).first("quest_pollen_restricted"),
    ).toBe(1);

    // A maintainer's release clears existing accounts explicitly. KV only
    // controls detection, so later scans cannot undo an account-level decision.
    await env.SETUP_HOLDS.put("release:cohort.test", "released");
    await env.DB.prepare(releaseDomainSql("cohort.test")).run();
    expect(
        (
            await holdDomains(env.DB, env.SETUP_HOLDS, [
                { domain: "cohort.test", accounts: 31, since: 1_793_404_800 },
            ])
        )[0].hold,
    ).toBe("released");
    expect(
        await env.DB.prepare(
            "SELECT count(*) AS n FROM user WHERE quest_pollen_restricted = 1",
        ).first("n"),
    ).toBe(0);
    await env.DB.prepare(
        "UPDATE user SET quest_pollen_restricted = 1 WHERE id = 'farm'",
    ).run();
    await holdDomains(env.DB, env.SETUP_HOLDS, [
        { domain: "cohort.test", accounts: 31, since: 1_793_404_800 },
    ]);
    expect(
        await env.DB.prepare(
            "SELECT quest_pollen_restricted FROM user WHERE id = 'farm'",
        ).first("quest_pollen_restricted"),
    ).toBe(1);
    expect(() => restrictionSql("cohort.test'; DROP TABLE user")).toThrow(
        "Invalid signup domain",
    );
});

it("keeps a sign-up card open while sign-ups can't be read", async () => {
    const stub = watch();
    world.rows = OK;
    world.signups = BURST;
    await stub.check();
    // No switch: the burst holds its domain at once.
    expect(await env.SETUP_HOLDS.get("hold:farm.com")).toBe("held");
    world.signups = null;
    await checks(stub, 3);
    expect(world.writes.some((w) => w.color === GREEN)).toBe(false);
    world.signups = [];
    await stub.check();
    await settle(stub);

    const card = edits("m1");
    expect(card.at(-1).color).toBe(GREEN);
    expect(card.at(-1).text).toContain("ENDED: domain farm.com");
});

it("posts a sign-up card Discord refused, even after its burst ended", async () => {
    const stub = watch();
    world.rows = OK;
    world.signups = BURST;
    world.fails = (w) => w.method === "POST";
    await stub.check();
    world.signups = [];
    world.fails = () => false;
    await stub.check();
    await stub.check();
    await settle(stub);

    const posts = world.writes.filter((w) => w.ok && w.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0].text).toContain("QUEST POLLEN RESTRICTED: domain farm.com");
    expect(edits("m1").at(-1).text).toContain("ENDED: domain farm.com");
    expect((await stored(stub, "state")).unposted).toEqual({});
});

it("retires saved review cards, retries failed edits, and keeps checking services", async () => {
    const stub = watch();
    world.rows = OK;
    await runInDurableObject(stub, async (_, state) => {
        await state.storage.put("state", {
            open: {
                "review:farm.com": {
                    kind: "REVIEW",
                    messageId: "old-review",
                    info: { domain: "farm.com" },
                },
            },
        });
        await state.storage.put("lines:old-review", { lines: [] });
    });
    world.fails = (w) => w.method === "PATCH";
    await stub.check();
    expect((await stored(stub, "state")).open["review:farm.com"]).toBeDefined();
    expect(await stored(stub, "checkedAt")).toBeDefined();
    world.fails = () => false;
    await stub.check();
    expect(edits("old-review").at(-1).text).toContain("REVIEW CLOSED");
    expect((await stored(stub, "state")).open).toEqual({});
    expect(await stored(stub, "lines:old-review")).toBeUndefined();
    expect(world.answers).toBe(0);
});

it("serves only /health, which reports the last check and never runs one", async () => {
    const get = (path) =>
        exports.default.fetch(`https://infra-watch.test${path}`);
    const checkedAt = async () =>
        (await (await get("/health")).json()).checkedAt;
    expect(await checkedAt()).toBeNull();
    expect(await checkedAt()).toBeNull();
    expect((await get("/")).status).toBe(404);

    world.rows = OK;
    const before = Date.now();
    await env.WATCH.get(env.WATCH.idFromName("main")).check();
    expect(await checkedAt()).toBeGreaterThanOrEqual(before);
});

const TEXT_BRIDGE = {
    bridge: "text",
    last_hour_requests: 40,
    last_hour_success: 90,
    median_requests: 10790,
    median_success: 97.4,
    last_hour_top_error: [],
    degraded: 1,
};

it("a legacy bridge card stays open through a failed read and a missing row, until it recovers", async () => {
    const stub = watch();
    world.rows = OK;
    // The hour's reading, as the reader saved it.
    const reading = (rows, hour = Math.floor(Date.now() / 3_600_000)) =>
        runInDurableObject(stub, (_, state) =>
            state.storage.put("legacy", { hour, rows }),
        );
    const card = async () => {
        await settle(stub);
        const open = (await stored(stub, "state")).open["legacy:text"];
        return open && edits(open.messageId);
    };
    await reading([TEXT_BRIDGE]);
    await stub.check();
    const id = (await stored(stub, "state")).open["legacy:text"].messageId;
    const posted = world.writes.find(
        (w) => w.ok && w.method === "POST" && w.text.includes("legacy"),
    );
    expect(posted.text).toContain("DEGRADED: legacy text bridge");

    // Tinybird fails on a new hour: the last reading stands.
    world.legacy = null;
    await reading([TEXT_BRIDGE], 0);
    await stub.check();
    expect(await card()).toBeTruthy();
    // No traffic in the whole window drops the row: still down.
    await reading([]);
    await stub.check();
    expect(await card()).toBeTruthy();
    // A reading above half its old medians closes it.
    await reading([{ ...TEXT_BRIDGE, last_hour_requests: 10500, degraded: 0 }]);
    await stub.check();
    await settle(stub);
    expect(await card()).toBeUndefined();
    expect(over(edits(id).at(-1))).toBe(true);
});

it("reads the legacy bridges once an hour, from 5 minutes past", async () => {
    const stub = watch();
    world.legacy = [TEXT_BRIDGE];
    const at = (h, m) => Date.UTC(2026, 9, 31, h, m);
    const read = (now) =>
        runInDurableObject(stub, (instance) => instance.legacy(now));
    // Started at 12:01: nothing known until 12:05, when the hour is in.
    expect(await read(at(12, 1))).toBeNull();
    expect(world.legacyReads).toBe(0);
    expect(await read(at(12, 5))).toEqual([TEXT_BRIDGE]);
    expect(await read(at(12, 59))).toEqual([TEXT_BRIDGE]);
    expect(world.legacyReads).toBe(1);
    // 13:00 to 13:04 keep the 12:05 reading.
    world.legacy = [{ ...TEXT_BRIDGE, last_hour_requests: 10500 }];
    expect(await read(at(13, 2))).toEqual([TEXT_BRIDGE]);
    expect(world.legacyReads).toBe(1);
    // A failed 13:05 read keeps it too, and 13:06 tries again.
    const fresh = world.legacy;
    world.legacy = null;
    expect(await read(at(13, 5))).toEqual([TEXT_BRIDGE]);
    world.legacy = fresh;
    expect(await read(at(13, 6))).toEqual(fresh);
    expect(world.legacyReads).toBe(3);
});

it("tells the community channel once a week about a model leaning on its fallback", async () => {
    const stub = watch();
    const model = "community/o/leaning";
    world.catalog = [
        { name: "a/model" },
        { name: model, community: true },
        { name: "community/o/fallback", community: true },
        { name: "community/o/agent", community: true, agent: true },
    ];
    // Each leans on its fallback: 30 of 40 successes rescued.
    world.rows = [model, "community/o/agent"].flatMap((m) => [
        { ...row(40, 40, m), fallback_rescues: 30 },
        {
            ...row(30, 30, m),
            is_rollup: 0,
            fallback_used: true,
            model_used: "community/o/fallback",
            fallback_rescues: 30,
        },
    ]);
    const told = () =>
        world.writes.filter(
            (w) =>
                w.ok && w.path === "/api/webhooks/2/y" && w.method === "POST",
        );
    await checks(stub, 2);
    // One notice, for the listed model only, checked once an hour.
    expect(told()).toHaveLength(1);
    expect(told()[0].text).toContain("MODEL   o/leaning");
    expect(told()[0].text).toContain("VIA     o/fallback (30)");

    const back = (ms) =>
        runInDurableObject(stub, async (_, state) => {
            const saved = await state.storage.get("fallback");
            saved.checkedAt -= ms;
            saved.told[`${model} community/o/fallback`] -= ms;
            await state.storage.put("fallback", saved);
        });
    // An hour later it is still leaning, but was told this week.
    await back(60 * 60_000);
    await stub.check();
    expect(told()).toHaveLength(1);
    // A week on, it is told again.
    await back(7 * 24 * 60 * 60_000);
    await stub.check();
    expect(told()).toHaveLength(2);
    // None reached the infra-watch channel.
    const infra = world.writes.filter((w) => w.path === "/api/webhooks/1/x");
    expect(infra.some((w) => w.text.includes("FALLBACK"))).toBe(false);
});

it("tells the community channel once a day what the listing filter changed", async () => {
    const stub = watch();
    const model = (name, success_rate) => ({
        name,
        community: true,
        health: { success_rate },
    });
    world.catalog = [model("community/o/a", 40), model("community/o/b", 95)];
    world.shown = [model("community/o/b", 95)];
    const told = () =>
        world.writes.filter((w) => w.ok && w.path === "/api/webhooks/2/y");
    await checks(stub, 2);
    // The first day only keeps the filtered set.
    expect(told()).toHaveLength(0);
    expect((await stored(stub, "listings")).filtered).toEqual([
        "community/o/a",
    ]);

    // a recovers and b gets filtered: told once, the next day.
    world.catalog = [model("community/o/a", 90), model("community/o/b", 30)];
    world.shown = [model("community/o/a", 90)];
    await stub.check();
    expect(told()).toHaveLength(0);
    await runInDurableObject(stub, async (_, state) => {
        const saved = await state.storage.get("listings");
        await state.storage.put("listings", { ...saved, day: "2000-01-01" });
    });
    await checks(stub, 2);
    expect(told()).toHaveLength(1);
    expect(told()[0].text).toContain(
        "**Newly filtered**\n`o/b` 30%\n**Back in listings**\n`o/a` 90%",
    );
});
