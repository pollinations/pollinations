const MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

export function fmtMonthYear(year: string, month: string): string {
    const name = MONTH_NAMES[Number(month) - 1];
    if (!name) return `${year}-${month}`;
    return `${name} ${year.slice(-2)}`;
}

function fmtMonthDayYear(year: string, month: string, day: string): string {
    const name = MONTH_NAMES[Number(month) - 1];
    if (!name) return `${year}-${month}-${day}`;
    return `${name} ${Number(day)}, ${year.slice(-2)}`;
}

export function fmtPeriod(value: string | null | undefined): string {
    if (!value) return "-";
    const trimmed = value.trim();
    const match = trimmed.match(
        /^(\d{4})-(\d{2})(?:-(\d{2})(?:[ T](\d{2}:\d{2}:\d{2}))?)?/,
    );
    if (!match) return trimmed;
    const [, year, month, day, time] = match;
    const monthYear = fmtMonthYear(year, month);
    if (!day) return monthYear;

    const dayLabel = fmtMonthDayYear(year, month, day);
    return time ? `${dayLabel} ${time}` : dayLabel;
}

export function fmtUtcDateTime(value: string | null | undefined): string {
    if (!value) return "-";
    const trimmed = value.trim();
    const match = trimmed.match(
        /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/,
    );
    if (!match) return trimmed;

    const [, date, hour, minute, second = "00"] = match;
    if (!hour || (hour === "00" && minute === "00" && second === "00")) {
        return date;
    }
    const time =
        second === "00" ? `${hour}:${minute}` : `${hour}:${minute}:${second}`;
    return `${date} ${time}`;
}

// Compact date inside a selected-year view; full UTC boundaries stay on hover.
export function fmtMonthDay(value: string): string {
    const match = value.match(/^\d{4}-(\d{2})-(\d{2})/);
    if (!match) return value || "–";
    const name = MONTH_NAMES[Number(match[1]) - 1];
    return name ? `${name.slice(0, 3)} ${Number(match[2])}` : value;
}

// Display whole units; preserve nonzero amounts below one without showing decimals.
export function fmtSmartNumber(value: number): string {
    const magnitude = Math.abs(value);
    if (magnitude > 0 && magnitude < 1) return "<1";
    return new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 0,
    }).format(magnitude);
}

export function fmtUsd(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "–";
    // Monetary sums can land just below a decimal boundary in binary arithmetic.
    const magnitude = fmtSmartNumber(Number(Math.abs(value).toPrecision(12)));
    if (magnitude.startsWith("<")) {
        return value < 0
            ? `−<${"$"}${magnitude.slice(1)}`
            : `<$${magnitude.slice(1)}`;
    }
    return value < 0 ? `−$${magnitude}` : `$${magnitude}`;
}

export function fmtNumber(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "–";
    const magnitude = fmtSmartNumber(Math.abs(value));
    return value < 0 ? `−${magnitude}` : magnitude;
}

export function fmtExactNumber(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "–";
    const magnitude = Math.abs(value).toLocaleString("en-US", {
        maximumSignificantDigits: 21,
    });
    return value < 0 ? `−${magnitude}` : magnitude;
}

export function fmtExactUsd(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "–";
    return `${value < 0 ? "−" : ""}$${fmtExactNumber(Math.abs(value))}`;
}

export function fmtRateUsd(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "–";
    return fmtExactUsd(Number(value.toPrecision(6)));
}

function percentageMagnitude(value: number): string {
    const magnitude = Math.abs(value);
    if (magnitude > 0 && magnitude < 0.01) return "<0.01";
    if (magnitude < 100 && magnitude >= 99.995) return "<100";
    return magnitude.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function fmtPct(value: number | null): string {
    if (value == null || !Number.isFinite(value)) return "–";
    const magnitude = percentageMagnitude(value);
    return value < 0 ? `−${magnitude}%` : `+${magnitude}%`;
}

// Margin percentages carry the − sign but drop the leading + — a positive
// margin is the unremarkable case.
export function fmtMarginPct(value: number | null): string {
    return fmtPct(value).replace(/^\+/, "");
}

export function fmtUnsignedPct(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "–";
    return `${percentageMagnitude(value)}%`;
}
