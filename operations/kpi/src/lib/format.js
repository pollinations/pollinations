export function formatValue(value, format = "number") {
    if (value == null || Number.isNaN(value) || !Number.isFinite(value))
        return "—";
    if (format === "currency") {
        const sign = value < 0 ? "-" : "";
        const size = Math.abs(value);
        if (size > 0 && size < 10) return `${sign}$${size.toFixed(2)}`;
        return `${sign}$${Math.round(size).toLocaleString()}`;
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
    // Divide by the magnitude, not the signed value: a margin going from
    // -$0.63 to -$0.89 got worse, and dividing by a negative base would
    // report it as a rise.
    return ((current - previous) / Math.abs(previous)) * 100;
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
