const compactCount = new Intl.NumberFormat("en", { notation: "compact" });

/** A count short enough for a label: 999, 1.2K, 12K, 123K, 1.5M. */
export function formatCount(value: number): string {
    // Compact notation shows one decimal under 10 of a unit (1.2K) and whole
    // units above (12K). Cut to that precision first so it never rounds up:
    // 1,999 as "2K" would claim a milestone it hasn't reached.
    const abs = Math.abs(value);
    if (abs < 1000) return compactCount.format(Math.trunc(value));
    const unit = 10 ** (3 * Math.floor(Math.log10(abs) / 3));
    const step = abs / unit < 10 ? unit / 10 : unit;
    return compactCount.format(Math.trunc(value / step) * step);
}
