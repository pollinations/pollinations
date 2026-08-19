export function formatValue(value, format = "number") {
    if (value == null || Number.isNaN(value) || !Number.isFinite(value))
        return "—";
    if (format === "currency") {
        if (Math.abs(value) > 0 && Math.abs(value) < 1)
            return `$${value.toFixed(2)}`;
        return `$${Math.round(value).toLocaleString()}`;
    }
    if (format === "percent") return `${Math.round(value)}%`;
    if (format === "compact") {
        if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
        if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
        if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
    }
    return Math.round(value).toLocaleString();
}

export function calcChange(current, previous) {
    if (!previous || !current) return null;
    return ((current - previous) / previous) * 100;
}

/** Week keys are ISO Monday dates; the year is noise in a 12-week window. */
export function weekLabel(week) {
    return week ? week.slice(5) : "—";
}

/** Monday of the current (still incomplete) ISO week, in UTC. */
export function currentWeekStart() {
    const now = new Date();
    return new Date(
        Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() - ((now.getUTCDay() + 6) % 7),
        ),
    )
        .toISOString()
        .split("T")[0];
}
