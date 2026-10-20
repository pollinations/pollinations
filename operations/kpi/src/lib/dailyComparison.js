const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function isoDate(timestamp) {
    return new Date(timestamp).toISOString().slice(0, 10);
}

/** Keep a full previous week visible while this week fills in, using UTC days. */
export function buildDailyComparison(
    revenueRows,
    signupRows,
    now = new Date(),
) {
    const today = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
    );
    const dayIndex = (now.getUTCDay() + 6) % 7;
    const currentMonday = today - dayIndex * DAY_MS;
    const revenueByDate = new Map(
        (revenueRows ?? []).map((row) => [row.date.slice(0, 10), row.revenue]),
    );
    const signupsByDate = new Map(
        (signupRows ?? []).map((row) => [row.date, row.registrations]),
    );
    const signupThrough = signupRows?.[0]?.snapshot_at?.slice(0, 10);
    const revenueAt = (date) =>
        revenueRows == null ? null : (revenueByDate.get(date) ?? 0);
    const signupsAt = (date) =>
        !signupThrough || date > signupThrough
            ? null
            : (signupsByDate.get(date) ?? 0);

    return DAY_LABELS.map((day, index) => {
        const currentDate = isoDate(currentMonday + index * DAY_MS);
        const previousDate = isoDate(currentMonday + (index - 7) * DAY_MS);
        return {
            week: currentDate,
            day,
            currentRevenue: index > dayIndex ? null : revenueAt(currentDate),
            previousRevenue: revenueAt(previousDate),
            currentSignups: index > dayIndex ? null : signupsAt(currentDate),
            previousSignups: signupsAt(previousDate),
        };
    });
}
