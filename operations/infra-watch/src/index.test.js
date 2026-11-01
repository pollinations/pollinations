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
    PURCHASED_SQL,
    releaseDomainSql,
    restrictDomain,
    restrictionCandidatesSql,
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
    if (init.method === "DELETE") {
        const write = { method: "DELETE", path: url.pathname, text: "" };
        write.ok = !world.fails(write);
        world.writes.push(write);
        return new Response(null, { status: write.ok ? 204 : 503 });
    }
    const { content, embeds, allowed_mentions } = JSON.parse(init.body);
    const write = {
        method: init.method,
        path: url.pathname,
        color: embeds[0].color,
        text: embeds[0].description,
        content,
        users: allowed_mentions.users,
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
    if (url.pathname === "/models/status") {
        const regular = url.searchParams.get("traffic") === "regular";
        return Response.json({ data: regular ? world.regular : world.rows });
    }
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
                    failing_callers: world.failingCallers,
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
    // A probe: streamed chat, or an image.
    if (
        url.pathname.startsWith("/v1/images/") ||
        (url.pathname === "/v1/chat/completions" &&
            JSON.parse(init.body).stream)
    ) {
        const body = JSON.parse(init.body);
        world.probes.push(`${url.pathname} ${body.model}`);
        return world.probe(url.pathname, body);
    }
    if (url.pathname === "/v1/chat/completions") {
        const { messages } = JSON.parse(init.body);
        // The community agent answers with its posts.
        if (
            messages[0].content.startsWith(
                "You write the Pollinations community",
            )
        ) {
            const facts = JSON.parse(messages[1].content);
            world.agentFacts.push(facts);
            world.agentKeys.push(init.headers.authorization);
            const content = JSON.stringify(world.agent(facts));
            return Response.json({ choices: [{ message: { content } }] });
        }
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
        regular: [],
        probes: [],
        agentFacts: [],
        agentKeys: [],
        agent: () => ({ community: null, maintainers: null }),
        legacy: [],
        legacyReads: 0,
        catalog: [{ name: "a/model" }, { name: "b/model" }],
        signups: [],
        aiGate: null,
        aiDelay: 0,
        tinybirdDelay: 0,
        failingCallers: 3,
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
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

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

// A card opened with one failing caller, then several fail, read on the
// next check. `also` runs in the object first, e.g. to break its storage.
const worsen = async (stub, also = () => {}) => {
    world.rows = BAD;
    world.failingCallers = 1;
    await stub.check();
    await settle(stub);
    world.failingCallers = 3;
    await runInDurableObject(stub, async (_, state) => {
        const saved = await state.storage.get("state");
        saved.open[KEY].enriched.at = 0;
        await state.storage.put("state", saved);
        also(state);
    });
};
const posted = () => world.writes.filter((w) => w.ok && w.method === "POST");
const deleted = () =>
    world.writes
        .filter((w) => w.ok && w.method === "DELETE")
        .map((w) => w.path.split("/").at(-1));

it("moves a worsened card to the bottom with its ping and lines", async () => {
    const stub = watch();
    await worsen(stub);
    await stub.check();
    await settle(stub);

    const posts = posted();
    expect(posts).toHaveLength(2);
    expect(posts[0].users).toEqual([]);
    expect(posts[1].users).toHaveLength(2);
    expect(posts[1].text).toContain("Line 1.");
    expect((await stored(stub, "state")).open[KEY].messageId).toBe("m2");
    expect((await stored(stub, "lines:m2")).lines).toHaveLength(1);
    // The next check deletes the old card, then its lines.
    await stub.check();
    expect(deleted()).toEqual(["m1"]);
    expect(await stored(stub, "lines:m1")).toBeUndefined();
});

it("tries a failed delete of a moved card again", async () => {
    const stub = watch();
    await worsen(stub);
    await stub.check();
    world.fails = (w) => w.method === "DELETE";
    await stub.check();
    expect(await stored(stub, "lines:m1")).toBeDefined();
    world.fails = () => false;
    await stub.check();
    expect(deleted()).toEqual(["m1"]);
    expect(await stored(stub, "lines:m1")).toBeUndefined();
});

it("pings a worsened card once when its post has no readable receipt", async () => {
    const stub = watch();
    await worsen(stub);
    world.receipt = false;
    await checks(stub, 3);
    await settle(stub);
    expect(posted()).toHaveLength(2);
    expect((await stored(stub, "state")).open[KEY].messageId).toBe("m1");
});

it("keeps a worsened card's lines when the move's save fails", async () => {
    const stub = watch();
    // The check that moves the card fails to save its state.
    await worsen(stub, (state) => {
        const put = state.storage.put.bind(state.storage);
        state.storage.put = async (key, value) => {
            if (key === "state") throw new Error("storage unavailable");
            return put(key, value);
        };
    });
    const failure = await stub.check().catch((error) => error);
    expect(failure.message).toContain("storage unavailable");

    await evictDurableObject(stub);
    await checks(stub, 2);
    await settle(stub);
    // The old card stayed until a move was saved, and the saved one carries
    // its line. The card the failed save left behind goes, then the old one.
    expect(posted().at(-1).text).toContain("Line 1.");
    expect((await stored(stub, "state")).open[KEY].messageId).toBe("m3");
    expect((await stored(stub, "lines:m3")).lines).toHaveLength(1);
    expect(deleted()).toEqual(["m2", "m1"]);
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

const SINCE = 1_793_404_800;
const BURST = [{ domain: "farm.com", accounts: 31, since: SINCE }];

it("restricts domain accounts once, preserves approvals and purchases, and leaves balances intact", async () => {
    const plan = await env.DB.prepare(
        `EXPLAIN QUERY PLAN SELECT id, ${PURCHASED_SQL} FROM user`,
    ).all();
    // Each correlated purchase lookup must seek this user, not all paid invoices.
    expect(
        plan.results.filter(({ detail }) => detail.includes("user_id=?")),
    ).toHaveLength(3);
    // The sweep reads accounts made since the burst, never the whole table.
    const sweep = await env.DB.prepare(
        `EXPLAIN QUERY PLAN ${restrictionCandidatesSql("cohort.test", SINCE)}`,
    ).all();
    expect(sweep.results.map(({ detail }) => detail).join()).toContain(
        "USING INDEX idx_user_created_at (created_at>?)",
    );
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
        ["at-start", "at-start@cohort.test", null, SINCE],
        ["before-start", "before-start@cohort.test", null, SINCE - 1],
    ];
    await env.DB.batch(
        accounts.map(([id, email, restricted, createdAt = SINCE + 60]) =>
            env.DB.prepare(
                "INSERT INTO user (id, name, email, created_at, updated_at, tier_balance, pack_balance, quest_pollen_restricted) VALUES (?, ?, ?, ?, 1, 5, 3, ?)",
            ).bind(id, id, email, createdAt, restricted),
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
    await restrictDomain(env.DB, env.SETUP_HOLDS, "cohort.test", SINCE);
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
        "at-start": 1,
        "before-start": null,
    });
    expect(
        results.every((r) => r.tier_balance === 5 && r.pack_balance === 3),
    ).toBe(true);

    // A clear is permanent even while the domain keeps producing signups.
    await env.DB.prepare(
        "UPDATE user SET quest_pollen_restricted = 0 WHERE id = 'farm'",
    ).run();
    await env.DB.prepare(
        `INSERT INTO user (id, name, email, created_at, updated_at) VALUES ('late', 'late', 'late@cohort.test', ${SINCE + 120}, 1)`,
    ).run();
    await restrictDomain(env.DB, env.SETUP_HOLDS, "cohort.test", SINCE);
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
        await env.DB.prepare(
            "SELECT count(*) AS n FROM user WHERE quest_pollen_restricted = 1",
        ).first("n"),
    ).toBe(0);
    expect(() =>
        restrictionCandidatesSql("cohort.test'; DROP TABLE user", SINCE),
    ).toThrow("Invalid signup domain");
    expect(() => restrictionCandidatesSql("cohort.test", "0 OR 1")).toThrow(
        "burst start",
    );
    expect(() => restrictionSql([])).toThrow("1–200 user IDs");
    expect(() => restrictionSql(Array(201).fill("farm"))).toThrow(
        "1–200 user IDs",
    );
});

it("sweeps each new domain sequentially in bounded batches, then once after KV propagation", async () => {
    const stub = watch();
    world.rows = OK;
    world.signups = ["sweep-a.test", "sweep-b.test"].map((domain) => ({
        domain,
        accounts: 201,
        since: SINCE,
    }));
    await env.DB.prepare(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<201)
        INSERT INTO user (id, name, email, created_at, updated_at)
        SELECT 'sweep-'||x, 'sweep', x||'@sweep-a.test', ${SINCE}, 1 FROM n`).run();
    await env.DB.prepare(
        `INSERT INTO user (id, name, email, created_at, updated_at) VALUES ('sweep-b', 'sweep', 'a@sweep-b.test', ${SINCE}, 1), ('sweep-old', 'old', 'old@sweep-a.test', ${SINCE - 1}, 1)`,
    ).run();
    const queries = [];
    await runInDurableObject(stub, (instance) => {
        const prepare = instance.env.DB.prepare.bind(instance.env.DB);
        vi.spyOn(instance.env.DB, "prepare").mockImplementation((sql) => {
            queries.push(sql);
            return prepare(sql);
        });
    });
    const before = Date.now();
    await stub.check();
    // A second domain cannot start reading while the first is still updating.
    expect(queries.map((sql) => sql.split(" ")[0])).toEqual([
        "SELECT",
        "UPDATE",
        "UPDATE",
        "SELECT",
        "UPDATE",
    ]);
    expect(queries[0]).toContain("sweep-a.test");
    expect(queries[3]).toContain("sweep-b.test");
    const pending = await stored(stub, "quest-sweeps");
    expect(Object.keys(pending)).toHaveLength(2);
    expect(pending["sweep-a.test"].followup).toBe(false);
    expect(pending["sweep-a.test"].since).toBe(SINCE);
    expect(pending["sweep-a.test"].dueAt).toBeGreaterThanOrEqual(
        before + 120_000,
    );
    await checks(stub, 3);
    expect(queries).toHaveLength(5);
    expect(
        await env.DB.prepare(
            "SELECT count(*) AS n FROM user WHERE email LIKE '%@sweep-a.test' AND quest_pollen_restricted = 1",
        ).first("n"),
    ).toBe(201);

    await env.DB.prepare(
        "UPDATE user SET quest_pollen_restricted = 0 WHERE id = 'sweep-1'",
    ).run();
    await env.DB.prepare(
        `INSERT INTO user (id, name, email, created_at, updated_at) VALUES ('sweep-late', 'late', 'late@sweep-a.test', ${SINCE + 600}, 1)`,
    ).run();
    await runInDurableObject(stub, async (_, state) => {
        for (const sweep of Object.values(pending)) sweep.dueAt = 0;
        await state.storage.put("quest-sweeps", pending);
    });
    // The follow-up survives a restart.
    vi.restoreAllMocks();
    await evictDurableObject(stub);
    queries.length = 0;
    await runInDurableObject(stub, (instance) => {
        const prepare = instance.env.DB.prepare.bind(instance.env.DB);
        vi.spyOn(instance.env.DB, "prepare").mockImplementation((sql) => {
            queries.push(sql);
            return prepare(sql);
        });
    });
    // The rolling window now starts later; the follow-up keeps the saved start.
    world.signups = [
        { domain: "sweep-a.test", accounts: 201, since: SINCE + 3600 },
    ];
    await stub.check();
    expect(queries.map((sql) => sql.split(" ")[0])).toEqual([
        "SELECT",
        "UPDATE",
        "SELECT",
    ]);
    expect(
        await env.DB.prepare(
            "SELECT quest_pollen_restricted FROM user WHERE id = 'sweep-old'",
        ).first("quest_pollen_restricted"),
    ).toBeNull();
    expect(await stored(stub, "quest-sweeps")).toEqual({});
    expect(
        await env.DB.prepare(
            "SELECT quest_pollen_restricted FROM user WHERE id = 'sweep-late'",
        ).first("quest_pollen_restricted"),
    ).toBe(1);
    expect(
        await env.DB.prepare(
            "SELECT quest_pollen_restricted FROM user WHERE id = 'sweep-1'",
        ).first("quest_pollen_restricted"),
    ).toBe(0);
    const done = queries.length;
    world.signups = [
        { domain: "sweep-a.test", accounts: 201, since: 1_793_404_800 },
    ];
    await checks(stub, 3);
    expect(queries).toHaveLength(done);
    expect(await stored(stub, "quest-sweeps")).toEqual({});
});

it("posts signup cards during D1 failures and retries persisted work after the burst ends", async () => {
    const stub = watch();
    world.rows = OK;
    world.signups = [
        { domain: "retry.test", accounts: 31, since: 1_793_404_800 },
    ];
    await env.DB.prepare(
        `INSERT INTO user (id, name, email, created_at, updated_at) VALUES ('retry', 'retry', 'a@retry.test', ${SINCE}, 1)`,
    ).run();
    await runInDurableObject(stub, (instance) => {
        vi.spyOn(instance.env.DB, "prepare").mockImplementation(() => {
            throw new Error("D1 unavailable");
        });
    });
    await stub.check();
    expect(
        world.writes.some(
            (w) => w.ok && w.text.includes("restriction pending; Paid usable"),
        ),
    ).toBe(true);
    expect((await stored(stub, "quest-sweeps"))["retry.test"].followup).toBe(
        true,
    );
    expect(await stored(stub, "checkedAt")).toBeDefined();
    vi.restoreAllMocks();
    await evictDurableObject(stub);
    world.signups = [];
    await stub.check();
    expect(
        await env.DB.prepare(
            "SELECT quest_pollen_restricted FROM user WHERE id = 'retry'",
        ).first("quest_pollen_restricted"),
    ).toBe(1);
    const pending = await stored(stub, "quest-sweeps");
    expect(pending["retry.test"].followup).toBe(false);
    await runInDurableObject(stub, async (_, state) => {
        pending["retry.test"].dueAt = 0;
        await state.storage.put("quest-sweeps", pending);
    });
    await stub.check();
    expect(await stored(stub, "quest-sweeps")).toEqual({});
});

it("cancels released-domain sweeps without overwriting account decisions", async () => {
    const stub = watch();
    world.rows = OK;
    world.signups = [
        { domain: "released.test", accounts: 31, since: 1_793_404_800 },
    ];
    await env.DB.prepare(
        "INSERT INTO user (id, name, email, created_at, updated_at) VALUES ('released', 'released', 'a@released.test', 1, 1)",
    ).run();
    await stub.check();
    await env.SETUP_HOLDS.put("release:released.test", "released");
    await env.DB.prepare(releaseDomainSql("released.test")).run();
    // A subsequent maintainer restriction is independent of the domain release.
    await env.DB.prepare(
        "UPDATE user SET quest_pollen_restricted = 1 WHERE id = 'released'",
    ).run();
    await runInDurableObject(stub, async (_, state) => {
        const pending = await state.storage.get("quest-sweeps");
        pending["released.test"].dueAt = 0;
        await state.storage.put("quest-sweeps", pending);
    });
    await stub.check();
    expect(await stored(stub, "quest-sweeps")).toEqual({});
    expect(
        await env.DB.prepare(
            "SELECT quest_pollen_restricted FROM user WHERE id = 'released'",
        ).first("quest_pollen_restricted"),
    ).toBe(1);
    expect(edits("m1").at(-1).text).toContain("released by a maintainer");
    await env.SETUP_HOLDS.put("release:pre-released.test", "released");
    world.signups = [
        { domain: "pre-released.test", accounts: 31, since: 1_793_404_800 },
    ];
    await stub.check();
    expect(await stored(stub, "quest-sweeps")).toEqual({});
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
    expect((await stored(stub, "state")).reviewsRetired).toBe(false);
    expect(await stored(stub, "checkedAt")).toBeDefined();
    world.fails = () => false;
    await stub.check();
    expect(edits("old-review").at(-1).text).toContain("REVIEW CLOSED");
    expect((await stored(stub, "state")).open).toEqual({});
    expect(await stored(stub, "lines:old-review")).toBeUndefined();
    expect(world.answers).toBe(0);
    expect((await stored(stub, "state")).reviewsRetired).toBe(true);
    await runInDurableObject(stub, (instance) => {
        vi.spyOn(instance, "retireReviews").mockImplementation(() => {
            throw new Error("completed retirement must not run again");
        });
    });
    await stub.check();
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

// A community text model in gen's catalog.
const community = (name, extra) => ({
    name,
    community: true,
    category: "text",
    ...extra,
});
// Each text model answers its probe's marker, naming the `reported` model
// if given; streams of the `broken` models never end. Image models answer an
// image.
const answers = (broken, reported) => (path, body) => {
    if (path !== "/v1/chat/completions")
        return Response.json({ data: [{ b64_json: btoa("x".repeat(200)) }] });
    const marker = body.messages[0].content.split(": ")[1];
    const answer = `data: ${JSON.stringify({ model: reported, choices: [{ delta: { content: marker } }] })}\n\n`;
    const done = broken(body.model) ? "" : "data: [DONE]\n\n";
    return new Response(answer + done, {
        headers: { "x-model-used": body.model },
    });
};
// A check, and the community cycle it started.
const cycled = async (stub) => {
    await stub.check();
    await runInDurableObject(stub, (instance) => instance.cycle);
};
// Half an hour on, with every saved time `ms` further back: each model's
// backoff and quiet periods.
const later = (stub, ms) =>
    runInDurableObject(stub, async (_, state) => {
        const saved = await state.storage.get("community");
        saved.at -= 30 * 60_000;
        for (const s of Object.values(saved.schedule)) s.lastAt -= ms;
        for (const key of Object.keys(saved.quiet)) saved.quiet[key] -= ms;
        await state.storage.put("community", saved);
    });
const COMMUNITY = "/api/webhooks/2/y";
const INFRA = "/api/webhooks/1/x";
const posts = (path) =>
    world.writes.filter((w) => w.ok && w.method === "POST" && w.path === path);
const MAINTAINERS = "<@304378879705874432> <@884468469452656732>";
const OWNER_O = "<@123456789012345678>";
// The agent tells every incident it gets, or only those `pick` keeps, one
// line each.
const tells =
    (pick = () => true) =>
    ({ incidents }) => {
        const lines = (to) =>
            incidents
                .filter((i) => i.to === to && pick(i))
                .map((i) => ({ incidents: [i.id], text: `${to}: ${i.id}` }));
        return {
            community: lines("community"),
            maintainers: lines("maintainers"),
        };
    };
const HOURS = (n) => n * 60 * 60_000;

it("probes due models by Thomas's rule, and calls the agent only with incidents, through its own key", async () => {
    const stub = watch();
    world.catalog = [
        { name: "a/model", category: "text" },
        community("community/o/broken"),
        community("community/p/busy", { health: { success_rate: 100 } }),
        community("community/o/agent", { agent: true }),
    ];
    world.regular = [
        {
            model: "community/p/busy",
            is_rollup: 1,
            total_requests: 30,
            status_2xx: 30,
            errors_4xx: 0,
            errors_5xx: 0,
        },
    ];
    world.probe = answers(() => true);
    world.agent = tells();
    // A first broken stream: probed, nothing to tell yet.
    await cycled(stub);
    expect(world.probes).toEqual(["/v1/chat/completions community/o/broken"]);
    expect(world.agentFacts).toHaveLength(0);

    // The second in a row, after the backoff: one incident for its owner.
    await later(stub, HOURS(8));
    await cycled(stub);
    expect(world.agentKeys).toEqual(["Bearer agent-test"]);
    expect(world.agentFacts[0].incidents).toEqual([
        {
            id: "1",
            kind: "stream",
            to: "community",
            model: "community/o/broken",
            error: "stream is missing [DONE]",
        },
    ]);
    const [told] = posts(COMMUNITY);
    expect(told.content).toBe(OWNER_O);
    expect(told.text).toMatch(
        /^```ansi\n┌─ .*COMMUNITY MODEL BROKEN: PUBLISHER'S ENDPOINT[\s\S]*│ MODEL {3}o\/broken +│[\s\S]*\n```\ncommunity: 1\n\nPublishers see .*My Models/,
    );

    // Told: quiet for a day, so no call even once it breaks again.
    await later(stub, HOURS(16));
    await cycled(stub);
    expect(world.probes).toHaveLength(3);
    expect(world.agentFacts).toHaveLength(1);
});

it("starts quiet periods only for incidents in a delivered post; the rest stay pending", async () => {
    const stub = watch();
    world.catalog = [community("community/o/a"), community("community/p/b")];
    world.probe = answers(() => true);
    await cycled(stub);
    await later(stub, HOURS(8));
    // Both broke twice; the agent tells only o/a.
    world.agent = tells((i) => i.model === "community/o/a");
    await cycled(stub);
    expect(world.agentFacts[0].incidents.map((i) => i.model)).toEqual([
        "community/o/a",
        "community/p/b",
    ]);
    // p/b is still pending; Discord refuses the post telling it.
    world.agent = tells();
    world.fails = (w) => w.path === COMMUNITY;
    await later(stub, 0);
    await cycled(stub);
    expect(world.agentFacts[1].incidents.map((i) => i.model)).toEqual([
        "community/p/b",
    ]);
    // Still pending, and told once Discord takes it.
    world.fails = () => false;
    await later(stub, 0);
    await cycled(stub);
    expect(world.agentFacts[2].incidents.map((i) => i.model)).toEqual([
        "community/p/b",
    ]);
    await later(stub, 0);
    await cycled(stub);
    expect(world.agentFacts).toHaveLength(3);
}, 15_000);

it("sends a stream broken for three owners' working models at once to the maintainers, pinging no owner", async () => {
    const stub = watch();
    world.catalog = ["community/a/x", "community/b/y", "community/c/z"].map(
        (n) => community(n),
    );
    world.probe = answers(() => false);
    world.agent = tells();
    await cycled(stub);
    // Working, then 4 hours on all three break the same way.
    world.probe = answers(() => true);
    await later(stub, HOURS(4));
    await cycled(stub);
    expect(world.agentFacts[0].incidents).toEqual([
        {
            id: "1",
            kind: "shared",
            to: "maintainers",
            error: "stream is missing [DONE]",
            models: ["community/a/x", "community/b/y", "community/c/z"],
        },
    ]);
    const [told] = posts(INFRA).filter((w) =>
        w.text.includes("COMMUNITY MODELS: LIKELY A GEN PROBLEM"),
    );
    expect(told.content).toBe(MAINTAINERS);
    expect(posts(COMMUNITY)).toHaveLength(0);
});

it("tells the day's listing changes once, moving the saved set only once they are delivered", async () => {
    const stub = watch();
    const model = (name, success_rate) =>
        community(name, { health: { success_rate } });
    world.probe = answers(() => false);
    world.catalog = [model("community/o/a", 40), model("community/o/b", 95)];
    world.shown = [model("community/o/b", 95)];
    // The first day only saves the set.
    await cycled(stub);
    expect((await stored(stub, "listings")).filtered).toEqual([
        "community/o/a",
    ]);

    // The next day a recovers and b gets filtered; the agent leaves it out.
    world.catalog = [model("community/o/a", 90), model("community/o/b", 30)];
    world.shown = [model("community/o/a", 90)];
    await runInDurableObject(stub, async (_, state) => {
        const saved = await state.storage.get("listings");
        await state.storage.put("listings", { ...saved, day: "2000-01-01" });
    });
    world.agent = () => ({ community: [], maintainers: [] });
    await later(stub, 0);
    await cycled(stub);
    expect(world.agentFacts.at(-1).incidents).toEqual([
        {
            id: "1",
            kind: "listings",
            to: "community",
            filtered: 1,
            newly: [{ model: "community/o/b", health: 30 }],
            back: [{ model: "community/o/a", health: 90 }],
        },
    ]);
    expect((await stored(stub, "listings")).day).toBe("2000-01-01");

    // Told the next cycle: the set moves on, and it isn't told again.
    world.agent = tells();
    await later(stub, 0);
    await cycled(stub);
    expect((await stored(stub, "listings")).filtered).toEqual([
        "community/o/b",
    ]);
    const calls = world.agentFacts.length;
    await later(stub, 0);
    await cycled(stub);
    expect(world.agentFacts).toHaveLength(calls);
    // Listings ping no one.
    expect(posts(COMMUNITY).at(-1).content).toBe("");
});

it("keeps a shared failure the maintainers didn't get as gen's, past 4 hours and without new probes", async () => {
    const stub = watch();
    world.catalog = ["community/a/x", "community/b/y", "community/c/z"].map(
        (n) => community(n),
    );
    world.probe = answers(() => false);
    world.agent = tells();
    await cycled(stub);
    world.probe = answers(() => true);
    world.fails = (w) => w.path === INFRA;
    await later(stub, HOURS(4));
    await cycled(stub);
    // 5 hours on, before their backoff ends: still one incident for the
    // maintainers, none for the owners.
    world.fails = () => false;
    await later(stub, HOURS(5));
    await cycled(stub);
    expect(world.probes).toHaveLength(6);
    expect(world.agentFacts[1].incidents.map((i) => i.kind)).toEqual([
        "shared",
    ]);
    expect(posts(COMMUNITY)).toHaveLength(0);
}, 15_000);

it("keeps a refused fallback notice after its rescues leave the 4-hour window", async () => {
    const stub = watch();
    const leaning = "community/o/leaning";
    world.catalog = [community(leaning), community("community/o/fallback")];
    world.regular = [
        { model: leaning, is_rollup: 1, status_2xx: 40, fallback_rescues: 30 },
        {
            model: leaning,
            is_rollup: 0,
            fallback_used: true,
            model_used: "community/o/fallback",
            fallback_rescues: 30,
        },
    ];
    world.probe = answers(() => false);
    world.agent = tells();
    world.fails = (w) => w.path === COMMUNITY;
    await cycled(stub);
    // The rescues are out of the window; the notice is still pending, and
    // told once Discord takes it.
    world.regular = [];
    world.fails = () => false;
    await later(stub, 0);
    await cycled(stub);
    expect(world.agentFacts[1].incidents).toMatchObject([
        {
            kind: "fallback",
            model: leaning,
            snapshots: [{ rescued: 30, successes: 40 }],
        },
    ]);
    expect(posts(COMMUNITY)).toHaveLength(1);
    await later(stub, 0);
    await cycled(stub);
    expect(world.agentFacts).toHaveLength(2);
}, 15_000);

// Owner o's text proxies in D1, each asking its upstream for
// gemini-3-flash.
const proxies = (names, visibility = "public") =>
    env.DB.batch([
        env.DB.prepare(
            "INSERT OR IGNORE INTO user (id, name, email, github_username, created_at, updated_at) VALUES ('owner-o', 'o', 'o@owner.test', 'o', 1, 1)",
        ),
        ...names.map((name) =>
            env.DB.prepare(
                "INSERT OR REPLACE INTO community_endpoint (id, owner_user_id, name, title, base_url, upstream_model, visibility) VALUES (?, 'owner-o', ?, ?, 'https://upstream.test', 'gemini-3-flash', ?)",
            ).bind(name, name, name, visibility),
        ),
    ]);
const runs = async (stub) => (await stored(stub, "community")).served;

it("compares only fresh probes of listed proxies that answered themselves with a model name", async () => {
    const stub = watch();
    let clock = Date.UTC(2026, 10, 1, 10, 5);
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    await proxies(["m", "fallback", "anonymous", "unnamed"]);
    world.catalog = ["m", "fallback", "anonymous", "unnamed", "unlisted"].map(
        (name) => community(`community/o/${name}`),
    );
    world.probe = (path, body) => {
        const name = body.model.split("/").pop();
        const response = answers(
            () => false,
            name === "unnamed" ? undefined : "llama-3.1-8b",
        )(path, body);
        if (name === "fallback")
            response.headers.set("x-model-used", "community/o/other");
        if (name === "anonymous") response.headers.delete("x-model-used");
        return response;
    };
    await cycled(stub);
    expect(await runs(stub)).toEqual({
        "community/o/m": {
            declared: "gemini-3-flash",
            served: "llama-3.1-8b",
            id: expect.any(String),
            streak: 1,
        },
    });
    // Half an hour on, no probe is due: a saved probe never counts again.
    clock += 30 * 60_000;
    await cycled(stub);
    expect((await runs(stub))["community/o/m"].streak).toBe(1);
    clock += HOURS(4);
    await cycled(stub);
    expect((await runs(stub))["community/o/m"].streak).toBe(2);
});

// A public registration is stored private with its publication queued; gen
// lists it once that takes effect three hours on, and the stored row still
// says private. Gen's catalog decides; infra-watch never reads visibility.
it("checks a newly published proxy once gen lists it, and tells nothing before", async () => {
    const stub = watch();
    const queued = Date.UTC(2026, 10, 1, 10, 5);
    let clock = queued + HOURS(1);
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    await proxies(["new"], "private");
    world.probe = answers(() => false, "llama-3.1-8b");
    world.agent = tells();
    // Within the delay gen doesn't list it: never probed, nothing told.
    world.catalog = [];
    await cycled(stub);
    expect(world.probes).toEqual([]);
    expect(await runs(stub)).toEqual({});
    // Listed from three hours on: two probes in a row, then told.
    clock = queued + HOURS(3);
    world.catalog = [community("community/o/new")];
    await cycled(stub);
    clock += HOURS(4);
    await cycled(stub);
    expect(world.probes).toEqual([
        "/v1/chat/completions community/o/new",
        "/v1/chat/completions community/o/new",
    ]);
    expect(posts(COMMUNITY).map((p) => p.content)).toEqual([OWNER_O]);
});

it("tells a served-model mismatch to its owner once due, however long delivery fails, and again only on a new probe", async () => {
    const stub = watch();
    let clock = Date.UTC(2026, 10, 1, 10, 5);
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    await proxies(["m"]);
    world.catalog = [community("community/o/m")];
    world.probe = answers(() => false, "llama-3.1-8b");
    world.agent = tells();
    // Two probes in a row report another name while Discord is down.
    world.fails = () => true;
    await cycled(stub);
    clock += HOURS(4);
    await cycled(stub);
    expect(posts(COMMUNITY)).toHaveLength(0);
    // Eight days on, busy and healthy so never probed since, it is still
    // due.
    world.fails = () => false;
    world.regular = [row(40, 40, "community/o/m")];
    clock += HOURS(8 * 24);
    await cycled(stub);
    expect(world.agentFacts.at(-1).incidents).toEqual([
        {
            id: "1",
            kind: "mismatch",
            to: "community",
            model: "community/o/m",
            declared: "gemini-3-flash",
            served: "llama-3.1-8b",
        },
    ]);
    expect(posts(COMMUNITY).map((p) => p.content)).toEqual([OWNER_O]);
    // After its quiet week it is told again only once a new probe reports it.
    clock += HOURS(8 * 24);
    await cycled(stub);
    expect(posts(COMMUNITY)).toHaveLength(1);
    world.regular = [];
    clock += HOURS(1);
    await cycled(stub);
    expect(posts(COMMUNITY)).toHaveLength(2);
});
