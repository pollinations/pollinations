import { env, evictDurableObject, runInDurableObject } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DAILY_LIMIT } from "./investigate.js";
import { CHECKING, RECOVER_CHECKS } from "./rules.js";

const GREEN = 0x639922;
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
    if (url.pathname === "/models")
        return Response.json([{ name: "a/model" }, { name: "b/model" }]);
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
    if (url.pathname.endsWith("/infra_watch_errors.json"))
        return Response.json({ data: [] });
    if (url.pathname === "/v1/chat/completions") {
        await world.aiGate;
        await sleep(world.aiDelay);
        world.answers++;
        return Response.json({
            choices: [{ message: { content: `Line ${world.answers}.` } }],
        });
    }
    throw new Error(`unexpected fetch ${url}`);
}

beforeEach(() => {
    world = {
        rows: [],
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
    const green = card.findIndex((w) => w.color === GREEN);
    expect(green).toBeGreaterThan(-1);
    expect(card.slice(green).every((w) => w.color === GREEN)).toBe(true);
    expect(card.at(-1).text).toContain("RECOVERED");
    expect(card.at(-1).text).toContain("Line 1.");
});

it("keeps a card green when a late line lands while another closes", async () => {
    const stub = watch();
    world.rows = [row(10, 40), row(10, 40, "b/model")];
    // The opening lines stay on their way until the first card turns green.
    let release;
    world.aiGate = new Promise((resolve) => {
        release = resolve;
    });
    world.seen = (w) =>
        w.path.endsWith("/m1") && w.color === GREEN && release();
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
        const green = card.findIndex((w) => w.color === GREEN);
        expect(green).toBeGreaterThan(-1);
        expect(card.slice(green).every((w) => w.color === GREEN)).toBe(true);
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
    expect(edits("m1").at(-1).color).toBe(GREEN);

    await evictDurableObject(stub);
    world.rows = BAD;
    await stub.check();
    await settle(stub);
    const card = edits("m1");
    const green = card.findIndex((w) => w.color === GREEN);
    expect(card.slice(green).every((w) => w.color === GREEN)).toBe(true);
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
    world.fails = (w) => w.color === GREEN && !w.text.includes(CHECKING);
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
    expect(last.color).toBe(GREEN);
    expect(last.text).not.toContain(CHECKING);
    expect(last.text).toContain("Line 2.");

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
