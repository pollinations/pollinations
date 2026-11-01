import { env, evictDurableObject, runInDurableObject } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DAILY_LIMIT } from "./investigate.js";
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
        if (regular) world.regularReads++;
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
    if (url.pathname.includes("/infra_watch_review_"))
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
        await world.aiGate;
        await sleep(world.aiDelay);
        world.answers++;
        // A review answers as a verdict; any other alert with a plain line.
        const { messages } = JSON.parse(init.body);
        const review = messages[0].content.startsWith("You review");
        const content = `${review ? "APPROVE: " : ""}Line ${world.answers}.`;
        return Response.json({ choices: [{ message: { content } }] });
    }
    throw new Error(`unexpected fetch ${url}`);
}

beforeEach(() => {
    world = {
        rows: [],
        regular: [],
        regularReads: 0,
        probes: [],
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
    expect(posts[0].text).toContain("SETUP QUESTS LIMITED: domain farm.com");
    expect(edits("m1").at(-1).text).toContain("ENDED: domain farm.com");
    expect((await stored(stub, "state")).unposted).toEqual({});
});

it("a review card lists the oldest requests, follows decisions and closes", async () => {
    const stub = watch();
    world.rows = OK;
    const now = Date.now();
    for (let i = 0; i < 7; i++)
        await env.SETUP_HOLDS.put(`review:u${i}`, "pending", {
            metadata: {
                domain: "farm.com",
                requestedAt: now + i,
                createdAt: now,
                rewards: 1,
                rewardPollen: 0.25,
            },
        });
    await env.SETUP_HOLDS.put("decision:u6", "declined");
    await env.SETUP_HOLDS.put("hold:farm.com", "held");
    await stub.check();
    await settle(stub);

    const opened = world.writes.find((w) => w.ok && w.method === "POST");
    expect(opened.text).toContain("REVIEW: domain farm.com");
    expect(opened.text).toContain("6 accounts");
    expect(opened.text).not.toContain("decision:u6");
    // The AI's verdict lands on the card.
    expect(edits("m1").at(-1).text).toContain("APPROVE: Line 1.");

    // Each decision changes the accounts listed: the old verdict goes, and
    // the AI looks again, however many rounds it takes.
    for (let i = 0; i < 4; i++) {
        await env.SETUP_HOLDS.put(`decision:u${i}`, "approved");
        await stub.check();
        await settle(stub);
        const card = edits("m1").at(-1).text;
        expect(card).not.toContain(`Line ${i + 1}.`);
        expect(card).toContain(`APPROVE: Line ${i + 2}.`);
    }
    expect(edits("m1").at(-1).text).toContain("'decision:u5' approved");

    for (let i = 4; i < 6; i++)
        await env.SETUP_HOLDS.put(`decision:u${i}`, "declined");
    await stub.check();
    await settle(stub);
    const last = edits("m1").at(-1);
    expect(last.color).toBe(GREEN);
    expect(last.text).toContain("DECIDED: domain farm.com");
    expect(world.writes.filter((w) => w.method === "POST")).toHaveLength(1);
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

it("a review the daily budget skipped is investigated once the budget resets", async () => {
    const stub = watch();
    world.rows = OK;
    await env.SETUP_HOLDS.put("hold:budget.com", "held");
    await env.SETUP_HOLDS.put("review:b0", "pending", {
        metadata: {
            domain: "budget.com",
            requestedAt: Date.now(),
            createdAt: Date.now(),
            rewards: 1,
            rewardPollen: 0.25,
        },
    });
    const budget = (day) =>
        runInDurableObject(stub, (_, state) =>
            state.storage.put("ai", { day, count: DAILY_LIMIT }),
        );
    await budget(new Date().toISOString().slice(0, 10));
    await stub.check();
    await settle(stub);
    expect(world.answers).toBe(0);
    expect(world.writes.some((w) => w.text.includes("APPROVE"))).toBe(false);

    // A new day: the next check asks for the missing verdict.
    await budget("2000-01-01");
    await stub.check();
    await settle(stub);
    expect(edits("m1").at(-1).text).toContain("APPROVE: Line 1.");
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
    expect(told()[0].text).toContain("FALLBACK: o/leaning");
    expect(told()[0].text).toContain("VIA     o/fallback (30)");
    // Its owner is pinged.
    expect(told()[0].content).toBe("<@123456789012345678>");
    expect(told()[0].users).toEqual(["123456789012345678"]);

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
    // Listing changes ping no one.
    expect(told()[0].content).toBe("");
    expect(told()[0].users).toEqual([]);
});

// A community text model in gen's catalog.
const community = (name, extra) => ({
    name,
    community: true,
    category: "text",
    ...extra,
});
// Each text model answers its probe's marker; streams of the `broken`
// models never end. Image models answer an image.
const answers = (broken) => (path, body) => {
    if (path !== "/v1/chat/completions")
        return Response.json({ data: [{ b64_json: btoa("x".repeat(200)) }] });
    const marker = body.messages[0].content.split(": ")[1];
    const answer = `data: ${JSON.stringify({ choices: [{ delta: { content: marker } }] })}\n\n`;
    const done = broken(body.model) ? "" : "data: [DONE]\n\n";
    return new Response(answer + done, {
        headers: { "x-model-used": body.model },
    });
};
// A check, and the probe batch it started.
const probed = async (stub) => {
    await stub.check();
    await runInDurableObject(stub, (instance) => instance.probing);
};
// Half an hour on, with each model's backoff, and when each was told, `ms`
// further along.
const later = (stub, ms) =>
    runInDurableObject(stub, async (_, state) => {
        const saved = await state.storage.get("probes");
        saved.at -= 30 * 60_000;
        for (const s of Object.values(saved.schedule)) s.lastAt -= ms;
        const told = saved.streams?.told ?? {};
        for (const key of Object.keys(told)) told[key] -= ms;
        await state.storage.put("probes", saved);
    });
// The posts Discord accepted in the community channel.
const communityPosts = () =>
    world.writes.filter(
        (w) => w.ok && w.path === "/api/webhooks/2/y" && w.method === "POST",
    );

it("probes due community models half-hourly and tells a broken stream once a day, pinging its owner", async () => {
    const stub = watch();
    const model = community;
    world.catalog = [
        { name: "a/model", category: "text" },
        model("community/o/broken", { health: { success_rate: 40 } }),
        model("community/o/quiet"),
        model("community/o/busy", { health: { success_rate: 100 } }),
        model("community/o/agent", { agent: true }),
        model("community/p/image", {
            category: "image",
            input_modalities: ["text", "image"],
        }),
    ];
    world.regular = ["community/o/broken", "community/o/busy"].map((m) => ({
        model: m,
        is_rollup: 1,
        total_requests: 30,
        status_2xx: 30,
        errors_4xx: 0,
        errors_5xx: 0,
    }));
    world.probe = answers((m) => m === "community/o/broken");
    const told = communityPosts;

    await probed(stub);
    // The weak model, the one without real traffic, and the image model,
    // with an edit first.
    expect(world.probes.sort()).toEqual([
        "/v1/chat/completions community/o/broken",
        "/v1/chat/completions community/o/quiet",
        "/v1/images/edits community/p/image",
    ]);
    expect(told()).toHaveLength(0);
    // Checked again within the half hour: not even looked for.
    await probed(stub);
    expect(world.probes).toHaveLength(3);
    expect(world.regularReads).toBe(1);

    // 8 hours on: all are due, the image model generates, and the second
    // broken stream in a row is told, pinging its owner.
    world.probes = [];
    await later(stub, 8 * 60 * 60_000);
    await probed(stub);
    expect(world.probes.sort()).toEqual([
        "/v1/chat/completions community/o/broken",
        "/v1/chat/completions community/o/quiet",
        "/v1/images/generations community/p/image",
    ]);
    expect(told()).toHaveLength(1);
    expect(told()[0].text).toContain("BROKEN STREAM");
    expect(told()[0].text).toContain("o/broken");
    expect(told()[0].text).toContain("stream is missing [DONE]");
    expect(told()[0].text).not.toContain("o/quiet");
    expect(told()[0].content).toBe("<@123456789012345678>");
    expect(told()[0].users).toEqual(["123456789012345678"]);

    // Still broken on its next probe, within the day: quiet.
    world.probes = [];
    await later(stub, 16 * 60 * 60_000);
    await probed(stub);
    expect(world.probes).toContain("/v1/chat/completions community/o/broken");
    expect(told()).toHaveLength(1);
    // None reached the infra-watch channel.
    const infra = world.writes.filter((w) => w.path === "/api/webhooks/1/x");
    expect(infra.some((w) => w.text.includes("BROKEN"))).toBe(false);

    // A model gone from the catalog keeps its backoff for when it is back.
    const [broken] = world.catalog.filter(
        (m) => m.name === "community/o/broken",
    );
    world.catalog = world.catalog.filter((m) => m !== broken);
    await later(stub, 0);
    await probed(stub);
    const { schedule } = await stored(stub, "probes");
    expect(schedule["community/o/broken"].failures).toBe(3);
    // Gone for over a week, longer than any backoff: forgotten.
    await later(stub, 7 * 24 * 60 * 60_000);
    await probed(stub);
    const after = await stored(stub, "probes");
    expect(after.schedule["community/o/broken"]).toBeUndefined();
    expect(after.schedule["community/o/quiet"]).toBeDefined();
    expect(Object.keys(after.streams.told)).toEqual([]);
    expect(after.streams.streaks["community/o/broken"]).toBeUndefined();
});

it("names as many broken streams as a card fits, and the rest after their next probe", async () => {
    const stub = watch();
    const names = Array.from({ length: 60 }, (_, i) => `community/o/m${i}`);
    world.catalog = names.map((name) => community(name));
    world.probe = answers(() => true);
    await probed(stub);
    await later(stub, 8 * 60 * 60_000);
    await probed(stub);
    const [first] = communityPosts();
    expect(first.text.length).toBeLessThanOrEqual(4096);
    const named = names.filter((n) => first.text.includes(`${n.slice(10)} `));
    expect(named.length).toBeGreaterThan(0);
    expect(first.text).toContain(`…and ${60 - named.length} more`);

    // On their next probe, those it named stay quiet and the rest are told.
    await later(stub, 16 * 60 * 60_000);
    await probed(stub);
    const [, second] = communityPosts();
    expect(second.text).toContain(`${names.at(-1).slice(10)} `);
    for (const n of named) expect(second.text).not.toContain(`${n.slice(10)} `);
});

it("names the broken streams told longest ago first once their quiet day is over", async () => {
    const stub = watch();
    // More than two cards hold.
    const names = Array.from({ length: 120 }, (_, i) => `community/o/m${i}`);
    world.catalog = names.map((name) => community(name));
    world.probe = answers(() => true);
    const named = (post) =>
        names.filter((n) => post.text.includes(`${n.slice(10)} `));
    // The real backoff probes them at hours 0, 8, 24 and 56.
    await probed(stub);
    await later(stub, 8 * 60 * 60_000);
    await probed(stub);
    await later(stub, 16 * 60 * 60_000);
    await probed(stub);
    const [first, second] = communityPosts().map(named);
    const never = names.filter(
        (n) => !first.includes(n) && !second.includes(n),
    );
    expect(never.length).toBeGreaterThan(0);

    // Hour 55, a check with none due: both quiet days are over. Hour 56:
    // all are due again, and those never named come first.
    await later(stub, 31 * 60 * 60_000);
    await probed(stub);
    expect(communityPosts()).toHaveLength(2);
    await later(stub, 60 * 60_000);
    await probed(stub);
    const third = named(communityPosts()[2]);
    for (const n of never) expect(third).toContain(n);
});

// Posts Discord accepted in the infra-watch channel that contain `text`.
const infraPosts = (text) =>
    world.writes.filter(
        (w) =>
            w.ok &&
            w.path === "/api/webhooks/1/x" &&
            w.method === "POST" &&
            w.text.includes(text),
    );
const MAINTAINER_PING = "<@304378879705874432> <@884468469452656732>";

it("tells the maintainers, not the owners, when one stream breaks for three owners", async () => {
    const stub = watch();
    world.catalog = ["community/a/x", "community/b/y", "community/c/z"].map(
        (name) => community(name),
    );
    world.probe = answers(() => true);
    await probed(stub);
    const [card] = infraPosts("BROKEN STREAM");
    expect(card.content).toBe(MAINTAINER_PING);
    expect(card.text).toContain("no owner was pinged");
    // Their second in a row, within the day, with only two owners probed:
    // no owner is told either.
    world.catalog = world.catalog.slice(0, 2);
    await later(stub, 8 * 60 * 60_000);
    await probed(stub);
    expect(infraPosts("BROKEN STREAM")).toHaveLength(1);
    expect(communityPosts()).toHaveLength(0);
});

it("tells the maintainers once a day when gen turns every probe away, leaving the backoff", async () => {
    const stub = watch();
    world.catalog = [
        community("community/o/text"),
        community("community/o/image", { category: "image" }),
    ];
    // Gen's balance notice for chat, a 402 for images.
    const notice = () =>
        new Response(
            `data: ${JSON.stringify({ choices: [{ delta: { content: "Please top up.\n\nIf this isn’t your Pollinations account, contact whoever runs the app or service you’re using." } }] })}\n\ndata: [DONE]\n\n`,
        );
    // First only the text model's own upstream answers with a notice: not
    // the probe key, so no card.
    world.probe = (path, body) =>
        path === "/v1/chat/completions"
            ? notice()
            : answers(() => false)(path, body);
    await probed(stub);
    expect(infraPosts("PROBES REFUSED")).toHaveLength(0);
    world.probe = (path) =>
        path === "/v1/chat/completions"
            ? notice()
            : Response.json({ error: {} }, { status: 402 });
    await later(stub, 4 * 60 * 60_000);
    await probed(stub);
    const [card] = infraPosts("PROBES REFUSED");
    expect(card.content).toBe(MAINTAINER_PING);
    expect(card.text).toContain("2 of 2 turned away");
    // Their failures stay as they were, and the interval runs from these
    // probes: half an hour on, neither is probed again.
    const { schedule } = await stored(stub, "probes");
    expect(schedule["community/o/text"].failures).toBe(0);
    expect(schedule["community/o/image"].failures).toBe(0);
    world.probes = [];
    await later(stub, 0);
    await probed(stub);
    expect(world.probes).toHaveLength(0);
    // 4 hours on both are, but the card is told only once a day.
    await later(stub, 4 * 60 * 60_000);
    await probed(stub);
    expect(world.probes).toHaveLength(2);
    expect(infraPosts("PROBES REFUSED")).toHaveLength(1);
    expect(communityPosts()).toHaveLength(0);
});

it("names every broken stream a card had no room for on the next ones, each once a day", async () => {
    const stub = watch();
    const HOUR = 60 * 60_000;
    // 60 owners' models, each breaking every time: one incident for the
    // maintainers, probed on the real backoff (hours 0, 8, 24, 56).
    const names = Array.from({ length: 60 }, (_, i) => `owner${i}/model`);
    world.catalog = names.map((n) => community(`community/${n}`));
    world.probe = answers(() => true);
    const named = new Map(names.map((n) => [n, []]));
    for (let hour = 0; hour <= 56; hour += 4) {
        const before = world.writes.length;
        await probed(stub);
        for (const card of world.writes.slice(before)) {
            if (!card.ok || !card.text.includes("BROKEN STREAM")) continue;
            expect(card.text.length).toBeLessThanOrEqual(4096);
            for (const n of names)
                if (card.text.includes(`${n} `)) named.get(n).push(hour);
        }
        await later(stub, 4 * HOUR);
    }
    const first = [...named.values()].filter((hours) => hours[0] === 0);
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThan(60);
    for (const [n, hours] of named) {
        // Each named, and never twice within a day.
        expect(hours.length, n).toBeGreaterThan(0);
        for (let i = 1; i < hours.length; i++)
            expect(hours[i] - hours[i - 1], n).toBeGreaterThanOrEqual(24);
    }
    // All within the first day's checks, over more than one card.
    const firsts = [...named.values()].map((hours) => hours[0]);
    expect(Math.max(...firsts)).toBeLessThanOrEqual(24);
    expect(new Set(firsts).size).toBeGreaterThan(1);
});

it("drains a backlog of broken streams longer than a week, each named once a day", async () => {
    const stub = watch();
    const HOUR = 60 * 60_000;
    // 200 owners' models breaking every time, probed on the real backoff:
    // hours 0, 8, 24, 56, 120, 248, then every 144 hours. Long names, so a
    // card holds about 25.
    const names = Array.from(
        { length: 200 },
        (_, i) => `owner${i}/model-with-a-long-name-so-fewer-fit-on-one-card`,
    );
    world.catalog = names.map((n) => community(`community/${n}`));
    world.probe = answers(() => true);
    const named = new Map(names.map((n) => [n, []]));
    for (let hour = 0; hour <= 968; hour += 8) {
        const before = world.writes.length;
        await probed(stub);
        for (const card of world.writes.slice(before)) {
            if (!card.ok || !card.text.includes("BROKEN STREAM")) continue;
            expect(card.text.length).toBeLessThanOrEqual(4096);
            for (const n of names)
                if (card.text.includes(`${n} `)) named.get(n).push(hour);
        }
        await later(stub, 8 * HOUR);
    }
    for (const [n, hours] of named) {
        // Each named, and never twice within a day.
        expect(hours.length, n).toBeGreaterThan(0);
        for (let i = 1; i < hours.length; i++)
            expect(hours[i] - hours[i - 1], n).toBeGreaterThanOrEqual(24);
    }
    // Some only after the first week.
    expect(Math.max(...[...named.values()].map((h) => h[0]))).toBeGreaterThan(
        7 * 24,
    );
});
