// 5-digit budget for pollen display. Integer takes its space, decimals fill
// the remainder (capped at 4), floor toward -infinity, trailing zeros stripped.
// Integers needing >=6 digits switch to compact (K/M/B, 3 sig figs).
// Decimal point and minus sign do not count toward the budget.

const BUDGET = 5;
const MAX_DECIMALS = 4;
const COMPACT_THRESHOLD = 100_000;

function floorTo(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.floor(value * factor) / factor;
}

function formatCompact(value: number): string {
    const abs = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    const [unit, scale] =
        abs >= 1e9
            ? (["B", 1e9] as const)
            : abs >= 1e6
              ? (["M", 1e6] as const)
              : (["K", 1e3] as const);
    const ratio = abs / scale;
    const intDigits = Math.max(1, Math.floor(Math.log10(ratio)) + 1);
    const decimals = Math.max(0, 3 - intDigits);
    const floored = floorTo(ratio, decimals);
    return `${sign}${Number(floored.toFixed(decimals)).toString()}${unit}`;
}

export function formatPollen(value: number): string {
    if (!Number.isFinite(value) || value === 0) return "0";

    const abs = Math.abs(value);

    if (abs >= COMPACT_THRESHOLD) return formatCompact(value);

    const intDigits = abs >= 1 ? Math.floor(Math.log10(abs)) + 1 : 1;
    const decimals = Math.min(MAX_DECIMALS, Math.max(0, BUDGET - intDigits));
    const floored = floorTo(value, decimals);
    if (floored === 0) return "0";
    return Number(floored.toFixed(decimals)).toString();
}
