import { describe, expect, it } from "vitest";
import {
    fmtMonthYear,
    fmtMultiplier,
    fmtPct,
    fmtPeriod,
    fmtSmartNumber,
    fmtUnsignedPct,
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

describe("fmtSmartNumber", () => {
    it("uses up to four significant digits without trailing zeroes", () => {
        expect(fmtSmartNumber(1234.567)).toBe("1,234");
        expect(fmtSmartNumber(123.4567)).toBe("123.4");
        expect(fmtSmartNumber(20.7)).toBe("20.7");
        expect(fmtSmartNumber(20.74)).toBe("20.74");
        expect(fmtSmartNumber(20.725)).toBe("20.72");
        expect(fmtSmartNumber(1.234567)).toBe("1.234");
        expect(fmtSmartNumber(0.00123456)).toBe("0.001234");
    });

    it("uses compact suffixes for large numbers", () => {
        expect(fmtSmartNumber(12409.6)).toBe("12.4k");
        expect(fmtSmartNumber(1234567)).toBe("1.234M");
        expect(fmtSmartNumber(1234567890)).toBe("1.234B");
        expect(fmtSmartNumber(1234567890123)).toBe("1.234T");
    });
});

describe("fmtUsd", () => {
    it("renders adaptive compact dollars", () => {
        expect(fmtUsd(12409.6)).toBe("$12.4k");
        expect(fmtUsd(1234.567)).toBe("$1,234");
    });

    it("renders negatives with a minus sign", () => {
        expect(fmtUsd(-13921.4)).toBe("−$13.92k");
    });

    it("renders missing values as an en dash", () => {
        expect(fmtUsd(null)).toBe("–");
        expect(fmtUsd(undefined)).toBe("–");
        expect(fmtUsd(Number.NaN)).toBe("–");
    });
});

describe("fmtPct", () => {
    it("renders signed adaptive percentages", () => {
        expect(fmtPct(4.66666)).toBe("+4.666%");
        expect(fmtPct(-30.714)).toBe("−30.71%");
    });

    it("renders null as an en dash", () => {
        expect(fmtPct(null)).toBe("–");
    });
});

describe("fmtUnsignedPct", () => {
    it("renders unsigned adaptive percentages", () => {
        expect(fmtUnsignedPct(99.999)).toBe("99.99%");
        expect(fmtUnsignedPct(12345.6)).toBe("12.34k%");
    });

    it("renders missing values as an en dash", () => {
        expect(fmtUnsignedPct(null)).toBe("–");
        expect(fmtUnsignedPct(undefined)).toBe("–");
    });
});

describe("fmtMultiplier", () => {
    it("renders adaptive multipliers", () => {
        expect(fmtMultiplier(1.09876)).toBe("1.098×");
    });

    it("renders null and non-finite as an en dash", () => {
        expect(fmtMultiplier(null)).toBe("–");
        expect(fmtMultiplier(Number.POSITIVE_INFINITY)).toBe("–");
    });
});
