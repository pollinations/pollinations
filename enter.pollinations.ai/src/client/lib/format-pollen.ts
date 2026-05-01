export function formatPollen(value: number): string {
    if (value === 0) return "0";
    // Up to 4 decimals for fractional values, up to 2 otherwise; strip trailing zeros
    // so 0.12 stays "0.12" instead of "0.120". Falls back to toPrecision for values
    // too small to round into the cap (e.g. 0.00001).
    const decimals = Math.abs(value) < 1 ? 4 : 2;
    const trimmed = Number(value.toFixed(decimals)).toString();
    return trimmed === "0" ? value.toPrecision(2) : trimmed;
}
