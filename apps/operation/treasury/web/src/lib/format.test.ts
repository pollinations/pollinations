import { describe, expect, it } from "vitest";
import { hoursSince, utcDateTime } from "./format";

describe("format", () => {
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
