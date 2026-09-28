export function wilsonMargin(successes, trials, z = 1.959963984540054) {
    if (trials <= 0) return 1;
    const p = successes / trials;
    const z2 = z * z;
    const denominator = 1 + z2 / trials;
    const half =
        (z * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials)) /
        denominator;
    return Math.min(1, half);
}

export function combinedMargin(a, b) {
    return Math.sqrt(a * a + b * b);
}
