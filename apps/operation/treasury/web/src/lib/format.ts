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

/** Tinybird DateTime strings ("YYYY-MM-DD HH:MM:SS") are UTC. */
export function hoursSince(runAt: string, nowMs: number = Date.now()): number {
    const t = Date.parse(`${runAt.replace(" ", "T")}Z`);
    if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
    return (nowMs - t) / 3_600_000;
}

export function fmtSmartNumber(
    value: number,
    {
        compactAt = 10_000,
        tinyAt = 0.01,
    }: { compactAt?: number; tinyAt?: number } = {},
): string {
    const abs = Math.abs(value);
    if (abs > 0 && abs < tinyAt) return `<${formatFourDigits(tinyAt)}`;
    const units = [
        { value: 1_000_000_000_000, suffix: "T" },
        { value: 1_000_000_000, suffix: "B" },
        { value: 1_000_000, suffix: "M" },
        { value: 1_000, suffix: "k" },
    ];
    const unit =
        abs >= compactAt ? units.find((item) => abs >= item.value) : null;
    const divisor = unit?.value ?? 1;
    return `${formatFourDigits(abs / divisor)}${unit?.suffix ?? ""}`;
}

function formatFourDigits(value: number): string {
    if (value === 0) return "0";

    if (value < 1) {
        const truncated = truncateDecimals(value, 2);
        return new Intl.NumberFormat("en-US", {
            maximumFractionDigits: 2,
        }).format(truncated);
    }

    const integerDigits = Math.floor(value).toString().length;
    const decimals = Math.min(2, Math.max(0, 4 - integerDigits));
    const truncated = truncateDecimals(value, decimals);
    return new Intl.NumberFormat("en-US", {
        maximumFractionDigits: decimals,
    }).format(truncated);
}

function truncateDecimals(value: number, decimals: number): number {
    if (decimals <= 0) return Math.trunc(value);
    const text = String(value);
    if (!text.includes(".") || text.includes("e")) {
        const scale = 10 ** decimals;
        return Math.trunc(value * scale) / scale;
    }
    const [integer, fraction = ""] = text.split(".");
    return Number(`${integer}.${fraction.slice(0, decimals)}`);
}

// Insight money: adaptive precision, en dash for unknown. Uses U+2212 minus so
// negatives read cleanly next to the $.
export function fmtUsd(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "–";
    const magnitude = fmtSmartNumber(Math.abs(value));
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

export function fmtPct(value: number | null): string {
    if (value == null || !Number.isFinite(value)) return "–";
    const magnitude = fmtSmartNumber(Math.abs(value));
    return value < 0 ? `−${magnitude}%` : `+${magnitude}%`;
}

export function fmtUnsignedPct(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "–";
    return `${fmtSmartNumber(value)}%`;
}

export function fmtMultiplier(value: number | null): string {
    if (value == null || !Number.isFinite(value)) return "–";
    return `${fmtSmartNumber(value)}×`;
}

// 4-decimal dollar format for tiny unit costs (e.g. eff $/req).
export function fmtUsd4(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "–";
    const abs = Math.abs(value);
    const formatted = new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
    }).format(abs);
    return value < 0 ? `−$${formatted}` : `$${formatted}`;
}
