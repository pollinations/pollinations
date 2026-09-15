import {
    getPeriodBucketKeys,
    isPeriodSelectable,
    type PeriodSelection,
    periodFromDate,
    periodToWindow,
} from "@pollinations/ui";

export type ActivityPeriod = PeriodSelection & {
    bucket?: string;
    anchor?: string;
};
export const ACTIVITY_MIN_DATE = new Date("2026-01-01T00:00:00Z");

export function activityDate(value: ActivityPeriod): Date {
    return periodToWindow(value).start;
}

export function isActivitySelectable(
    value: ActivityPeriod,
    now = new Date(),
): boolean {
    return isPeriodSelectable(value, ACTIVITY_MIN_DATE, now);
}

export function activityBucketKey(date: Date, value: PeriodSelection): string {
    return date
        .toISOString()
        .slice(0, value.granularity === "day" ? 13 : 10)
        .replace("T", " ");
}

export function parseActivityPeriod(
    granularity: unknown,
    period: unknown,
    bucket: unknown,
    anchor?: unknown,
): ActivityPeriod {
    const fallback = periodFromDate("day");
    if (
        (granularity !== "day" &&
            granularity !== "week" &&
            granularity !== "month") ||
        typeof period !== "string"
    )
        return fallback;
    const pattern =
        granularity === "day"
            ? /^\d{4}-\d{2}-\d{2}$/
            : granularity === "week"
              ? /^\d{4}-W\d{2}$/
              : /^\d{4}-\d{2}$/;
    if (!pattern.test(period)) return fallback;
    const value: ActivityPeriod = { granularity, period };
    const date = activityDate(value);
    if (
        !Number.isFinite(date.getTime()) ||
        periodFromDate(granularity, date).period !== period ||
        !isActivitySelectable(value)
    )
        return fallback;
    if (
        typeof bucket === "string" &&
        getPeriodBucketKeys(value).some(
            (key) => key.slice(0, granularity === "day" ? 13 : 10) === bucket,
        )
    ) {
        const selectedDate = new Date(
            granularity === "day"
                ? `${bucket.replace(" ", "T")}:00:00Z`
                : `${bucket}T00:00:00Z`,
        );
        if (selectedDate >= ACTIVITY_MIN_DATE && selectedDate <= new Date())
            value.bucket = bucket;
    }
    if (
        granularity !== "day" &&
        typeof anchor === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(anchor)
    ) {
        const anchorDate = new Date(`${anchor}T00:00:00Z`);
        if (
            Number.isFinite(anchorDate.getTime()) &&
            anchorDate.toISOString().slice(0, 10) === anchor &&
            anchorDate >= ACTIVITY_MIN_DATE &&
            anchorDate <= new Date()
        )
            value.anchor = anchor;
    }
    return value;
}

// The anchor keeps the preferred day even while viewing a shorter month.
function rememberedActivityDate(value: ActivityPeriod, now = new Date()): Date {
    const start = activityDate(value);
    const anchor = new Date(
        `${value.bucket?.slice(0, 10) ?? value.anchor ?? start.toISOString().slice(0, 10)}T00:00:00Z`,
    );
    if (value.granularity === "month") {
        const lastDay = new Date(
            Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
        ).getUTCDate();
        start.setUTCDate(Math.min(anchor.getUTCDate(), lastDay));
    } else if (value.granularity === "week") {
        start.setUTCDate(start.getUTCDate() + ((anchor.getUTCDay() + 6) % 7));
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
    if (next.granularity === "day") return next;
    const date = rememberedActivityDate(value);
    if (next.granularity === "month") {
        return {
            ...next,
            anchor:
                value.bucket?.slice(0, 10) ??
                value.anchor ??
                date.toISOString().slice(0, 10),
        };
    }
    const start = activityDate(next);
    start.setUTCDate(start.getUTCDate() + ((date.getUTCDay() + 6) % 7));
    return { ...next, anchor: start.toISOString().slice(0, 10) };
}

export function switchActivityView(
    value: ActivityPeriod,
    granularity: PeriodSelection["granularity"],
): ActivityPeriod {
    if (value.granularity === granularity) return value;
    const date = rememberedActivityDate(value);
    const next = periodFromDate(granularity, date);
    return granularity === "day"
        ? next
        : { ...next, anchor: date.toISOString().slice(0, 10) };
}

export function shiftActivityPeriod(
    value: ActivityPeriod,
    direction: -1 | 1,
): ActivityPeriod {
    const date = activityDate(value);
    if (value.granularity === "month")
        date.setUTCMonth(date.getUTCMonth() + direction);
    else
        date.setUTCDate(
            date.getUTCDate() +
                direction * (value.granularity === "week" ? 7 : 1),
        );
    return changeActivityPeriod(value, periodFromDate(value.granularity, date));
}

export function toggleActivityBucket(
    value: ActivityPeriod,
    date: Date,
): ActivityPeriod {
    const bucket = activityBucketKey(date, value);
    return {
        ...value,
        ...(value.granularity !== "day"
            ? { anchor: date.toISOString().slice(0, 10) }
            : {}),
        bucket: value.bucket === bucket ? undefined : bucket,
    };
}

export function isInActivityBucket(
    date: string,
    value: ActivityPeriod,
): boolean {
    return (
        value.bucket === undefined ||
        date
            .replace("T", " ")
            .slice(0, value.granularity === "day" ? 13 : 10) === value.bucket
    );
}
