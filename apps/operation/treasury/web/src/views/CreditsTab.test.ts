import { describe, expect, it } from "vitest";
import type { RunwayRow } from "../lib/insights";
import { depletionTone, visibleRunwayRows } from "./CreditsTab";

const row = (vendor: string): RunwayRow => ({
    vendor,
    grantedUsd: 0,
    burnedUsd: 0,
    remainingUsd: 0,
    lapsedUsd: 0,
    unallocatedUsd: 0,
    lastMonthBurnUsd: 0,
    currentMonthBurnUsd: 0,
    cashLastMonthUsd: 0,
    cashCurrentMonthUsd: 0,
    monthlyRateUsd: null,
    rateBasis: null,
    depletionDate: null,
    depletionReason: null,
    finished: false,
    finishedDate: null,
    flags: [],
    grants: [],
});

describe("visibleRunwayRows", () => {
    const rows = [row("lambda"), row("google")];

    it("filters by vendor and passes everything through for all", () => {
        expect(visibleRunwayRows(rows, "lambda")).toEqual([row("lambda")]);
        expect(visibleRunwayRows(rows, "all")).toEqual(rows);
    });
});

describe("depletionTone", () => {
    const now = new Date("2026-07-08T12:00:00Z");

    it("is red under 30 days, amber under 90, soft otherwise", () => {
        expect(depletionTone("2026-07-22", now)).toBe(
            "text-intent-danger-text",
        );
        expect(depletionTone("2026-09-01", now)).toBe(
            "text-intent-warning-text",
        );
        expect(depletionTone("2027-01-01", now)).toBe("text-theme-text-soft");
        expect(depletionTone(null, now)).toBe("text-theme-text-soft");
    });
});
