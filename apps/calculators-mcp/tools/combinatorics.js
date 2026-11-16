import { z } from "zod";

// 171! is already past what a double can hold, and C(100, 50) has 30 digits, so the
// answer is carried as a decimal string and built with BigInt throughout. The bound is
// the cost, not the arithmetic: at 10000 the worst case finishes in tens of milliseconds.
const MAX_N = 10000;

function parseCount(value, label) {
    const text = value.trim();
    if (!/^\d+$/.test(text))
        throw new Error(
            `${label} is not a non-negative decimal integer: ${JSON.stringify(value)}.`,
        );
    const parsed = BigInt(text);
    if (parsed > BigInt(MAX_N))
        throw new Error(`${label} is at most ${MAX_N}.`);
    return parsed;
}

function factorial(n) {
    let result = 1n;
    for (let value = 2n; value <= n; value += 1n) result *= value;
    return result;
}

// P(n, k) is n * (n-1) * ... * (n-k+1): k factors counted down from n, which avoids
// building the two factorials and dividing them.
function permutations(n, k) {
    if (k > n) return 0n;
    let result = 1n;
    for (let step = 0n; step < k; step += 1n) result *= n - step;
    return result;
}

// C(n, k) is built by multiplying n-k+1..n over 1..k. Each step divides exactly
// because the running product is C(n-k+i, i), an integer at every point, so no
// intermediate is fractional and no rounding creeps in. The symmetry C(n,k) = C(n,n-k)
// picks the shorter loop, which is also the cheaper one.
function combinations(n, k) {
    if (k > n) return 0n;
    // Not Math.min: it converts its arguments to a number, which a BigInt refuses.
    const complement = n - k;
    let smaller = k;
    if (complement < smaller) smaller = complement;
    let result = 1n;
    for (let step = 1n; step <= smaller; step += 1n)
        result = (result * (n - smaller + step)) / step;
    return result;
}

export const combinatoricsTools = [
    [
        "combinatorics",
        "Count arrangements exactly with arbitrary precision: factorial (the orderings of n items), permutations (the ordered selections of k from n) and combinations (the unordered ones, the binomial coefficient). The result is a decimal string because it outgrows a double immediately — 171! already exceeds one, and C(100, 50) has 30 digits. When k is larger than n both selections are 0, by convention. n is at most 10000, which bounds the work rather than the arithmetic.",
        {
            operation: z
                .enum(["factorial", "permutations", "combinations"])
                .describe(
                    "factorial counts orderings of n; permutations counts ordered selections of k from n; combinations counts unordered selections.",
                ),
            n: z
                .string()
                .min(1)
                .max(10)
                .describe("Items to choose from, 0–10000."),
            k: z
                .string()
                .min(1)
                .max(10)
                .optional()
                .describe(
                    "Items selected, 0–n. Required for permutations and combinations; ignored for factorial.",
                ),
        },
        ({ operation, n, k }) => {
            const items = parseCount(n, "n");
            if (operation === "factorial")
                return { result: factorial(items).toString() };
            if (k === undefined)
                throw new Error(`${operation} needs k as well as n.`);
            const selected = parseCount(k, "k");
            const result =
                operation === "permutations"
                    ? permutations(items, selected)
                    : combinations(items, selected);
            return { result: result.toString() };
        },
    ],
];
