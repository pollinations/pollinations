import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
    FX_SAFETY_RATE_USD_EUR,
    getUsdToEurRate,
} from "../src/utils/fx-cache.ts";

const FX_KEY = "fx:usd_eur";
const FRANKFURTER_URL =
    "https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR";

const okResponse = (rate: number): Response =>
    new Response(
        JSON.stringify({
            base: "USD",
            date: "2026-05-19",
            rates: { EUR: rate },
        }),
        {
            status: 200,
            headers: { "Content-Type": "application/json" },
        },
    );

describe("getUsdToEurRate", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        await env.KV.delete(FX_KEY);
        fetchSpy = vi.spyOn(globalThis, "fetch");
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    test("cache miss: fetches from frankfurter, stores rate in KV, returns it", async () => {
        fetchSpy.mockResolvedValueOnce(okResponse(0.9123));

        const rate = await getUsdToEurRate(env);

        expect(rate).toBe(0.9123);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy).toHaveBeenCalledWith(
            FRANKFURTER_URL,
            expect.any(Object),
        );
        expect(await env.KV.get(FX_KEY)).toBe("0.9123");
    });

    test("cache hit: returns cached rate without calling fetch", async () => {
        await env.KV.put(FX_KEY, "0.9456");

        const rate = await getUsdToEurRate(env);

        expect(rate).toBe(0.9456);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test("cache miss + network error: returns safety rate without storing", async () => {
        fetchSpy.mockRejectedValueOnce(new TypeError("network failed"));

        const rate = await getUsdToEurRate(env);

        expect(rate).toBe(FX_SAFETY_RATE_USD_EUR);
        expect(await env.KV.get(FX_KEY)).toBeNull();
    });

    test("cache miss + non-2xx response: returns safety rate", async () => {
        fetchSpy.mockResolvedValueOnce(
            new Response("rate limited", { status: 429 }),
        );

        const rate = await getUsdToEurRate(env);

        expect(rate).toBe(FX_SAFETY_RATE_USD_EUR);
        expect(await env.KV.get(FX_KEY)).toBeNull();
    });

    test("cache miss + malformed JSON: returns safety rate", async () => {
        fetchSpy.mockResolvedValueOnce(
            new Response("not json", {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );

        const rate = await getUsdToEurRate(env);

        expect(rate).toBe(FX_SAFETY_RATE_USD_EUR);
        expect(await env.KV.get(FX_KEY)).toBeNull();
    });

    test("cache miss + missing EUR field: returns safety rate", async () => {
        fetchSpy.mockResolvedValueOnce(
            new Response(JSON.stringify({ base: "USD", rates: {} }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );

        const rate = await getUsdToEurRate(env);

        expect(rate).toBe(FX_SAFETY_RATE_USD_EUR);
        expect(await env.KV.get(FX_KEY)).toBeNull();
    });

    test("cache miss + non-positive rate (zero): returns safety rate", async () => {
        fetchSpy.mockResolvedValueOnce(okResponse(0));

        const rate = await getUsdToEurRate(env);

        expect(rate).toBe(FX_SAFETY_RATE_USD_EUR);
        expect(await env.KV.get(FX_KEY)).toBeNull();
    });

    test("corrupt cache value: falls through to fresh fetch", async () => {
        await env.KV.put(FX_KEY, "not-a-number");
        fetchSpy.mockResolvedValueOnce(okResponse(0.92));

        const rate = await getUsdToEurRate(env);

        expect(rate).toBe(0.92);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test("KV read failure: falls through to frankfurter and returns fresh rate", async () => {
        const kvGetSpy = vi
            .spyOn(env.KV, "get")
            .mockRejectedValueOnce(new Error("KV unavailable"));
        fetchSpy.mockResolvedValueOnce(okResponse(0.91));

        const rate = await getUsdToEurRate(env);

        expect(rate).toBe(0.91);
        expect(kvGetSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        kvGetSpy.mockRestore();
    });

    test("KV write failure: still returns the fresh rate (non-fatal)", async () => {
        const kvPutSpy = vi
            .spyOn(env.KV, "put")
            .mockRejectedValueOnce(new Error("KV unavailable"));
        fetchSpy.mockResolvedValueOnce(okResponse(0.94));

        const rate = await getUsdToEurRate(env);

        expect(rate).toBe(0.94);
        expect(kvPutSpy).toHaveBeenCalledTimes(1);
        kvPutSpy.mockRestore();
    });

    test("KV read fails AND frankfurter fails: returns safety rate", async () => {
        const kvGetSpy = vi
            .spyOn(env.KV, "get")
            .mockRejectedValueOnce(new Error("KV unavailable"));
        fetchSpy.mockRejectedValueOnce(new TypeError("network down"));

        const rate = await getUsdToEurRate(env);

        expect(rate).toBe(FX_SAFETY_RATE_USD_EUR);
        kvGetSpy.mockRestore();
    });
});
