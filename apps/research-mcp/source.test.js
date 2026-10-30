import { env, evictDurableObject, runInDurableObject } from "cloudflare:test";
import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

const page = "https://en.wikipedia.org/api/rest_v1/page/summary/Test";
const source = () => env.WIKIMEDIA_SOURCE.getByName(crypto.randomUUID());
const saved = (stub) =>
    runInDurableObject(stub, (_, state) => state.storage.get("nextAllowedAt"));
afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

test("one in-flight body across languages/APIs, then a completion gap", async () => {
    const stub = source();
    await runInDurableObject(stub, async (instance, state) => {
        const headers = Promise.withResolvers();
        let body;
        const fetch = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async () => {
                headers.resolve();
                return new Response(
                    new ReadableStream({
                        start(controller) {
                            body = controller;
                        },
                    }),
                );
            });
        const first = instance.fetchJson(page);
        await headers.promise;
        try {
            await assert.rejects(
                instance.fetchJson(
                    "https://en.wiktionary.org/api/rest_v1/page/definition/test",
                ),
                /busy/,
            );
            assert.equal(fetch.mock.calls.length, 1);
            assert(
                (await state.storage.get("nextAllowedAt")) >=
                    Date.now() + 13_000,
            );
        } finally {
            body.enqueue(new TextEncoder().encode('{"ok":true}'));
            body.close();
        }
        assert.deepEqual(await first, { ok: true });
        assert((await state.storage.get("nextAllowedAt")) > Date.now());
        await assert.rejects(
            instance.fetchJson("https://de.wikipedia.org/w/api.php"),
            /busy/,
        );
        assert.equal(fetch.mock.calls.length, 1);
    });
});

test("persisted backoff survives real Durable Object eviction", async () => {
    const stub = source();
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("", {
            status: 429,
            headers: { "Retry-After": "120" },
        }),
    );
    await assert.rejects(async () => stub.fetchJson(page), /429.*120/);
    const next = await saved(stub);
    await evictDurableObject(stub);
    await assert.rejects(async () => stub.fetchJson(page), /busy/);
    assert.equal(await saved(stub), next);
    assert.equal(fetch.mock.calls.length, 1);
});

test("a restart retains an unfinished fetch reservation", async () => {
    const stub = source();
    const reserved = Date.now() + 15_000;
    await runInDurableObject(stub, (_, state) =>
        state.storage.put("nextAllowedAt", reserved),
    );
    await evictDurableObject(stub);
    const fetch = vi.spyOn(globalThis, "fetch");
    await assert.rejects(async () => stub.fetchJson(page), /busy/);
    assert.equal(fetch.mock.calls.length, 0);
    assert.equal(await saved(stub), reserved);
});

test("deadline includes a stalled response body", async () => {
    const stub = source();
    await runInDurableObject(stub, async (instance) => {
        vi.useFakeTimers();
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (_, { signal }) => {
                const response = new Response(
                    new ReadableStream({
                        start(controller) {
                            signal.addEventListener(
                                "abort",
                                () => controller.error(signal.reason),
                                { once: true },
                            );
                        },
                    }),
                );
                queueMicrotask(() => vi.advanceTimersByTime(10_000));
                return response;
            },
        );
        await assert.rejects(instance.fetchJson(page), /aborted/);
        assert.equal(instance.busy, false);
    });
});

for (const retry of [
    null,
    "garbage",
    "0",
    new Date(Date.now() + 60_000).toUTCString(),
]) {
    test(`503 shared backoff: ${retry ?? "missing header"}`, async () => {
        const stub = source();
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("", {
                status: 503,
                headers: retry === null ? {} : { "Retry-After": retry },
            }),
        );
        const started = Date.now();
        await assert.rejects(async () => stub.fetchJson(page), /503/);
        assert((await saved(stub)) >= started + 5_000);
        if (retry?.includes("GMT"))
            assert((await saved(stub)) >= Date.parse(retry));
    });
}

test("slow Action API calls wait five seconds after completion", async () => {
    const stub = source();
    let now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        now += 1001;
        return Response.json({ ok: true });
    });
    await stub.fetchJson("https://en.wikipedia.org/w/api.php?action=query");
    assert.equal(await saved(stub), now + 5_000);
    now += 4_999;
    await assert.rejects(async () => stub.fetchJson(page), /busy/);
    now += 1;
    await stub.fetchJson(page);
    assert.equal(await saved(stub), now + 500);
});

test("invalid host never reaches fetch; failed storage never reaches upstream", async () => {
    const stub = source();
    const fetch = vi.spyOn(globalThis, "fetch");
    await assert.rejects(
        async () => stub.fetchJson("https://example.com/"),
        /Unsupported/,
    );
    await runInDurableObject(stub, async (instance, state) => {
        vi.spyOn(state.storage, "put").mockRejectedValue(
            new Error("storage unavailable"),
        );
        await assert.rejects(instance.fetchJson(page), /storage unavailable/);
    });
    assert.equal(fetch.mock.calls.length, 0);
});

test("a delayed reservation cannot start upstream after the deadline", async () => {
    const stub = source();
    const fetch = vi.spyOn(globalThis, "fetch");
    await runInDurableObject(stub, async (instance, state) => {
        let now = Date.now();
        vi.spyOn(Date, "now").mockImplementation(() => now);
        const put = state.storage.put.bind(state.storage);
        vi.spyOn(state.storage, "put").mockImplementationOnce(
            async (...args) => {
                await put(...args);
                now += 10_001;
            },
        );
        await assert.rejects(instance.fetchJson(page), /deadline exceeded/);
        assert.equal(instance.busy, false);
    });
    assert.equal(fetch.mock.calls.length, 0);
});

test("bounded body failure cancels upstream and releases busy state", async () => {
    const stub = source();
    let signal;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_, options) => {
        signal = options.signal;
        return new Response("{}", {
            headers: { "Content-Length": String(513 * 1024) },
        });
    });
    await assert.rejects(async () => stub.fetchJson(page), /512 KiB/);
    assert(signal.aborted);
    assert.equal(
        await runInDurableObject(stub, (instance) => instance.busy),
        false,
    );
    await assert.rejects(async () => stub.fetchJson(page), /busy/);
});
