export function formatPollen(value: number, decimals = 4): string {
    if (value === 0) return "0";

    const abs = Math.abs(value);
    if (abs < 0.0001) return value.toPrecision(2);

    // Truncate (don't round) to `decimals`; Number().toString() drops trailing zeros.
    const factor = 10 ** decimals;
    const truncated = Math.trunc(value * factor) / factor;
    const trimmed = truncated.toString();
    return trimmed === "0" ? value.toPrecision(2) : trimmed;
}
