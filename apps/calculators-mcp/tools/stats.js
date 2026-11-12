import { z } from "zod";

// Percentiles use linear interpolation between the two closest ranks, the same method as
// Excel's PERCENTILE.INC and NumPy's default (R-7). The method matters: nearest-rank would
// return an observed value only, and agents comparing against a spreadsheet would disagree.
function percentile(sorted, p) {
    const rank = (p / 100) * (sorted.length - 1);
    const low = Math.floor(rank);
    const high = Math.ceil(rank);
    if (low === high) return sorted[low];
    return sorted[low] + (rank - low) * (sorted[high] - sorted[low]);
}

// Neumaier summation (an improvement on Kahan): keeps full precision while adding many
// values, so [1e16, 1, -1e16] sums to 1 rather than 0, and the running error never
// silently swallows the small terms.
function sum(values) {
    let total = 0;
    let compensation = 0;
    for (const value of values) {
        const t = total + value;
        if (Math.abs(total) >= Math.abs(value))
            compensation += total - t + value;
        else compensation += value - t + total;
        total = t;
    }
    return total + compensation;
}

function mean(values) {
    return sum(values) / values.length;
}

// Standard deviation, computed on scaled deviations.
//
// Squaring tiny deviations underflows: (1e-300 - 1.5e-300)**2 is 0 in float64, so a plain
// two-pass variance reports a spread of 0 for values that plainly differ. Multiplying back
// a squared scale does not help either, because 4e-600 is 0 as well. Dividing each deviation
// by the largest magnitude first keeps the squares near 1, and one multiplication by that
// scale at the very end — after the square root — keeps the result in range.
function standardDeviation(values, sample) {
    // n - 1 for a sample, n for a population. With a single value a sample deviation is
    // undefined rather than zero, so the result is null and the caller sees the difference.
    const divisor = sample ? values.length - 1 : values.length;
    if (divisor <= 0) return null;
    const average = mean(values);
    let scale = 0;
    for (const value of values) scale = Math.max(scale, Math.abs(value));
    if (scale === 0) return 0;
    let total = 0;
    for (const value of values) total += ((value - average) / scale) ** 2;
    return Math.sqrt(total / divisor) * scale;
}

// Cutting to a fixed number of decimals collapses small magnitudes: [1e-7, 3e-7] would
// report a mean, median and spread of 0. Significant digits keep every scale readable.
function round(value) {
    return Number.isFinite(value) ? Number(value.toPrecision(12)) : value;
}

export const statsTools = [
    [
        "summarize_numbers",
        "Descriptive statistics for a list of numbers: count, sum, mean, median, min, max, range, population and sample standard deviation, quartiles with the interquartile range, and Tukey outliers outside 1.5×IQR. Percentiles use linear interpolation (Excel PERCENTILE.INC / NumPy default).",
        {
            numbers: z
                .array(z.number())
                .min(1)
                .max(100000)
                .describe("The sample. Every value must be a finite number."),
            percentiles: z
                .array(z.number().min(0).max(100))
                .max(21)
                .optional()
                .describe(
                    "Extra percentiles to return, 0–100, at most 21. 25, 50 and 75 are always reported as the quartiles.",
                ),
        },
        ({ numbers, percentiles }) => {
            // Infinity or NaN anywhere means the result would not survive JSON anyway
            // (JSON.stringify(Infinity) is null), and an agent reading null cannot tell
            // that from a missing field. Failing loudly is the useful answer.
            const total = sum(numbers);
            if (!Number.isFinite(total))
                throw new Error(
                    `the sample's magnitude is out of range: the sum is ${total}.`,
                );
            const sorted = [...numbers].sort((a, b) => a - b);
            const sampleDeviation = standardDeviation(numbers, true);
            const q1 = percentile(sorted, 25);
            const q3 = percentile(sorted, 75);
            const iqr = q3 - q1;
            const lower = q1 - 1.5 * iqr;
            const upper = q3 + 1.5 * iqr;

            return {
                count: numbers.length,
                sum: round(total),
                mean: round(mean(numbers)),
                median: round(percentile(sorted, 50)),
                min: sorted[0],
                max: sorted[sorted.length - 1],
                range: round(sorted[sorted.length - 1] - sorted[0]),
                // null, not 0, when a sample of one cannot have a spread.
                standard_deviation:
                    sampleDeviation === null ? null : round(sampleDeviation),
                standard_deviation_population: round(
                    standardDeviation(numbers, false),
                ),
                quartiles: { q1: round(q1), q3: round(q3) },
                interquartile_range: round(iqr),
                outliers: {
                    rule: "1.5 × IQR (Tukey)",
                    lower_fence: round(lower),
                    upper_fence: round(upper),
                    values: numbers.filter(
                        (value) => value < lower || value > upper,
                    ),
                },
                percentiles: Object.fromEntries(
                    (percentiles ?? []).map((p) => [
                        p,
                        round(percentile(sorted, p)),
                    ]),
                ),
            };
        },
    ],
];
