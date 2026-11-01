import { describe, expect, it } from "vitest";
import {
    fmtExactNumber,
    fmtExactUsd,
    fmtMarginPct,
    fmtMonthDay,
    fmtMonthYear,
    fmtNumber,
    fmtPct,
    fmtPeriod,
    fmtRateUsd,
    fmtSmartNumber,
    fmtUnsignedPct,
    fmtUsd,
    fmtUtcDateTime,
    hasVisibleAmount,
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

    it("fmtMarginPct keeps the minus sign but drops the leading plus", () => {
        expect(fmtMarginPct(42)).toBe("42%");
        expect(fmtMarginPct(-42)).toBe("−42%");
        expect(fmtMarginPct(null)).toBe("–");
    });

    it("fmtUtcDateTime renders compact UTC labels", () => {
        expect(fmtUtcDateTime("2026-07-01 00:00:00")).toBe("2026-07-01");
        expect(fmtUtcDateTime("2026-07-08 16:38:12")).toBe(
            "2026-07-08 16:38:12",
        );
        expect(fmtUtcDateTime("2026-07-08 16:38:00")).toBe("2026-07-08 16:38");
        expect(fmtUtcDateTime("2026-07-01")).toBe("2026-07-01");
        expect(fmtUtcDateTime("")).toBe("-");
        expect(fmtUtcDateTime("unknown")).toBe("unknown");
    });
});

describe("fmtSmartNumber", () => {
    it("rounds to whole units without trailing decimals", () => {
        expect(fmtSmartNumber(1234.567)).toBe("1,235");
        expect(fmtSmartNumber(123.4567)).toBe("123");
        expect(fmtSmartNumber(20.7)).toBe("21");
        expect(fmtSmartNumber(20.74)).toBe("21");
        expect(fmtSmartNumber(20.725)).toBe("21");
        expect(fmtSmartNumber(1.234567)).toBe("1");
        expect(fmtSmartNumber(0.137)).toBe("");
        expect(fmtSmartNumber(0.06011)).toBe("");
        expect(fmtSmartNumber(0.05667)).toBe("");
        expect(fmtSmartNumber(0.03609)).toBe("");
        expect(fmtSmartNumber(0.005732)).toBe("");
        expect(fmtSmartNumber(0.00123456)).toBe("");
        expect(fmtSmartNumber(0.2061)).toBe("");
        expect(fmtSmartNumber(0.2499)).toBe("");
        expect(fmtSmartNumber(0.2515)).toBe("");
    });

    it("uses comma separators for large whole numbers", () => {
        expect(fmtSmartNumber(12409.6)).toBe("12,410");
        expect(fmtSmartNumber(1234567)).toBe("1,234,567");
        expect(fmtSmartNumber(1234567890)).toBe("1,234,567,890");
        expect(fmtSmartNumber(1234567890123)).toBe("1,234,567,890,123");
    });

    it("hides tiny nonzero values", () => {
        expect(fmtSmartNumber(0.000000000000000444)).toBe("");
        expect(fmtSmartNumber(0.0009)).toBe("");
    });
});

describe("fmtMonthDay", () => {
    it("keeps calendar dates compact without repeating the selected year", () => {
        expect(fmtMonthDay("2026-08-27 16:26:09")).toBe("Aug 27");
        expect(fmtMonthDay("2026-09-01")).toBe("Sep 1");
        expect(fmtMonthDay("")).toBe("–");
        expect(fmtMonthDay("unknown")).toBe("unknown");
    });
});

