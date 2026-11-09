import { z } from "zod";

function calculateMedian(numbers) {
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

function calculateMode(numbers) {
    const counts = new Map();
    let maxFreq = 0;
    for (const n of numbers) {
        const count = (counts.get(n) || 0) + 1;
        counts.set(n, count);
        if (count > maxFreq) maxFreq = count;
    }
    if (maxFreq === 1 && numbers.length > 1) {
        return []; // No distinct mode if all numbers appear once
    }
    const modes = [];
    for (const [val, count] of counts.entries()) {
        if (count === maxFreq) modes.push(val);
    }
    return modes.sort((a, b) => a - b);
}

function calculateVarianceAndStdDev(numbers, mean) {
    if (numbers.length <= 1) {
        return {
            variance_population: 0,
            variance_sample: 0,
            std_dev_population: 0,
            std_dev_sample: 0,
        };
    }
    const sumSquaredDiffs = numbers.reduce(
        (acc, val) => acc + (val - mean) ** 2,
        0,
    );
    const varPop = sumSquaredDiffs / numbers.length;
    const varSample = sumSquaredDiffs / (numbers.length - 1);
    return {
        variance_population: varPop,
        variance_sample: varSample,
        std_dev_population: Math.sqrt(varPop),
        std_dev_sample: Math.sqrt(varSample),
    };
}

function calculatePercentile(sorted, p) {
    if (sorted.length === 1) return sorted[0];
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export const statisticsTools = [
    [
        "calculate_statistics",
        "Compute descriptive summary statistics (mean, median, mode, sample/population standard deviation, variance, min, max, sum, and quartiles) for a list of numbers.",
        {
            numbers: z
                .array(z.number())
                .min(1)
                .max(10000)
                .describe(
                    "List of numeric values to analyze (1 to 10,000 values)",
                ),
        },
        ({ numbers }) => {
            const count = numbers.length;
            const sum = numbers.reduce((acc, val) => acc + val, 0);
            const mean = sum / count;
            const sorted = [...numbers].sort((a, b) => a - b);
            const min = sorted[0];
            const max = sorted[sorted.length - 1];
            const median = calculateMedian(numbers);
            const modes = calculateMode(numbers);
            const {
                variance_population,
                variance_sample,
                std_dev_population,
                std_dev_sample,
            } = calculateVarianceAndStdDev(numbers, mean);

            const q1 = calculatePercentile(sorted, 25);
            const q3 = calculatePercentile(sorted, 75);
            const iqr = q3 - q1;

            return {
                count,
                sum,
                mean,
                median,
                mode: modes,
                min,
                max,
                range: max - min,
                variance: {
                    population: variance_population,
                    sample: count > 1 ? variance_sample : null,
                },
                std_dev: {
                    population: std_dev_population,
                    sample: count > 1 ? std_dev_sample : null,
                },
                quartiles: {
                    q1,
                    q2_median: median,
                    q3,
                    iqr,
                },
            };
        },
    ],
];
