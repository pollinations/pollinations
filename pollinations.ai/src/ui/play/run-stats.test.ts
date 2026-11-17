import { describe, expect, it } from "vitest";
import { runStatsLine } from "./run-stats";

const line = (cost?: number, ms?: number) =>
    runStatsLine({ model: "m", avg_cost_usd: cost, avg_response_ms: ms });

const COST = "Average cost per request: ";

describe("runStatsLine", () => {
    it("shows dollars to two significant digits", () => {
        expect(line(0.004)).toBe(`${COST}$0.004`);
        expect(line(0.0473)).toBe(`${COST}$0.047`);
        expect(line(0.4199)).toBe(`${COST}$0.42`);
        expect(line(1.2)).toBe(`${COST}$1.2`);
    });

    it("shows whole seconds under a minute", () => {
        expect(line(undefined, 3000)).toBe("About 3 seconds");
        expect(line(undefined, 41400)).toBe("About 41 seconds");
        expect(line(undefined, 1000)).toBe("About 1 second");
    });

    it("shows minutes from a minute up and drops 0 seconds", () => {
        expect(line(undefined, 100000)).toBe("About 1 minute 40 seconds");
        expect(line(undefined, 120000)).toBe("About 2 minutes");
        expect(line(undefined, 60000)).toBe("About 1 minute");
        expect(line(undefined, 121000)).toBe("About 2 minutes 1 second");
    });

    it("joins both numbers and skips missing or zero ones", () => {
        expect(line(0.004, 3000)).toBe(`${COST}$0.004 · about 3 seconds`);
        expect(line(0.42, 100000)).toBe(
            `${COST}$0.42 · about 1 minute 40 seconds`,
        );
        expect(line(0, 3000)).toBe("About 3 seconds");
        expect(line(0.5, null as unknown as undefined)).toBe(`${COST}$0.5`);
        expect(line(0, 0)).toBe("");
        expect(runStatsLine(undefined)).toBe("");
    });
});
