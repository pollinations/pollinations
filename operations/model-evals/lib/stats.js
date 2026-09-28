const Z = 1.96;

/**
 * Score with a 95% margin of error. Wilson's interval stays honest at small
 * sample sizes and at 0% / 100%, where the plain normal approximation would
 * claim zero uncertainty. `moe` is the interval's half-width.
 */
export function scoreOf(correct, total) {
    if (total === 0) return { rate: 0, moe: 0 };
    const p = correct / total;
    const scale = 1 + (Z * Z) / total;
    const moe =
        (Z * Math.sqrt((p * (1 - p)) / total + (Z * Z) / (4 * total * total))) /
        scale;
    return { rate: p, moe };
}
