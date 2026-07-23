import { describe, expect, it } from "vitest";
import type { RunwayRow } from "../lib/insights";
import {
    burnedPct,
    depletionTone,
    isActiveCreditRow,
    visibleRunwayRows,
} from "./CreditsTab";

const row = (vendor: string): RunwayRow => ({
    vendor,
    grantedUsd: 0,
    burnedUsd: 0,
    remainingUsd: 0,
    lapsedUsd: 0,
    unallocatedUsd: 0,
    preWindowBurnUsd: 0,
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

describe("burnedPct", () => {
    it("returns burned share of granted credit", () => {
        expect(burnedPct({ grantedUsd: 200, burnedUsd: 50 })).toBe(25);
    });

    it("is null without a grant base", () => {
        expect(burnedPct({ grantedUsd: 0, burnedUsd: 50 })).toBeNull();
    });
});

describe("isActiveCreditRow", () => {
    it("tracks whether the credit pool is finished", () => {
        expect(isActiveCreditRow({ finished: false })).toBe(true);
        expect(isActiveCreditRow({ finished: true })).toBe(false);
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
