import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// Workers always run in UTC; exercise the actual browser helpers in real zones.
if (!process.env.ACTIVITY_TIMEZONE_TEST_CHILD) {
    for (const timezone of [
        "UTC",
        "Europe/Berlin",
        "Asia/Kolkata",
        "Australia/Lord_Howe",
        "America/Los_Angeles",
    ]) {
        test(`activity in ${timezone}`, () => {
            const child = spawnSync(
                process.execPath,
                [
                    "--experimental-strip-types",
                    "--test",
                    fileURLToPath(import.meta.url),
                ],
                {
                    encoding: "utf8",
                    env: {
                        ...process.env,
                        TZ: timezone,
                        LANG: "en_GB.UTF-8",
                        LC_ALL: "en_GB.UTF-8",
                        ACTIVITY_TIMEZONE_TEST_CHILD: "1",
                    },
                },
            );
            assert.equal(child.status, 0, child.stdout + child.stderr);
        });
    }
} else {
    const {
        activityBucketKey,
        activityBucketKeyToDate,
        activityDate,
        activityPeriodFromDate,
        activityTimezone,
        activityWindow,
        getActivityBucketKeys,
        isActivitySelectable,
        isInActivityBucket,
        parseActivityPeriod,
        shiftActivityPeriod,
        switchActivityView,
        toggleActivityBucket,
    } = await import("../frontend/src/components/activity/activity-period.ts");
    const { formatActivityTimestamp, formatActivityChartDate } = await import(
        "../frontend/src/components/activity/format-activity-date.ts"
    );
    const day = (period) => ({ granularity: "day", period });
    const month = (period) => ({ granularity: "month", period });

    test("uses local today and bounds around local midnight", (t) => {
        const today = day("2026-09-01");
        const now = new Date(activityDate(today).getTime() + 30 * 60 * 1000);
        t.mock.timers.enable({ apis: ["Date"], now: now.getTime() });
        assert.equal(typeof activityTimezone(), "string");
        assert.deepEqual(activityPeriodFromDate("day"), today);
        assert.deepEqual(
            parseActivityPeriod(undefined, undefined, undefined),
            today,
        );
        assert.deepEqual(
            parseActivityPeriod("day", "2026-09-02", undefined),
            today,
        );
        assert.deepEqual(
            parseActivityPeriod("day", "2026-02-31", undefined),
            today,
        );
        assert.equal(isActivitySelectable(day("2026-09-01"), now), true);
        assert.equal(isActivitySelectable(day("2026-09-02"), now), false);
        assert.equal(isActivitySelectable(day("2025-12-31"), now), false);
    });

    test("keeps calendar navigation and selected-hour anchors local", (t) => {
        t.mock.timers.enable({
            apis: ["Date"],
            now: new Date(2026, 10, 10).getTime(),
        });
        const january = switchActivityView(day("2026-01-31"), "month");
        const february = shiftActivityPeriod(january, 1);
        assert.equal(switchActivityView(february, "day").period, "2026-02-28");
        assert.equal(
            switchActivityView(shiftActivityPeriod(february, 1), "day").period,
            "2026-03-31",
        );
        const selected = toggleActivityBucket(
            day("2026-08-31"),
            new Date(2026, 7, 31, 0, 30),
        );
        assert.equal(
            switchActivityView(selected, "month").anchor,
            "2026-08-31",
        );
        assert.equal(shiftActivityPeriod(selected, 1).period, "2026-09-01");
        assert.deepEqual(
            parseActivityPeriod("day", selected.period, selected.bucket),
            selected,
        );
    });

    test("fills local month days and filters their calendar dates", () => {
        const period = month("2026-03");
        const keys = getActivityBucketKeys(period);
        assert.equal(keys.length, 31);
        assert.equal(keys[0], "2026-03-01");
        assert.equal(keys.at(-1), "2026-03-31");
        const first = activityBucketKeyToDate(keys[0], "month");
        assert.equal(first.getDate(), 1);
        assert.equal(first.getHours(), 0);
        assert.equal(formatActivityChartDate(first, false).label, "Mar 1");
        assert.equal(
            isInActivityBucket("2026-03-01", { ...period, bucket: keys[0] }),
            true,
        );
        assert.equal(
            isInActivityBucket("2026-03-02", { ...period, bucket: keys[0] }),
            false,
        );
    });

    test("displays the reported UTC timestamp in the local timezone", () => {
        const expected = {
            UTC: "07:16",
            "Europe/Berlin": "09:16",
            "Asia/Kolkata": "12:46",
            "Australia/Lord_Howe": "18:16",
            "America/Los_Angeles": "00:16",
        }[process.env.TZ];
        assert.ok(
            formatActivityTimestamp("2026-10-16 07:16:00").includes(expected),
        );
    });

    test("keeps hour buckets unique and aligned to local midnight", () => {
        const period = day("2026-10-16");
        const keys = getActivityBucketKeys(period);
        assert.equal(keys.length, 24);
        assert.equal(new Set(keys).size, keys.length);
        const first = activityBucketKeyToDate(keys[0], "day");
        assert.equal(first.getHours(), 0);
        assert.equal(first.getMinutes(), 0);
        assert.equal(activityBucketKey(first, period), keys[0]);
        assert.equal(
            isInActivityBucket(keys[0], { ...period, bucket: keys[0] }),
            true,
        );
        const withinHour = new Date(
            first.getTime() + 30 * 60 * 1000,
        ).toISOString();
        assert.equal(
            isInActivityBucket(withinHour, { ...period, bucket: keys[0] }),
            true,
        );
        assert.equal(
            isInActivityBucket(keys[1], { ...period, bucket: keys[0] }),
            false,
        );
        if (process.env.TZ === "Asia/Kolkata")
            assert.equal(keys[0], "2026-10-15 18:30:00");
    });

    if (process.env.TZ === "Europe/Berlin") {
        test("skips the missing spring hour and separates both repeated autumn hours", (t) => {
            t.mock.timers.enable({
                apis: ["Date"],
                now: new Date(2026, 10, 10).getTime(),
            });
            const spring = getActivityBucketKeys(day("2026-03-29"));
            assert.equal(spring.length, 23);
            assert.equal(
                spring.some(
                    (key) =>
                        activityBucketKeyToDate(key, "day").getHours() === 2,
                ),
                false,
            );
            const period = day("2026-10-25");
            const autumn = getActivityBucketKeys(period);
            assert.equal(autumn.length, 25);
            const repeated = autumn.filter(
                (key) => activityBucketKeyToDate(key, "day").getHours() === 2,
            );
            assert.equal(repeated.length, 2);
            const [first, second] = repeated.map((key) =>
                formatActivityChartDate(
                    activityBucketKeyToDate(key, "day"),
                    true,
                ),
            );
            assert.equal(first.label, second.label);
            assert.notEqual(first.fullDate, second.fullDate);
            const selected = { ...period, bucket: repeated[1] };
            assert.equal(isInActivityBucket(repeated[0], selected), false);
            assert.equal(isInActivityBucket(repeated[1], selected), true);
            assert.deepEqual(
                parseActivityPeriod("day", period.period, repeated[1]),
                selected,
            );
        });
    }

    if (process.env.TZ === "Australia/Lord_Howe") {
        test("covers the partial final bucket on half-hour DST transitions", () => {
            for (const [date, hours, count] of [
                ["2026-04-05", 24.5, 25],
                ["2026-10-04", 23.5, 24],
            ]) {
                const period = day(date);
                const { start, end } = activityWindow(period);
                const keys = getActivityBucketKeys(period);
                assert.equal((end - start) / 3600000, hours);
                assert.equal(keys.length, count);
                assert.equal(
                    end - activityBucketKeyToDate(keys.at(-1), "day"),
                    1800000,
                );
                assert.equal(
                    activityBucketKey(new Date(end.getTime() - 1), period),
                    keys.at(-1),
                );
                assert.equal(
                    isInActivityBucket(end.toISOString(), {
                        ...period,
                        bucket: keys.at(-1),
                    }),
                    false,
                );
            }
        });
    }
}
