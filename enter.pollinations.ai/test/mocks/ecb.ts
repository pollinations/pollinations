import {
    createHonoMockHandler,
    type MockAPI,
} from "@shared/test/mocks/fetch.ts";
import { Hono } from "hono";

export type MockEcbState = {
    /** USD-per-EUR rate served by the daily feed. */
    usdRate: string;
    /** When set, the feed responds with this HTTP status instead of XML. */
    failStatus: number | null;
};

export function createMockEcb(): MockAPI<MockEcbState> {
    const state: MockEcbState = {
        usdRate: "1.1550",
        failStatus: null,
    };

    const ecbAPI = new Hono().get(
        "/stats/eurofxref/eurofxref-daily.xml",
        (c) => {
            if (state.failStatus != null) {
                return c.body(null, state.failStatus as 503);
            }
            return c.body(
                `<gesmes:Envelope><Cube><Cube time='2026-06-10'>
                <Cube currency='USD' rate='${state.usdRate}'/>
                <Cube currency='JPY' rate='168.42'/>
            </Cube></Cube></gesmes:Envelope>`,
                200,
                { "Content-Type": "application/xml" },
            );
        },
    );

    const handlerMap = {
        "www.ecb.europa.eu": createHonoMockHandler(ecbAPI),
    };

    const reset = () => {
        state.usdRate = "1.1550";
        state.failStatus = null;
    };

    return {
        state,
        reset,
        handlerMap,
    };
}
