/**
 * 984868 → "985K", 1204000 → "1.2M".
 *
 * One decimal below 10K, because rounding is most visible there: 4888 became
 * "5K", which claims a milestone the number hasn't reached.
 */
export function compact(value: number): string {
    if (value >= 1_000_000)
        return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
    if (value >= 10_000) return `${Math.round(value / 1_000)}K`;
    if (value >= 1_000)
        return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
    return String(value);
}
