import assert from "node:assert/strict";
import test from "node:test";
import timers from "node:timers/promises";
import { readBilledUsage } from "./billing.mjs";

const end = Math.floor(Date.now() / 1000) * 1000 - 60000;
const iso = (time) => new Date(time).toISOString();
const row = (id, time = end - 1000, cost = 0.001) => ({
    timestamp: iso(time).replace("T", " ").slice(0, 19),
    cursor_event_id: id,
    cost_usd: cost,
});
const response = (usage) => ({
    ok: true,
    json: async () => ({ usage, count: usage.length }),
});

test("stable pagination includes tied timestamps and returns aggregates only", async () => {
    const page = Array.from({ length: 1000 }, (_, index) =>
        row(String(2000 - index).padStart(4, "0")),
    );
    const urls = [];
    const result = await readBilledUsage(
        "test-key",
        iso(end - 10000),
        iso(end),
        async (url, options) => {
            urls.push(new URL(url));
            assert.equal(options.headers.Authorization, "Bearer test-key");
            assert.equal(options.redirect, "error");
            assert.ok(options.signal instanceof AbortSignal);
            return response(
                urls.length === 1
                    ? page
                    : [
                          row("1000", end - 1000, 0.5),
                          row("0999", end - 11000, 99),
                      ],
            );
        },
    );
    assert.equal(urls.length, 2);
    assert.equal(urls[0].searchParams.get("days"), "7");
    assert.equal(urls[0].searchParams.get("limit"), "1000");
    assert.equal(urls[1].searchParams.get("before"), iso(end - 1000));
    assert.equal(urls[1].searchParams.get("before_event_id"), "1001");
    assert.deepEqual(Object.keys(result), [
        "observedAt",
        "through",
        "requests",
        "pollen",
    ]);
    assert.equal(result.requests, 1001);
    assert.ok(Math.abs(result.pollen - 1.5) < 1e-12);
    assert.equal(result.through, iso(end));
});

test("partial seconds and timezone offsets safely include boundary spending", async () => {
    const start = end - 2000 + 500;
    const offsetStart = new Date(start + 19800000)
        .toISOString()
        .replace("Z", "+05:30");
    const result = await readBilledUsage(
        "test-key",
        offsetStart,
        iso(end + 500),
        async (url) => {
            assert.equal(
                new URL(url).searchParams.get("before"),
                iso(end + 1000),
            );
            return response([
                row("c", end, 1),
                row("b", end - 2000, 2),
                row("a", end - 3000, 8),
            ]);
        },
    );
    assert.equal(result.requests, 2);
    assert.equal(result.pollen, 3);
});

test("HTTP and transport failures never expose credential or body", async () => {
    for (const fetch of [
        async () => ({ ok: false, json: async () => ({ secret: "private" }) }),
        async () => {
            throw new Error("private test-key");
        },
    ]) {
        await assert.rejects(
            readBilledUsage("test-key", iso(end - 2000), iso(end), fetch),
            /^Error: Billing usage request failed$/,
        );
    }
});

test("transient billing failures recover through the shared retry path", async (t) => {
    const delays = [];
    t.mock.method(timers, "setTimeout", async (delay) => delays.push(delay));
    let attempts = 0;
    const result = await readBilledUsage(
        "test-key",
        iso(end - 2000),
        iso(end),
        async () => {
            attempts++;
            if (attempts === 1) {
                return {
                    ok: false,
                    status: 503,
                    headers: new Headers(),
                    json: async () => assert.fail("Unexpected JSON read"),
                };
            }
            return response([row("a")]);
        },
    );
    assert.equal(attempts, 2);
    assert.deepEqual(delays, [2000]);
    assert.equal(result.requests, 1);
    assert.equal(result.pollen, 0.001);
});

