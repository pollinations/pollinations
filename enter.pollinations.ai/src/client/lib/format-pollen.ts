export function formatPollen(value: number): string {
    if (value === 0) return "0";

    // Keep small deltas and near-integer fractional balances visible while still
    // trimming routine trailing zeros.
    const abs = Math.abs(value);
    if (abs < 0.0001) return value.toPrecision(2);

    const decimals = abs < 1 ? 4 : 2;
    const rounded = Number(value.toFixed(decimals));
    const displayValue =
        abs < 1 && Math.abs(rounded) >= 1
            ? Math.trunc(value * 10 ** decimals) / 10 ** decimals
            : rounded;
    const trimmed = displayValue.toString();
    return trimmed === "0" ? value.toPrecision(2) : trimmed;
}
