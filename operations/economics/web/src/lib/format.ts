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

// Display filtering only: unknown amounts stay visible; totals use every record.
export function hasVisibleAmount(
    values: readonly (number | null | undefined)[],
): boolean {
    return values.some(
        (value) =>
            value == null || !Number.isFinite(value) || Math.abs(value) >= 1,
    );
}

// Normal display hides sub-unit amounts; exact inspection keeps the source value.
export function fmtSmartNumber(value: number): string {
    const magnitude = Math.abs(value);
    if (magnitude > 0 && magnitude < 1) return "";
    return new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 0,
    }).format(magnitude);
}

export function fmtUsd(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "–";
    // Monetary sums can land just below a decimal boundary in binary arithmetic.
    const magnitude = fmtSmartNumber(Number(Math.abs(value).toPrecision(12)));
    if (!magnitude) return "";
    return value < 0 ? `−$${magnitude}` : `$${magnitude}`;
}

export function fmtNumber(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "–";
    const magnitude = fmtSmartNumber(Number(Math.abs(value).toPrecision(12)));
    if (!magnitude) return "";
    return value < 0 ? `−${magnitude}` : magnitude;
}

export function fmtExactNumber(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "–";
    const magnitude = Number(Math.abs(value).toPrecision(12)).toLocaleString(
        "en-US",
        {
            maximumSignificantDigits: 12,
        },
    );
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

function percentageMagnitude(value: number, decimals: number): string {
    const magnitude = Math.abs(value);
    const step = 10 ** -decimals;
    if (magnitude > 0 && magnitude < step) return `<${step}`;
    if (magnitude < 100 && magnitude >= 100 - step / 2) return "<100";
    return magnitude.toLocaleString("en-US", {
        maximumFractionDigits: decimals,
    });
}

export function fmtPct(value: number | null, decimals = 2): string {
    if (value == null || !Number.isFinite(value)) return "–";
    const magnitude = percentageMagnitude(value, decimals);
    return value < 0 ? `−${magnitude}%` : `+${magnitude}%`;
}

// Margin percentages carry the − sign but drop the leading + — a positive
// margin is the unremarkable case.
export function fmtMarginPct(value: number | null, decimals = 2): string {
    return fmtPct(value, decimals).replace(/^\+/, "");
}

export function fmtUnsignedPct(
    value: number | null | undefined,
    decimals = 2,
): string {
    if (value == null || !Number.isFinite(value)) return "–";
    return `${percentageMagnitude(value, decimals)}%`;
}
