import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activityCsv } from "../frontend/src/components/activity/activity-csv";
import {
    activityDate,
    changeActivityPeriod,
    isActivitySelectable,
    isInActivityBucket,
    parseActivityPeriod,
    shiftActivityPeriod,
    switchActivityView,
    toggleActivityBucket,
} from "../frontend/src/components/activity/activity-period";

describe("activity period and bar selection", () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-09-08T12:15:00Z"));
    });
    afterEach(() => vi.useRealTimers());
    it("clamps the remembered day to today and rejects future URL periods", () => {
        const month = {
            granularity: "month" as const,
            period: "2026-09",
            anchor: "2026-08-31",
        };
        expect(switchActivityView(month, "day").period).toBe("2026-09-08");
        expect(parseActivityPeriod("day", "2026-09-09", undefined).period).toBe(
            "2026-09-08",
        );
        expect(
            parseActivityPeriod("day", "2026-09-08", "2026-09-08 13").bucket,
        ).toBeUndefined();
    });
    it("selects an hour without changing the day and toggles it off", () => {
        const day = { granularity: "day" as const, period: "2026-08-31" };
        const date = new Date("2026-08-31T23:00:00Z");
        const selected = toggleActivityBucket(day, date);
        expect(selected).toEqual({ ...day, bucket: "2026-08-31 23" });
        expect(toggleActivityBucket(selected, date)).toEqual({
            ...day,
            bucket: undefined,
        });
    });
    it("selects a day without leaving month or week view", () => {
        for (const period of [
            { granularity: "month" as const, period: "2026-08" },
            { granularity: "week" as const, period: "2026-W32" },
        ]) {
            expect(
                toggleActivityBucket(period, new Date("2026-08-08T00:00:00Z")),
            ).toEqual({
                ...period,
                anchor: "2026-08-08",
                bucket: "2026-08-08",
            });
        }
    });
    it("moves across month and year boundaries and clears bar selection", () => {
        expect(
            shiftActivityPeriod(
                {
                    granularity: "day",
                    period: "2026-08-31",
                    bucket: "2026-08-31 23",
                },
                1,
            ),
        ).toEqual({ granularity: "day", period: "2026-09-01" });
        expect(
            shiftActivityPeriod({ granularity: "month", period: "2026-12" }, 1)
                .period,
        ).toBe("2027-01");
        expect(
            shiftActivityPeriod({ granularity: "week", period: "2026-W53" }, 1)
                .period,
        ).toBe("2027-W01");
    });
    it("remembers the day when switching views and changing months", () => {
        const day = { granularity: "day" as const, period: "2026-05-20" };
        const month = switchActivityView(day, "month");
        expect(month.period).toBe("2026-05");
        expect(switchActivityView(month, "day")).toEqual(day);
        expect(
            switchActivityView(shiftActivityPeriod(month, 1), "day").period,
        ).toBe("2026-06-20");
        expect(
            switchActivityView(
                changeActivityPeriod(month, {
                    granularity: "month",
                    period: "2026-07",
                }),
                "day",
            ).period,
        ).toBe("2026-07-20");
    });
    it("clamps short months without losing the preferred day while browsing months", () => {
        const january = switchActivityView(
            { granularity: "day", period: "2026-01-31" },
            "month",
        );
        const february = shiftActivityPeriod(january, 1);
        expect(switchActivityView(february, "day").period).toBe("2026-02-28");
        expect(
            switchActivityView(shiftActivityPeriod(february, 1), "day").period,
        ).toBe("2026-03-31");
    });
    it("uses a selected bar as the remembered day even after clearing selection", () => {
        const selected = toggleActivityBucket(
            { granularity: "month", period: "2026-05", anchor: "2026-05-20" },
            new Date("2026-05-09T00:00:00Z"),
        );
        expect(
            switchActivityView({ ...selected, bucket: undefined }, "day")
                .period,
        ).toBe("2026-05-09");
        // A linked selection takes precedence over an older remembered date.
        expect(
            switchActivityView(
                parseActivityPeriod(
                    "month",
                    "2026-08",
                    "2026-08-29",
                    "2026-05-20",
                ),
                "day",
            ).period,
        ).toBe("2026-08-29");
    });
    it("preserves the weekday in mobile week view across month boundaries", () => {
        const day = { granularity: "day" as const, period: "2026-05-31" };
        const week = switchActivityView(day, "week");
        expect(switchActivityView(week, "day")).toEqual(day);
        expect(
            switchActivityView(shiftActivityPeriod(week, 1), "day").period,
        ).toBe("2026-06-07");
        expect(
            switchActivityView(shiftActivityPeriod(week, 1), "month").period,
        ).toBe("2026-06");
    });
    it("restores date memory from the URL and ignores invalid anchors", () => {
        const month = parseActivityPeriod(
            "month",
            "2026-05",
            undefined,
            "2026-05-20",
        );
        expect(switchActivityView(month, "day").period).toBe("2026-05-20");
        expect(
            parseActivityPeriod("month", "2026-05", undefined, "2026-02-31")
                .anchor,
        ).toBeUndefined();
        expect(
            parseActivityPeriod("month", "2026-05", undefined, "bogus").anchor,
        ).toBeUndefined();
    });
    it("rejects invalid dates and selections outside their period", () => {
        expect(
            parseActivityPeriod("day", "2026-02-31", undefined).period,
        ).not.toBe("2026-02-31");
        expect(
            parseActivityPeriod("week", "2026-W99", undefined).granularity,
        ).toBe("day");
        expect(
            parseActivityPeriod("day", "2026-08-08", "2026-08-08 24"),
        ).toEqual({ granularity: "day", period: "2026-08-08" });
        expect(
            parseActivityPeriod("month", "2026-08", "2026-09-01").bucket,
        ).toBeUndefined();
        expect(
            parseActivityPeriod("day", "2026-08-08", "2026-08-08 04").bucket,
        ).toBe("2026-08-08 04");
    });
    it("bounds navigation and uses UTC dates", () => {
        const now = new Date("2026-09-08T12:15:00Z");
        expect(
            isActivitySelectable(
                { granularity: "day", period: "2025-12-31" },
                now,
            ),
        ).toBe(false);
        expect(
            isActivitySelectable(
                { granularity: "day", period: "2026-09-08" },
                now,
            ),
        ).toBe(true);
        expect(
            isActivitySelectable(
                { granularity: "day", period: "2026-09-09" },
                now,
            ),
        ).toBe(false);
        expect(
            activityDate({
                granularity: "day",
                period: "2026-08-08",
            }).toISOString(),
        ).toBe("2026-08-08T00:00:00.000Z");
    });
    it("filters the selected hour without adjacent hours or dates", () => {
        const period = {
            granularity: "day" as const,
            period: "2026-08-08",
            bucket: "2026-08-08 04",
        };
        expect(
            [
                "2026-08-08 03:00:00",
                "2026-08-08 04:00:00",
                "2026-08-08T04:30:00Z",
                "2026-08-08 05:00:00",
                "2026-08-09 04:00:00",
            ].filter((date) => isInActivityBucket(date, period)),
        ).toEqual(["2026-08-08 04:00:00", "2026-08-08T04:30:00Z"]);
    });
    it("filters a monthly day and restores every row when cleared", () => {
        const period = {
            granularity: "month" as const,
            period: "2026-08",
            bucket: "2026-08-08",
        };
        const dates = ["2026-08-07", "2026-08-08", "2026-08-09"];
        expect(
            dates.filter((date) => isInActivityBucket(date, period)),
        ).toEqual(["2026-08-08"]);
        expect(
            dates.filter((date) =>
                isInActivityBucket(date, { ...period, bucket: undefined }),
            ),
        ).toEqual(dates);
    });
});

describe("activity summary CSV", () => {
    it("preserves commas, quotes, newlines, zero and missing values", () => {
        expect(
            activityCsv(
                ["name", "pollen", "source"],
                [{ name: 'An "app",\nname', pollen: 0, source: null }],
            ),
        ).toBe('"name","pollen","source"\r\n"An ""app"",\nname","0",""');
    });
    it("escapes spreadsheet formulas in user-provided labels", () => {
        expect(activityCsv(["name"], [{ name: " =SUM(1,2)" }])).toContain(
            '"\' =SUM(1,2)"',
        );
    });
});
