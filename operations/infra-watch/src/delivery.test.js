import assert from "node:assert/strict";
import { test } from "node:test";
import { exclusive, send, serial, settle, withTimeout } from "./delivery.js";

const reply = (status, retryAfter) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => retryAfter },
});
const noSleep = async () => {};

test("send retries 429 and 5xx, then succeeds", async () => {
    const statuses = [429, 500, 204];
    const fetchImpl = async () => reply(statuses.shift(), "0");
    assert.equal(
        await send("https://x.test/h", {}, { fetchImpl, sleep: noSleep }),
        true,
    );
});

test("send gives up after 3 failures and on 4xx", async () => {
    let calls = 0;
    const down = async () => {
        calls++;
        return reply(503);
    };
    assert.equal(
        await send("https://x.test/h", {}, { fetchImpl: down, sleep: noSleep }),
        false,
    );
    assert.equal(calls, 3);
    const bad = async () => reply(404);
    assert.equal(
        await send("https://x.test/h", {}, { fetchImpl: bad, sleep: noSleep }),
        false,
    );
    const thrown = async () => {
        throw new Error("network");
    };
    assert.equal(
        await send(
            "https://x.test/h",
            {},
            { fetchImpl: thrown, sleep: noSleep },
        ),
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
    const once = exclusive();
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

test("background tasks never block the caller and run one at a time", async () => {
    const run = serial();
    const order = [];
    let release;
    const gate = new Promise((r) => {
        release = r;
    });
    run(() => gate.then(() => order.push("slow")));
    run(async () => {
        throw new Error("failed task");
    });
    const last = run(async () => order.push("next"));
    // The caller got here while the slow task is still pending.
    assert.deepEqual(order, []);
    release();
    await last;
    assert.deepEqual(order, ["slow", "next"]);
});

test("withTimeout clears its timer once the work finishes", async () => {
    const signal = await withTimeout(20, async (s) => s);
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(signal.aborted, false);
});

test("withTimeout aborts work that runs too long", async () => {
    const slow = (signal) =>
        new Promise((_, reject) =>
            signal.addEventListener("abort", () => reject(new Error("abort"))),
        );
    await assert.rejects(withTimeout(10, slow), /abort/);
});

test("send asks Discord to confirm the saved message (wait=true)", async () => {
    let seen;
    const fetchImpl = async (url) => {
        seen = url;
        return reply(200);
    };
    await send(
        "https://discord.com/api/webhooks/1/abc",
        {},
        { fetchImpl, sleep: noSleep },
    );
    assert.equal(new URL(seen).searchParams.get("wait"), "true");
});
