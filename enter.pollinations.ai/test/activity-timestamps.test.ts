import { formatActivityChartDate } from "@frontend/components/activity/format-activity-chart-date";
import { describe, expect, it } from "vitest";

/**
 * These tests verify that formatActivityChartDate (used by the "Events over
 * time" chart) does NOT hardcode timeZone: "UTC". Since the test runner may
 * itself run in UTC, we verify the function produces output consistent with
 * the default Intl formatter (which uses the process timezone) rather than
 * a hardcoded UTC formatter.
 *
 * The fix for issue #13651 removed explicit `timeZone: "UTC"` options so
 * Intl.DateTimeFormat defaults to the browser's (or process's) local timezone.
 */
describe("formatActivityChartDate", () => {
    // A timestamp that is 23:30 UTC on Aug 20 — in IST (UTC+5:30) this is
    // 05:00 on Aug 21. In US Pacific (UTC-7) it's 16:30 on Aug 20.
    // The key property: the date portion differs between UTC and IST.
    const testDate = new Date("2026-08-20T23:30:00.000Z");

    it("hourly label matches default-timezone toLocaleTimeString", () => {
        const { label } = formatActivityChartDate(testDate, true);
        // Reproduce what the formatter should do: use the same Intl options
        // but without a hardcoded timeZone — so it uses the process timezone.
        const expected = testDate.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
        expect(label).toBe(expected);
    });

    it("daily label matches default-timezone toLocaleDateString", () => {
        const { label } = formatActivityChartDate(testDate, false);
        const expected = testDate.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
        });
        expect(label).toBe(expected);
    });

    it("hourly fullDate matches default-timezone with time", () => {
        const { fullDate } = formatActivityChartDate(testDate, true);
        const expected = testDate.toLocaleDateString("en-US", {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
        expect(fullDate).toBe(expected);
    });

    it("daily fullDate matches default-timezone date-only", () => {
        const { fullDate } = formatActivityChartDate(testDate, false);
        const expected = testDate.toLocaleDateString("en-US", {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
        });
        expect(fullDate).toBe(expected);
    });

    it("does NOT produce UTC output when process tz differs", () => {
        // This is a structural check: verify the function does not pass
        // timeZone: "UTC". We do this by comparing against the known UTC
        // output — if the process is NOT in UTC, they should differ.
        // If the process IS in UTC, this test is a no-op (both match).
        const utcLabel = testDate.toLocaleTimeString("en-US", {
            timeZone: "UTC",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
        const localLabel = testDate.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
        const { label } = formatActivityChartDate(testDate, true);

        // The function output must match the local formatter, not the UTC one
        expect(label).toBe(localLabel);
        // If tz != UTC, also confirm it differs from UTC
        if (localLabel !== utcLabel) {
            expect(label).not.toBe(utcLabel);
        }
    });
});
