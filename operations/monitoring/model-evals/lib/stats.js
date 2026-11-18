const Z = 1.96;

/**
 * Score with a 95% Wilson interval. It stays honest at small
 * sample sizes and at 0% / 100%, where the plain normal approximation would
 * claim zero uncertainty. Its bounds are asymmetric near 0% and 100%.
 */
export function scoreOf(correct, total) {
    if (total === 0) return { rate: 0, lower: 0, upper: 0 };
    const p = correct / total;
    const scale = 1 + (Z * Z) / total;
    const center = (p + (Z * Z) / (2 * total)) / scale;
    const halfWidth =
        (Z * Math.sqrt((p * (1 - p)) / total + (Z * Z) / (4 * total * total))) /
        scale;
    return { rate: p, lower: center - halfWidth, upper: center + halfWidth };
}
