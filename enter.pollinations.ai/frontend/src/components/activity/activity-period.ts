import type { PeriodSelection } from "@pollinations/ui";

export type ActivityPeriod = PeriodSelection & {
    granularity: "day" | "month";
    bucket?: string;
    anchor?: string;
};
export const ACTIVITY_MIN_DATE = new Date(2026, 0, 1);
export const ACTIVITY_MIN_CALENDAR_DATE = new Date("2026-01-01T00:00:00Z");
const HOUR = 60 * 60 * 1000;

export function activityTimezone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function datePeriod(date: Date): string {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
    ].join("-");
}

export function activityPeriodFromDate(
    granularity: ActivityPeriod["granularity"],
    date = new Date(),
): ActivityPeriod {
    return {
        granularity,
        period: datePeriod(date).slice(0, granularity === "day" ? 10 : 7),
    };
}

export function activityWindow(value: ActivityPeriod): {
    start: Date;
    end: Date;
} {
    const [year, month, day = 1] = value.period.split("-").map(Number);
    const start = new Date(year, month - 1, day);
    const end =
        value.granularity === "day"
            ? new Date(year, month - 1, day + 1)
            : new Date(year, month, 1);
    return { start, end };
}

export function activityDate(value: ActivityPeriod): Date {
    return activityWindow(value).start;
}

export function isActivitySelectable(
    value: ActivityPeriod,
    now = new Date(),
): boolean {
    const { start, end } = activityWindow(value);
    return end > ACTIVITY_MIN_DATE && start <= now;
}

export function activityBucketKey(date: Date, value: ActivityPeriod): string {
    if (value.granularity !== "day") return datePeriod(date);
    const start = activityDate(value).getTime();
    const bucket = new Date(
        start + Math.floor((date.getTime() - start) / HOUR) * HOUR,
    );
    return bucket.toISOString().slice(0, 19).replace("T", " ");
}

export function getActivityBucketKeys(value: ActivityPeriod): string[] {
    const { start, end } = activityWindow(value);
    const keys: string[] = [];
    const cursor = new Date(start);
    while (cursor < end) {
        keys.push(activityBucketKey(cursor, value));
        if (value.granularity === "day")
            cursor.setTime(cursor.getTime() + HOUR);
        else cursor.setDate(cursor.getDate() + 1);
    }
    return keys;
}

export function activityBucketKeyToDate(
    key: string,
    granularity: ActivityPeriod["granularity"],
): Date {
    if (granularity === "day")
        return new Date(`${key.replace(" ", "T").replace(/Z$/, "")}Z`);
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day);
}

export function parseActivityPeriod(
    granularity: unknown,
    period: unknown,
    bucket: unknown,
    anchor?: unknown,
): ActivityPeriod {
    const fallback = activityPeriodFromDate("day");
    if (
        (granularity !== "day" && granularity !== "month") ||
        typeof period !== "string"
    )
        return fallback;
    const pattern =
        granularity === "day" ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}$/;
    if (!pattern.test(period)) return fallback;
    const value: ActivityPeriod = { granularity, period };
    const date = activityDate(value);
    if (
        !Number.isFinite(date.getTime()) ||
        activityPeriodFromDate(granularity, date).period !== period ||
        !isActivitySelectable(value)
    )
        return fallback;
    if (
        typeof bucket === "string" &&
        getActivityBucketKeys(value).includes(bucket)
    ) {
        const selectedDate = activityBucketKeyToDate(bucket, granularity);
        if (selectedDate >= ACTIVITY_MIN_DATE && selectedDate <= new Date())
            value.bucket = bucket;
    }
    if (
        granularity !== "day" &&
        typeof anchor === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(anchor)
    ) {
        const anchorDate = activityBucketKeyToDate(anchor, "month");
        if (
            Number.isFinite(anchorDate.getTime()) &&
            datePeriod(anchorDate) === anchor &&
            anchorDate >= ACTIVITY_MIN_DATE &&
            anchorDate <= new Date()
        )
            value.anchor = anchor;
    }
    return value;
}

function selectedDate(value: ActivityPeriod): string | undefined {
    return value.bucket
        ? datePeriod(activityBucketKeyToDate(value.bucket, value.granularity))
        : value.anchor;
}

// The anchor keeps the preferred day even while viewing a shorter month.
function rememberedActivityDate(value: ActivityPeriod, now = new Date()): Date {
    const start = activityDate(value);
    const anchor = activityBucketKeyToDate(
        selectedDate(value) ?? datePeriod(start),
        "month",
    );
    if (value.granularity === "month") {
        const lastDay = new Date(
            start.getFullYear(),
            start.getMonth() + 1,
            0,
        ).getDate();
        start.setDate(Math.min(anchor.getDate(), lastDay));
    }
    return new Date(
        Math.min(
            Math.max(start.getTime(), ACTIVITY_MIN_DATE.getTime()),
            now.getTime(),
        ),
    );
}

export function changeActivityPeriod(
    value: ActivityPeriod,
    next: PeriodSelection,
): ActivityPeriod {
    if (next.granularity === "week") return value;
    if (next.granularity === "day") return { ...next, granularity: "day" };
    return {
        ...next,
        granularity: "month",
        anchor:
            selectedDate(value) ?? datePeriod(rememberedActivityDate(value)),
    };
}

export function switchActivityView(
    value: ActivityPeriod,
    granularity: ActivityPeriod["granularity"],
): ActivityPeriod {
    if (value.granularity === granularity) return value;
    const date = rememberedActivityDate(value);
    const next = activityPeriodFromDate(granularity, date);
    return granularity === "day" ? next : { ...next, anchor: datePeriod(date) };
}

export function shiftActivityPeriod(
    value: ActivityPeriod,
    direction: -1 | 1,
): ActivityPeriod {
    const date = activityDate(value);
    if (value.granularity === "month")
        date.setMonth(date.getMonth() + direction);
    else date.setDate(date.getDate() + direction);
    return changeActivityPeriod(
        value,
        activityPeriodFromDate(value.granularity, date),
    );
}

export function toggleActivityBucket(
    value: ActivityPeriod,
    date: Date,
): ActivityPeriod {
    const bucket = activityBucketKey(date, value);
    return {
        ...value,
        ...(value.granularity !== "day" ? { anchor: datePeriod(date) } : {}),
        bucket: value.bucket === bucket ? undefined : bucket,
    };
}

export function isInActivityBucket(
    date: string,
    value: ActivityPeriod,
): boolean {
    if (value.bucket === undefined) return true;
    const timestamp = activityBucketKeyToDate(date, value.granularity);
    const { start, end } = activityWindow(value);
    return (
        timestamp >= start &&
        timestamp < end &&
        activityBucketKey(timestamp, value) === value.bucket
    );
}