describe("fmtUsd", () => {
    it("renders rounded whole dollars", () => {
        expect(fmtUsd(12409.6)).toBe("$12,410");
        expect(fmtUsd(1234.567)).toBe("$1,235");
    });

    it("does not truncate floating-point noise into a false monetary gap", () => {
        expect(fmtUsd(64.8 + 41.6)).toBe("$106");
        expect(fmtUsd(105.4 - (64.8 + 41.6))).toBe("−$1");
        expect(fmtUsd(106.39)).toBe("$106");
    });

    it("renders negatives with a minus sign", () => {
        expect(fmtUsd(-13921.4)).toBe("−$13,921");
    });

    it("hides amounts below one dollar in either direction", () => {
        expect(fmtUsd(0.000000000000000444)).toBe("");
        expect(fmtUsd(-0.0009)).toBe("");
        expect(fmtUsd(-0.05667)).toBe("");
        expect(fmtUsd(-0.03609)).toBe("");
        for (const value of [-0.99, 0.99]) {
            expect(fmtUsd(value)).toBe("");
            expect(fmtNumber(value)).toBe("");
        }
        expect(fmtUsd(0)).toBe("$0");
        expect(fmtNumber(0)).toBe("0");
        expect(fmtUsd(1)).toBe("$1");
        expect(fmtNumber(-1)).toBe("−1");
    });

    it("renders missing values as an en dash", () => {
        expect(fmtUsd(null)).toBe("–");
        expect(fmtUsd(undefined)).toBe("–");
        expect(fmtUsd(Number.NaN)).toBe("–");
    });
});

describe("fmtNumber", () => {
    it("renders plain numbers with shared whole-unit rounding", () => {
        expect(fmtNumber(60.629999999999995)).toBe("61");
        expect(fmtNumber(1216.9900000000002)).toBe("1,217");
        expect(fmtNumber(12000)).toBe("12,000");
        expect(fmtNumber(-738.1800000000001)).toBe("−738");
    });

    it("renders missing values as an en dash", () => {
        expect(fmtNumber(null)).toBe("–");
        expect(fmtNumber(undefined)).toBe("–");
        expect(fmtNumber(Number.NaN)).toBe("–");
    });
});

describe("fmtPct", () => {
    it("renders signed percentages with two decimal places", () => {
        expect(fmtPct(4.66666)).toBe("+4.67%");
        expect(fmtPct(-30.714)).toBe("−30.71%");
        expect(fmtPct(0.0009)).toBe("+<0.01%");
    });

    it("renders null as an en dash", () => {
        expect(fmtPct(null)).toBe("–");
    });
});

describe("fmtUnsignedPct", () => {
    it("preserves percentage precision and incomplete coverage", () => {
        expect(fmtUnsignedPct(99.999)).toBe("<100%");
        expect(fmtUnsignedPct(12345.6)).toBe("12,345.6%");
        expect(fmtUnsignedPct(0.0009)).toBe("<0.01%");
    });

    it("renders missing values as an en dash", () => {
        expect(fmtUnsignedPct(null)).toBe("–");
        expect(fmtUnsignedPct(undefined)).toBe("–");
    });
});

describe("precision at inspection boundaries", () => {
    it("retains ledger amounts and distinguishes zero from missing", () => {
        expect(fmtExactNumber(7860.25)).toBe("7,860.25");
        expect(fmtExactNumber(-0.19)).toBe("−0.19");
        expect(fmtExactNumber(0.00000123)).toBe("0.00000123");
        expect(fmtExactNumber(0)).toBe("0");
        expect(fmtExactNumber(null)).toBe("–");
        expect(fmtExactUsd(0.63)).toBe("$0.63");
        expect(fmtRateUsd(111.1 / 737.6)).toBe("$0.150624");
    });
    it("never rounds an incomplete percentage to 100%", () => {
        expect(fmtMarginPct(99.9)).toBe("99.9%");
        expect(fmtUnsignedPct(99.999)).toBe("<100%");
        expect(fmtUnsignedPct(100)).toBe("100%");
    });
});

it("filters only known sub-dollar amounts using raw magnitudes", () => {
    expect(hasVisibleAmount([0, 0.99, -0.99])).toBe(false);
    expect(hasVisibleAmount([1])).toBe(true);
    expect(hasVisibleAmount([-1])).toBe(true);
    expect(hasVisibleAmount([0, null])).toBe(true);
    expect(hasVisibleAmount([undefined])).toBe(true);
    expect(hasVisibleAmount([Number.NaN])).toBe(true);
});

it("removes binary arithmetic noise while retaining sub-cent precision", () => {
    expect(fmtExactUsd(0.1 + 0.2)).toBe("$0.3");
    expect(fmtExactNumber(-5.9399999999999995)).toBe("−5.94");
    expect(fmtExactUsd(0.000472)).toBe("$0.000472");
});
