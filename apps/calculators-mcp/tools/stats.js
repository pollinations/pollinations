import { z } from "zod";

// Percentiles use linear interpolation between the two closest ranks, the same method as
// Excel's PERCENTILE.INC and NumPy's default (R-7). The method matters: nearest-rank would
// return an observed value only, and agents comparing against a spreadsheet would disagree.
function percentile(sorted, p) {
    if (sorted.length === 1) return sorted[0];
    const rank = (p / 100) * (sorted.length - 1);
    const low = Math.floor(rank);
    const high = Math.ceil(rank);
    if (low === high) return sorted[low];
    return sorted[low] + (rank - low) * (sorted[high] - sorted[low]);
}

function mean(values) {
    let sum = 0;
    for (const value of values) sum += value;
    return sum / values.length;
}

function variance(values, sample) {
    // n - 1 for a sample, n for a population. With a single value a sample variance is
    // undefined rather than zero, so the result is null and the caller sees the difference.
    const divisor = sample ? values.length - 1 : values.length;
    if (divisor <= 0) return null;
    const average = mean(values);
    let total = 0;
    for (const value of values) total += (value - average) ** 2;
    return total / divisor;
}

function round(value) {
    return typeof value === "number" && Number.isFinite(value)
        ? Math.round(value * 1e6) / 1e6
        : value;
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
            const bad = numbers.findIndex((value) => !Number.isFinite(value));
            if (bad !== -1)
                throw new Error(
                    `numbers[${bad}] is not a finite number. Drop NaN and Infinity before calling.`,
                );

            const sorted = [...numbers].sort((a, b) => a - b);
            const sample = variance(numbers, true);
            const q1 = percentile(sorted, 25);
            const q3 = percentile(sorted, 75);
            const iqr = q3 - q1;
            const lower = q1 - 1.5 * iqr;
            const upper = q3 + 1.5 * iqr;

            return {
                count: numbers.length,
                sum: round(sorted.reduce((total, value) => total + value, 0)),
                mean: round(mean(numbers)),
                median: round(percentile(sorted, 50)),
                min: sorted[0],
                max: sorted[sorted.length - 1],
                range: round(sorted[sorted.length - 1] - sorted[0]),
                // null, not 0, when a sample of one cannot have a spread.
                standard_deviation:
                    sample === null ? null : round(Math.sqrt(sample)),
                standard_deviation_population: round(
                    Math.sqrt(variance(numbers, false)),
                ),
                quartiles: {
                    q1: round(q1),
                    q2: round(percentile(sorted, 50)),
                    q3: round(q3),
                },
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
