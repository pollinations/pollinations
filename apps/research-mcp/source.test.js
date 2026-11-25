import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";
import { fetchJson, fetchText } from "./fetch.js";

afterEach(() => mock.restoreAll());

test("independent requests do not reject each other through a shared gate", async () => {
    let release;
    const pending = new Promise((resolve) => {
        release = resolve;
    });
    let started = 0;
    mock.method(globalThis, "fetch", async () => {
        started++;
        await pending;
        return Response.json({ ok: true });
    });
    const requests = [
        fetchJson("https://en.wikipedia.org/one"),
        fetchJson("https://en.wikipedia.org/two"),
    ];
    assert.equal(started, 2);
    release();
    assert.deepEqual(await Promise.all(requests), [{ ok: true }, { ok: true }]);
});

test("source errors expose status without response bodies or a local retry loop", async () => {
    let count = 0;
    mock.method(globalThis, "fetch", async () => {
        count++;
        return new Response("upstream detail", { status: 429 });
    });
    await assert.rejects(
        fetchJson("https://en.wikipedia.org/test"),
        /HTTP 429; rate limited/,
    );
    assert.equal(count, 1);
});

test("RFC text has an explicit larger cap while ordinary JSON stays bounded", async () => {
    mock.method(
        globalThis,
        "fetch",
        async () => new Response("x".repeat(600 * 1024)),
    );
    await assert.rejects(
        fetchText("https://www.rfc-editor.org/rfc/rfc9110.txt"),
        /512 KiB/,
    );
    assert.equal(
        (
            await fetchText(
                "https://www.rfc-editor.org/rfc/rfc9110.txt",
                "text/plain",
                8 * 1024 * 1024,
            )
        ).length,
        600 * 1024,
    );
});
