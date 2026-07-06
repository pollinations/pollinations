import { describe, expect, it } from "vitest";
import { fmtMonthYear, fmtPeriod, hoursSince, utcDateTime } from "./format";

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

    it("utcDateTime emits UTC DateTime without timezone suffix", () => {
        expect(utcDateTime(new Date("2026-07-04T12:34:56.789Z"))).toBe(
            "2026-07-04 12:34:56",
        );
        expect(utcDateTime(new Date("2026-07-04T14:34:56+02:00"))).toBe(
            "2026-07-04 12:34:56",
        );
    });
});
