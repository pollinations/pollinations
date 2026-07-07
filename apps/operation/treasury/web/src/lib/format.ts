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
    { compactAt = 10_000 }: { compactAt?: number } = {},
): string {
    const abs = Math.abs(value);
    const units = [
        { value: 1_000_000_000_000, suffix: "T" },
        { value: 1_000_000_000, suffix: "B" },
        { value: 1_000_000, suffix: "M" },
        { value: 1_000, suffix: "k" },
    ];
    const unit =
        abs >= compactAt ? units.find((item) => abs >= item.value) : null;
    const divisor = unit?.value ?? 1;
    return `${formatFourSig(abs / divisor)}${unit?.suffix ?? ""}`;
}

function formatFourSig(value: number): string {
    if (value === 0) return "0";
    const magnitude = Math.floor(Math.log10(value));
    const scale = 10 ** (magnitude - 3);
    const truncated = Math.trunc(value / scale) * scale;
    const decimals = Math.max(
        0,
        3 - Math.floor(Math.log10(truncated || value)),
    );
    return new Intl.NumberFormat("en-US", {
        maximumFractionDigits: decimals,
    }).format(truncated);
}

// Insight money: adaptive precision, en dash for unknown. Uses U+2212 minus so
// negatives read cleanly next to the $.
export function fmtUsd(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return "–";
    const magnitude = fmtSmartNumber(Math.abs(value));
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
