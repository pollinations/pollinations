import { z } from "zod";

function factorial(n) {
    let result = 1n;
    for (let i = 2n; i <= n; i++) {
        result *= i;
    }
    return result;
}

function permutations(n, k) {
    if (k > n) return 0n;
    let result = 1n;
    for (let i = 0n; i < k; i++) {
        result *= n - i;
    }
    return result;
}

function combinations(n, k) {
    if (k > n) return 0n;
    if (k === 0n || k === n) return 1n;
    let effectiveK = k;
    if (k > n - k) {
        effectiveK = n - k;
    }
    let result = 1n;
    for (let i = 1n; i <= effectiveK; i++) {
        result = (result * (n - effectiveK + i)) / i;
    }
    return result;
}

function combinationsWithReplacement(n, k) {
    if (n === 0n && k === 0n) return 1n;
    if (n === 0n) return 0n;
    return combinations(n + k - 1n, k);
}

function binomialProbability(n, k, p) {
    if (p < 0 || p > 1) {
        throw new Error("Probability p must be between 0 and 1");
    }
    const nInt = Number(n);
    const kInt = Number(k);
    const ways = Number(combinations(n, k));
    return ways * p ** kInt * (1 - p) ** (nInt - kInt);
}

export const combinatoricsTools = [
    [
        "calculate_combinatorics",
        "Exact combinatorics and discrete probability using BigInt: factorial (n!), permutations P(n, k), combinations C(n, k), combinations with replacement, and optional binomial probability.",
        {
            n: z
                .number()
                .int()
                .min(0)
                .max(1000)
                .describe("Total number of items (n >= 0, max 1000)"),
            k: z
                .number()
                .int()
                .min(0)
                .max(1000)
                .optional()
                .describe("Number of items to choose (0 <= k <= n)"),
            probability_p: z
                .number()
                .min(0)
                .max(1)
                .optional()
                .describe(
                    "Optional success probability per trial (0 <= p <= 1) for binomial distribution P(X = k)",
                ),
        },
        ({ n, k, probability_p }) => {
            const nBig = BigInt(n);
            const nFactorial = factorial(nBig).toString();

            if (k === undefined) {
                return {
                    n,
                    factorial: nFactorial,
                };
            }

            if (k > n) {
                throw new Error("k cannot be greater than n");
            }

            const kBig = BigInt(k);
            const pVal = permutations(nBig, kBig);
            const cVal = combinations(nBig, kBig);
            const crVal = combinationsWithReplacement(nBig, kBig);

            const result = {
                n,
                k,
                factorial_n: nFactorial,
                factorial_k: factorial(kBig).toString(),
                permutations: pVal.toString(),
                combinations: cVal.toString(),
                combinations_with_replacement: crVal.toString(),
            };

            if (probability_p !== undefined) {
                result.probability_p = probability_p;
                result.binomial_probability = binomialProbability(
                    nBig,
                    kBig,
                    probability_p,
                );
            }

            return result;
        },
    ],
];
