import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
    FX_SAFETY_RATE_USD_EUR,
    FX_SAFETY_RATES,
    type FxTargetCurrency,
    getUsdToRate,
} from "../src/utils/fx-cache.ts";

const FX_KEY_EUR = "fx:usd_eur";
const FX_KEY_INR = "fx:usd_inr";
const FX_KEY_GBP = "fx:usd_gbp";

const okResponse = (
    rates: Record<string, number>,
    base = "USD",
    date = "2026-05-19",
): Response =>
    new Response(JSON.stringify({ base, date, rates }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });

const frankfurterUrl = (target: FxTargetCurrency): string =>
    `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${target.toUpperCase()}`;

describe("getUsdToRate (EUR)", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        await env.KV.delete(FX_KEY_EUR);
        fetchSpy = vi.spyOn(globalThis, "fetch");
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    test("cache miss: fetches from frankfurter, stores rate in KV, returns it", async () => {
        fetchSpy.mockResolvedValueOnce(okResponse({ EUR: 0.9123 }));

        const rate = await getUsdToRate(env, "eur");

        expect(rate).toBe(0.9123);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy).toHaveBeenCalledWith(
            frankfurterUrl("eur"),
            expect.any(Object),
        );
        expect(await env.KV.get(FX_KEY_EUR)).toBe("0.9123");
    });

    test("cache hit: returns cached rate without calling fetch", async () => {
        await env.KV.put(FX_KEY_EUR, "0.9456");

        const rate = await getUsdToRate(env, "eur");

        expect(rate).toBe(0.9456);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test("cache miss + network error: returns safety rate without storing", async () => {
        fetchSpy.mockRejectedValueOnce(new TypeError("network failed"));

        const rate = await getUsdToRate(env, "eur");

        expect(rate).toBe(FX_SAFETY_RATE_USD_EUR);
        expect(await env.KV.get(FX_KEY_EUR)).toBeNull();
    });

    test("cache miss + non-2xx response: returns safety rate", async () => {
        fetchSpy.mockResolvedValueOnce(
            new Response("rate limited", { status: 429 }),
        );

        const rate = await getUsdToRate(env, "eur");

        expect(rate).toBe(FX_SAFETY_RATE_USD_EUR);
        expect(await env.KV.get(FX_KEY_EUR)).toBeNull();
    });

    test("cache miss + malformed JSON: returns safety rate", async () => {
        fetchSpy.mockResolvedValueOnce(
            new Response("not json", {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );

        const rate = await getUsdToRate(env, "eur");

        expect(rate).toBe(FX_SAFETY_RATE_USD_EUR);
        expect(await env.KV.get(FX_KEY_EUR)).toBeNull();
    });

    test("cache miss + missing EUR field: returns safety rate", async () => {
        fetchSpy.mockResolvedValueOnce(
            new Response(JSON.stringify({ base: "USD", rates: {} }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );

        const rate = await getUsdToRate(env, "eur");

        expect(rate).toBe(FX_SAFETY_RATE_USD_EUR);
        expect(await env.KV.get(FX_KEY_EUR)).toBeNull();
    });

    test("cache miss + non-positive rate (zero): returns safety rate", async () => {
        fetchSpy.mockResolvedValueOnce(okResponse({ EUR: 0 }));

        const rate = await getUsdToRate(env, "eur");

        expect(rate).toBe(FX_SAFETY_RATE_USD_EUR);
        expect(await env.KV.get(FX_KEY_EUR)).toBeNull();
    });

    test("corrupt cache value: falls through to fresh fetch", async () => {
        await env.KV.put(FX_KEY_EUR, "not-a-number");
        fetchSpy.mockResolvedValueOnce(okResponse({ EUR: 0.92 }));

        const rate = await getUsdToRate(env, "eur");

        expect(rate).toBe(0.92);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test("KV read failure: falls through to frankfurter and returns fresh rate", async () => {
        const kvGetSpy = vi
            .spyOn(env.KV, "get")
            .mockRejectedValueOnce(new Error("KV unavailable"));
        fetchSpy.mockResolvedValueOnce(okResponse({ EUR: 0.91 }));

        const rate = await getUsdToRate(env, "eur");

        expect(rate).toBe(0.91);
        expect(kvGetSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        kvGetSpy.mockRestore();
    });

    test("KV write failure: still returns the fresh rate (non-fatal)", async () => {
        const kvPutSpy = vi
            .spyOn(env.KV, "put")
            .mockRejectedValueOnce(new Error("KV unavailable"));
        fetchSpy.mockResolvedValueOnce(okResponse({ EUR: 0.94 }));

        const rate = await getUsdToRate(env, "eur");

        expect(rate).toBe(0.94);
        expect(kvPutSpy).toHaveBeenCalledTimes(1);
        kvPutSpy.mockRestore();
    });

    test("KV read fails AND frankfurter fails: returns safety rate", async () => {
        const kvGetSpy = vi
            .spyOn(env.KV, "get")
            .mockRejectedValueOnce(new Error("KV unavailable"));
        fetchSpy.mockRejectedValueOnce(new TypeError("network down"));

        const rate = await getUsdToRate(env, "eur");

        expect(rate).toBe(FX_SAFETY_RATE_USD_EUR);
        kvGetSpy.mockRestore();
    });
});

describe("getUsdToRate multi-currency (INR, GBP)", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        await env.KV.delete(FX_KEY_INR);
        await env.KV.delete(FX_KEY_GBP);
        fetchSpy = vi.spyOn(globalThis, "fetch");
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    test("INR: cache miss fetches from frankfurter with symbols=INR and caches at fx:usd_inr", async () => {
        fetchSpy.mockResolvedValueOnce(okResponse({ INR: 84.5 }));

        const rate = await getUsdToRate(env, "inr");

        expect(rate).toBe(84.5);
        expect(fetchSpy).toHaveBeenCalledWith(
            frankfurterUrl("inr"),
            expect.any(Object),
        );
        expect(await env.KV.get(FX_KEY_INR)).toBe("84.5");
    });

    test("GBP: cache miss fetches from frankfurter with symbols=GBP and caches at fx:usd_gbp", async () => {
        fetchSpy.mockResolvedValueOnce(okResponse({ GBP: 0.785 }));

        const rate = await getUsdToRate(env, "gbp");

        expect(rate).toBe(0.785);
        expect(fetchSpy).toHaveBeenCalledWith(
            frankfurterUrl("gbp"),
            expect.any(Object),
        );
        expect(await env.KV.get(FX_KEY_GBP)).toBe("0.785");
    });

    test("INR safety rate is the documented fallback when frankfurter is down", async () => {
        fetchSpy.mockRejectedValueOnce(new TypeError("network down"));

        const rate = await getUsdToRate(env, "inr");

        expect(rate).toBe(FX_SAFETY_RATES.inr);
    });

    test("GBP safety rate is the documented fallback when frankfurter is down", async () => {
        fetchSpy.mockRejectedValueOnce(new TypeError("network down"));

        const rate = await getUsdToRate(env, "gbp");

        expect(rate).toBe(FX_SAFETY_RATES.gbp);
    });

    test("each currency has an independent cache key (EUR/INR/GBP don't collide)", async () => {
        await env.KV.put(FX_KEY_EUR, "0.93");
        await env.KV.put(FX_KEY_INR, "85.0");
        await env.KV.put(FX_KEY_GBP, "0.79");

        expect(await getUsdToRate(env, "eur")).toBe(0.93);
        expect(await getUsdToRate(env, "inr")).toBe(85.0);
        expect(await getUsdToRate(env, "gbp")).toBe(0.79);
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
