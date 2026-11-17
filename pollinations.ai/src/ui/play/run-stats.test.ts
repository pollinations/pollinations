import { describe, expect, it } from "vitest";
import { pickRunRecord, runCostLabel, runStatsLine } from "./run-stats";

const line = (cost?: number, ms?: number) =>
    runStatsLine({ model: "m", avg_cost_usd: cost, avg_response_ms: ms });

describe("runStatsLine", () => {
    it("shows pollen to two significant digits", () => {
        expect(line(0.004)).toBe("Usually about 0.004 pollen");
        expect(line(0.0473)).toBe("Usually about 0.047 pollen");
        expect(line(0.4199)).toBe("Usually about 0.42 pollen");
        expect(line(1.2)).toBe("Usually about 1.2 pollen");
    });

    it("shows whole seconds under a minute", () => {
        expect(line(undefined, 3000)).toBe("Usually about 3 seconds");
        expect(line(undefined, 41400)).toBe("Usually about 41 seconds");
        expect(line(undefined, 1000)).toBe("Usually about 1 second");
    });

    it("shows minutes from a minute up and drops 0 seconds", () => {
        expect(line(undefined, 100000)).toBe(
            "Usually about 1 minute 40 seconds",
        );
        expect(line(undefined, 120000)).toBe("Usually about 2 minutes");
        expect(line(undefined, 60000)).toBe("Usually about 1 minute");
        expect(line(undefined, 121000)).toBe(
            "Usually about 2 minutes 1 second",
        );
    });

    it("joins both numbers and skips missing or zero ones", () => {
        expect(line(0.42, 100000)).toBe(
            "Usually about 0.42 pollen, 1 minute 40 seconds",
        );
        expect(line(0, 3000)).toBe("Usually about 3 seconds");
        expect(line(0.5, null as unknown as undefined)).toBe(
            "Usually about 0.5 pollen",
        );
        expect(line(0, 0)).toBe("");
        expect(runStatsLine(undefined)).toBe("");
    });
});

describe("pickRunRecord", () => {
    const rec = (model: string, timestamp: string, cost_usd = 0.1) => ({
        model,
        timestamp,
        cost_usd,
    });
    const start = Date.parse("2026-11-17T10:00:05.700Z");

    it("takes the newest record of the model that ran", () => {
        const records = [
            rec("other", "2026-11-17 10:00:09"),
            rec("flux", "2026-11-17 10:00:08", 0.3),
            rec("flux", "2026-11-17 10:00:06", 0.2),
        ];
        expect(pickRunRecord(records, "flux", start)?.cost_usd).toBe(0.3);
    });

    it("accepts a record from the second the run started in", () => {
        const records = [rec("flux", "2026-11-17 10:00:05")];
        expect(pickRunRecord(records, "flux", start)).toBe(records[0]);
    });

    it("ignores records from before the run and other models", () => {
        expect(
            pickRunRecord([rec("flux", "2026-11-17 10:00:04")], "flux", start),
        ).toBeUndefined();
        expect(
            pickRunRecord([rec("other", "2026-11-17 10:00:09")], "flux", start),
        ).toBeUndefined();
        expect(pickRunRecord([], "flux", start)).toBeUndefined();
    });
});

describe("runCostLabel", () => {
    it("shows the charge, including zero", () => {
        expect(
            runCostLabel({ model: "m", timestamp: "", cost_usd: 0.38 }),
        ).toBe("0.38 pollen");
        expect(runCostLabel({ model: "m", timestamp: "", cost_usd: 0 })).toBe(
            "0 pollen",
        );
    });
});
