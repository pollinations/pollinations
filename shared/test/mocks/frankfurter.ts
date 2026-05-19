import { Hono } from "hono";
import { createHonoMockHandler, type MockAPI } from "./fetch.ts";

export type MockFrankfurterState = {
    rate: number;
    callCount: number;
};

const DEFAULT_RATE = 0.93;

export function createMockFrankfurter(): MockAPI<MockFrankfurterState> {
    const state: MockFrankfurterState = {
        rate: DEFAULT_RATE,
        callCount: 0,
    };

    const frankfurterAPI = new Hono().get("/v1/latest", (c) => {
        state.callCount += 1;
        return c.json({
            base: "USD",
            date: "2026-05-19",
            rates: { EUR: state.rate },
        });
    });

    const handlerMap = {
        "api.frankfurter.dev": createHonoMockHandler(frankfurterAPI),
    };

    const reset = () => {
        state.rate = DEFAULT_RATE;
        state.callCount = 0;
    };

    return { state, reset, handlerMap };
}
