import assert from "node:assert/strict";
import { test } from "node:test";
import { exclusive, send, settle } from "./delivery.js";

const reply = (status, retryAfter) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => retryAfter },
});
const noSleep = async () => {};

test("send retries 429 and 5xx, then succeeds", async () => {
    const statuses = [429, 500, 204];
    const fetchImpl = async () => reply(statuses.shift(), "0");
    assert.equal(await send("u", {}, { fetchImpl, sleep: noSleep }), true);
});

test("send gives up after 3 failures and on 4xx", async () => {
    let calls = 0;
    const down = async () => {
        calls++;
        return reply(503);
    };
    assert.equal(
        await send("u", {}, { fetchImpl: down, sleep: noSleep }),
        false,
    );
    assert.equal(calls, 3);
    const bad = async () => reply(404);
    assert.equal(
        await send("u", {}, { fetchImpl: bad, sleep: noSleep }),
        false,
    );
    const thrown = async () => {
        throw new Error("network");
    };
    assert.equal(
        await send("u", {}, { fetchImpl: thrown, sleep: noSleep }),
        false,
    );
});

test("undelivered alert stays eligible, undelivered recovery stays active", () => {
    const prev = { active: { "degraded:b": { postedAt: 1 } } };
    const next = { active: { "degraded:a": { postedAt: 9 } } };
    const posts = [
        { type: "alert", key: "degraded:a" },
        { type: "recovered", key: "degraded:b" },
    ];
    const kept = settle(prev, next, posts, [false, false]);
    assert.deepEqual(kept.active, { "degraded:b": { postedAt: 1 } });
    const sent = settle(prev, next, posts, [true, true]);
    assert.deepEqual(sent.active, next.active);
});

test("overlapping checks: second is skipped until the first finishes", async () => {
    const once = exclusive(55_000);
    let release;
    const first = once(
        () =>
            new Promise((r) => {
                release = r;
            }),
    );
    assert.equal(await once(async () => "second"), null);
    release("first");
    assert.equal(await first, "first");
    assert.equal(await once(async () => "third"), "third");
});

test("a hung check releases after the lease", async () => {
    let t = 0;
    const once = exclusive(55_000, () => t);
    once(() => new Promise(() => {}));
    t = 56_000;
    assert.equal(await once(async () => "ran"), "ran");
});
