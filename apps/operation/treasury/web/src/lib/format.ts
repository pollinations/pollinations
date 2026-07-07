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
        tinyAt = 0.001,
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
        const truncated = Math.trunc(value * 1000) / 1000;
        return new Intl.NumberFormat("en-US", {
            maximumFractionDigits: 3,
        }).format(truncated);
    }

    const integerDigits = Math.floor(value).toString().length;
    const decimals = Math.max(0, 4 - integerDigits);
    const scale = 10 ** decimals;
    const truncated = Math.trunc(value * scale) / scale;
    return new Intl.NumberFormat("en-US", {
        maximumFractionDigits: decimals,
    }).format(truncated);
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
