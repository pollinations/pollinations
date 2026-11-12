/**
 * A Pollen amount in dollars (1 Pollen is worth $1): cents from $1, up to four
 * decimals below it, compact from $100,000. Rounds toward zero, so a balance
 * is never overstated.
 */
export function formatUsd(pollen: number): string {
    const abs = Math.abs(pollen);
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: abs >= 100_000 ? "compact" : "standard",
        maximumFractionDigits: abs >= 1 ? 2 : 4,
        roundingMode: "trunc",
    }).format(pollen);
}
