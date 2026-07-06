import { describe, expect, it } from "vitest";
import {
    fmtMonthYear,
    fmtMultiplier,
    fmtPct,
    fmtPeriod,
    fmtUsd,
    hoursSince,
} from "./format";

describe("format", () => {
    it("fmtMonthYear renders full month and two-digit year", () => {
        expect(fmtMonthYear("2006", "06")).toBe("June 06");
        expect(fmtMonthYear("2026", "06")).toBe("June 26");
        expect(fmtMonthYear("2026", "07")).toBe("July 26");
    });

    it("fmtPeriod renders readable table dates", () => {
        expect(fmtPeriod("2026-07")).toBe("July 26");
        expect(fmtPeriod("2026-07-04")).toBe("July 4, 26");
        expect(fmtPeriod("2026-07-04 12:34:56")).toBe("July 4, 26 12:34:56");
        expect(fmtPeriod("2026-07-04T12:34:56Z")).toBe("July 4, 26 12:34:56");
        expect(fmtPeriod("")).toBe("-");
        expect(fmtPeriod("unknown")).toBe("unknown");
    });

    it("hoursSince parses TB DateTime as UTC", () => {
        const now = Date.parse("2026-07-03T12:00:00Z");
        expect(hoursSince("2026-07-03 06:00:00", now)).toBeCloseTo(6, 5);
        expect(hoursSince("garbage", now)).toBe(Number.POSITIVE_INFINITY);
    });
});

describe("fmtUsd", () => {
    it("renders whole dollars with thousands separators", () => {
        expect(fmtUsd(12409.6)).toBe("$12,410");
    });

    it("renders negatives with a minus sign", () => {
        expect(fmtUsd(-13921.4)).toBe("−$13,921");
    });

    it("renders missing values as an en dash", () => {
        expect(fmtUsd(null)).toBe("–");
        expect(fmtUsd(undefined)).toBe("–");
        expect(fmtUsd(Number.NaN)).toBe("–");
    });
});

describe("fmtPct", () => {
    it("renders signed one-decimal percentages", () => {
        expect(fmtPct(4.66)).toBe("+4.7%");
        expect(fmtPct(-30.71)).toBe("−30.7%");
    });

    it("renders null as an en dash", () => {
        expect(fmtPct(null)).toBe("–");
    });
});

describe("fmtMultiplier", () => {
    it("renders two-decimal multipliers", () => {
        expect(fmtMultiplier(1.098)).toBe("1.10×");
    });

    it("renders null and non-finite as an en dash", () => {
        expect(fmtMultiplier(null)).toBe("–");
        expect(fmtMultiplier(Number.POSITIVE_INFINITY)).toBe("–");
    });
});
