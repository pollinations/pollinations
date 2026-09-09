const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function isoDate(timestamp) {
    return new Date(timestamp).toISOString().slice(0, 10);
}

/** Align this week's daily Stripe revenue with the same weekdays last week. */
export function buildDailyRevenueComparison(rows, now = new Date()) {
    const today = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
    );
    const dayIndex = (now.getUTCDay() + 6) % 7;
    const currentMonday = today - dayIndex * DAY_MS;
    const revenueByDate = new Map(
        (rows ?? []).map((row) => [row.date.slice(0, 10), row.revenue]),
    );

    return DAY_LABELS.slice(0, dayIndex + 1).map((day, index) => {
        const currentDate = isoDate(currentMonday + index * DAY_MS);
        const previousDate = isoDate(currentMonday + (index - 7) * DAY_MS);
        return {
            week: currentDate,
            day,
            currentRevenue: revenueByDate.get(currentDate) ?? 0,
            previousRevenue: revenueByDate.get(previousDate) ?? 0,
        };
    });
}
