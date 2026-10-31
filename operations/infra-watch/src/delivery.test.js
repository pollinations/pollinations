import assert from "node:assert/strict";
import { test } from "node:test";
import {
    discordIds,
    edit,
    exclusive,
    payload,
    send,
    serial,
    withTimeout,
} from "./delivery.js";

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

test("send returns the message Discord saved, so it can be edited and linked", async () => {
    const fetchImpl = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ id: "123", channel_id: "9" }),
    });
    assert.deepEqual(
        await send("https://x.test/h", {}, { fetchImpl, sleep: noSleep }),
        { id: "123", channel_id: "9" },
    );
});

test("edit patches the webhook's own message", async () => {
    let seen;
    const fetchImpl = async (url, init) => {
        seen = {
            url: String(url),
            method: init.method,
            body: JSON.parse(init.body),
        };
        return reply(200);
    };
    const ok = await edit(
        "https://discord.com/api/webhooks/1/abc",
        "123",
        { content: "done" },
        { fetchImpl },
    );
    assert.equal(ok, true);
    assert.equal(
        seen.url,
        "https://discord.com/api/webhooks/1/abc/messages/123",
    );
    assert.equal(seen.method, "PATCH");
    assert.equal(seen.body.content, "done");
});

test("alerts go out as a coloured embed; mentions stay outside it", () => {
    const message = { text: "box", color: 0xd85a30 };
    const pinged = payload({ ...message, ping: true }, ["1", "2"]);
    assert.equal(pinged.content, "<@1> <@2>");
    assert.deepEqual(pinged.embeds, [{ description: "box", color: 0xd85a30 }]);
    assert.deepEqual(pinged.allowed_mentions, { parse: [], users: ["1", "2"] });
    const quiet = payload({ ...message, ping: false }, ["1", "2"]);
    assert.equal(quiet.content, "");
    assert.deepEqual(quiet.allowed_mentions, { parse: [], users: [] });
});

test("a community card pings each owner with a known Discord id and names the rest", () => {
    const ids = discordIds(
        JSON.stringify({
            Known: "123456789012345678",
            "no-discord": null,
            // A number may have lost digits; never a guessed id.
            rounded: 123456789012345680,
            fake: "<@1>",
        }),
    );
    const card = { text: "box", color: 1 };
    const body = payload(
        {
            ...card,
            owners: ["known", "unknown", "no-discord", "rounded", "fake"],
        },
        ["1", "2"],
        ids,
    );
    assert.equal(
        body.content,
        "<@123456789012345678> unknown no-discord rounded fake",
    );
    assert.deepEqual(body.allowed_mentions, {
        parse: [],
        users: ["123456789012345678"],
    });
    // No maintainer is pinged by a community card.
    assert.doesNotMatch(body.content, /<@[12]>/);
    // Without the map, every owner is named.
    assert.equal(payload({ ...card, owners: ["known"] }, []).content, "known");
});

test("an unreadable owner map names every owner", () => {
    for (const json of [undefined, "not json", "null"])
        assert.deepEqual(discordIds(json), {});
});
