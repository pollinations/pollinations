/**
 * A USD amount: cents from $1, up to four
 * decimals below it, compact from $100,000. Rounds toward zero, so a balance
 * is never overstated.
 */
export function formatUsd(pollen: number): string {
    const abs = Math.abs(pollen);
    if (abs > 0 && abs < 0.0001) return pollen > 0 ? "<$0.0001" : ">-$0.0001";
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: abs >= 100_000 ? "compact" : "standard",
        maximumFractionDigits: abs >= 1 ? 2 : 4,
        roundingMode: "trunc",
    }).format(pollen);
}
