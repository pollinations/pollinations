import assert from "node:assert/strict";
import test from "node:test";
import { fetchUsdToEur, parseFrankfurter } from "../lib/fx.mjs";

test("parseFrankfurter extracts rate and date", () => {
    const out = parseFrankfurter({
        amount: 1,
        base: "USD",
        date: "2026-06-22",
        rates: { EUR: 0.87291 },
    });
    assert.deepEqual(out, { rate: 0.87291, asOf: "2026-06-22" });
});

test("parseFrankfurter throws on unexpected shape", () => {
    assert.throws(() => parseFrankfurter({ base: "EUR", rates: {} }));
    assert.throws(() =>
        parseFrankfurter({
            base: "USD",
            rates: { EUR: "x" },
            date: "2026-06-22",
        }),
    );
    assert.throws(() => parseFrankfurter(null));
});

test("fetchUsdToEur returns parsed rate on success", async (t) => {
    const oldFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
        assert.match(url, /frankfurter\.dev/);
        return Response.json({
            base: "USD",
            date: "2026-06-22",
            rates: { EUR: 0.873 },
        });
    };
    t.after(() => {
        globalThis.fetch = oldFetch;
    });

    assert.deepEqual(await fetchUsdToEur(), {
        rate: 0.873,
        asOf: "2026-06-22",
    });
});

test("fetchUsdToEur returns null on non-200", async (t) => {
    const oldFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("nope", { status: 503 });
    t.after(() => {
        globalThis.fetch = oldFetch;
    });

    assert.equal(await fetchUsdToEur(), null);
});

test("fetchUsdToEur returns null when fetch throws (offline)", async (t) => {
    const oldFetch = globalThis.fetch;
    globalThis.fetch = async () => {
        throw new Error("getaddrinfo ENOTFOUND");
    };
    t.after(() => {
        globalThis.fetch = oldFetch;
    });

    assert.equal(await fetchUsdToEur(), null);
});