test("exhausted transient billing failures stay sanitized", async (t) => {
    const delays = [];
    t.mock.method(timers, "setTimeout", async (delay) => delays.push(delay));
    let attempts = 0;
    await assert.rejects(
        readBilledUsage("private-key", iso(end - 2000), iso(end), async () => {
            attempts++;
            return {
                ok: false,
                status: 429,
                headers: new Headers({ "retry-after": "0" }),
                json: async () => assert.fail("Unexpected JSON read"),
            };
        }),
        /^Error: Billing usage request failed$/,
    );
    assert.equal(attempts, 3);
    assert.deepEqual(delays, [2000, 4000]);
});

test("invalid billing JSON is not retried", async () => {
    let attempts = 0;
    await assert.rejects(
        readBilledUsage("test-key", iso(end - 2000), iso(end), async () => {
            attempts++;
            return {
                ok: true,
                status: 200,
                headers: new Headers(),
                json: async () => {
                    throw new SyntaxError("private malformed billing body");
                },
            };
        }),
        /^Error: Billing usage request failed$/,
    );
    assert.equal(attempts, 1);
});

test("malformed costs, timestamps, identifiers, ordering, and schemas fail closed", async () => {
    const samples = [
        [row("a", end, 1)],
        [row("a", end - 1000, -1)],
        [row("a", end - 1000, Infinity)],
        [{ ...row("a"), cost_usd: "1" }],
        [{ ...row("a"), timestamp: "2026-02-30 12:00:00" }],
        [{ ...row("a"), timestamp: "2026-01-01T12:00:00" }],
        [{ ...row("a"), cursor_event_id: "" }],
        [row("a"), row("a")],
        [row("a"), row("b")],
    ];
    for (const usage of samples) {
        await assert.rejects(
            readBilledUsage("test-key", iso(end - 2000), iso(end), async () =>
                response(usage),
            ),
            /Invalid billing/,
        );
    }
    for (const data of [
        { usage: [], count: 1 },
        { usage: null, count: 0 },
        { usage: Array(1001).fill(row("a")), count: 1001 },
    ]) {
        await assert.rejects(
            readBilledUsage(
                "test-key",
                iso(end - 2000),
                iso(end),
                async () => ({ ok: true, json: async () => data }),
            ),
            /Invalid billing usage response/,
        );
    }
});

test("repeating pages and cursors reject rather than double-count", async () => {
    const page = Array.from({ length: 1000 }, (_, index) =>
        row(String(2000 - index).padStart(4, "0")),
    );
    await assert.rejects(
        readBilledUsage("test-key", iso(end - 2000), iso(end), async () =>
            response(page),
        ),
        /Invalid billing usage row or cursor/,
    );
});

test("exact boundary includes start, excludes end, and empty history returns zero", async () => {
    const result = await readBilledUsage(
        "test-key",
        iso(end - 2000),
        iso(end),
        async () =>
            response([row("b", end - 1000, 1), row("a", end - 2000, 2)]),
    );
    assert.equal(result.requests, 2);
    assert.equal(result.pollen, 3);
    const empty = await readBilledUsage(
        "test-key",
        iso(end - 2000),
        iso(end),
        async () => response([]),
    );
    assert.equal(empty.requests, 0);
    assert.equal(empty.pollen, 0);
});

test("pagination has a finite limit and fails without a partial aggregate", async () => {
    let pages = 0;
    await assert.rejects(
        readBilledUsage("test-key", iso(end - 2000), iso(end), async () => {
            const page = Array.from({ length: 1000 }, (_, index) =>
                row(String(100000 - pages * 1000 - index).padStart(6, "0")),
            );
            pages++;
            return response(page);
        }),
        /pagination limit reached/,
    );
    assert.equal(pages, 20);
});

test("windows outside supported history and ambiguous dates reject before fetch", async () => {
    for (const [start, through] of [
        [iso(Date.now() - 8 * 86400000), iso(end)],
        [iso(end + 1), iso(end)],
        ["2026-01-01T12:00:00", iso(end)],
        [iso(end), iso(Date.now() + 60000)],
    ]) {
        await assert.rejects(
            readBilledUsage("test-key", start, through, async () => {
                assert.fail("Unexpected request");
            }),
            /Invalid billing/,
        );
    }
});
