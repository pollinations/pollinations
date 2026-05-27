import { Hono } from "hono";
import { createHonoMockHandler, type MockAPI } from "./fetch.ts";

export type MockFrankfurterState = {
    rates: Record<string, number>;
    callCount: number;
};

const DEFAULT_RATES: Record<string, number> = {
    EUR: 0.93,
    INR: 85.0,
    GBP: 0.79,
};

export function createMockFrankfurter(): MockAPI<MockFrankfurterState> {
    const state: MockFrankfurterState = {
        rates: { ...DEFAULT_RATES },
        callCount: 0,
    };

    const frankfurterAPI = new Hono().get("/v1/latest", (c) => {
        state.callCount += 1;
        const symbolsParam = c.req.query("symbols") ?? "";
        const requested = symbolsParam
            ? symbolsParam.split(",").map((s) => s.trim().toUpperCase())
            : Object.keys(DEFAULT_RATES);
        const rates: Record<string, number> = {};
        for (const symbol of requested) {
            const rate = state.rates[symbol];
            if (rate !== undefined) rates[symbol] = rate;
        }
        return c.json({
            base: "USD",
            date: "2026-05-19",
            rates,
        });
    });

    const handlerMap = {
        "api.frankfurter.dev": createHonoMockHandler(frankfurterAPI),
    };

    const reset = () => {
        state.rates = { ...DEFAULT_RATES };
        state.callCount = 0;
    };

    return { state, reset, handlerMap };
}
