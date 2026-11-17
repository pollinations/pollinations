import { z } from "zod";

// Values arrive as decimal strings and are held as exact BigInt fractions, so a
// percentage never drifts the way float arithmetic does: 15% of 200 is 30, not
// 30.000000000000004. Exponent notation is rejected on purpose, because "1e3"
// hides how many digits are actually significant.
const MAX_DIGITS = 200;
const MAX_PRECISION = 20;
// Longest terminating expansion we will print in full before falling back to the
// caller's precision. Keeps a stray 1/2^200 from turning into a 200-digit reply.
const MAX_EXACT_PLACES = 60;

const HUNDRED = { numerator: 100n, denominator: 1n };
const TWO = { numerator: 2n, denominator: 1n };

function parseDecimal(value, label) {
    const text = value.trim();
    const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text);
    if (!match)
        throw new Error(
            `${label} is not a plain decimal number: ${JSON.stringify(value)}. Write 0.5, not .5, 5e-1 or 50%.`,
        );
    const [, sign, whole, fraction = ""] = match;
    const significant = (whole + fraction).replace(/^0+/, "");
    if (significant.length > MAX_DIGITS)
        throw new Error(
            `${label} has ${significant.length} significant digits, at most ${MAX_DIGITS} are accepted.`,
        );
    const magnitude = BigInt(whole + fraction);
    return {
        numerator: sign === "-" ? -magnitude : magnitude,
        denominator: 10n ** BigInt(fraction.length),
    };
}

function add(a, b) {
    return {
        numerator: a.numerator * b.denominator + b.numerator * a.denominator,
        denominator: a.denominator * b.denominator,
    };
}

function subtract(a, b) {
    return {
        numerator: a.numerator * b.denominator - b.numerator * a.denominator,
        denominator: a.denominator * b.denominator,
    };
}

function multiply(a, b) {
    return {
        numerator: a.numerator * b.numerator,
        denominator: a.denominator * b.denominator,
    };
}

function divide(a, b, label) {
    if (b.numerator === 0n) throw new Error(`division by zero in ${label}.`);
    return {
        numerator: a.numerator * b.denominator,
        denominator: a.denominator * b.numerator,
    };
}

function absolute(value) {
    return {
        numerator: value.numerator < 0n ? -value.numerator : value.numerator,
        denominator: value.denominator,
    };
}

function greatestCommonDivisor(a, b) {
    let x = a < 0n ? -a : a;
    let y = b < 0n ? -b : b;
    while (y !== 0n) [x, y] = [y, x % y];
    return x;
}

// Rounds to `precision` decimal places, half away from zero, then trims the
// trailing zeros. Rounding is the only lossy step, and it is the caller's choice.
function roundTo(value, precision) {
    const negative = value.numerator < 0n;
    const magnitude = negative ? -value.numerator : value.numerator;
    const scale = 10n ** BigInt(precision);
    const scaled =
        (magnitude * scale * 2n + value.denominator) / (2n * value.denominator);
    let text = scaled.toString();
    if (precision > 0) {
        text = text.padStart(precision + 1, "0");
        const cut = text.length - precision;
        const fraction = text.slice(cut).replace(/0+$/, "");
        text = fraction
            ? `${text.slice(0, cut)}.${fraction}`
            : text.slice(0, cut);
    }
    if (negative && /[1-9]/.test(text)) text = `-${text}`;
    return text;
}

// A rational such as 1/8 has a short exact decimal, and printing 0.125 beats
// printing the 0.13 a two-place rounding would give. Returns null when the
// expansion does not terminate or is unreasonably long.
function exactDecimal(value) {
    if (value.numerator === 0n) return "0";
    const divisor = greatestCommonDivisor(value.numerator, value.denominator);
    const numerator = value.numerator / divisor;
    const denominator = value.denominator / divisor;
    let rest = denominator;
    let twos = 0;
    let fives = 0;
    while (rest % 2n === 0n) {
        rest /= 2n;
        twos += 1;
    }
    while (rest % 5n === 0n) {
        rest /= 5n;
        fives += 1;
    }
    if (rest !== 1n) return null;
    const places = Math.max(twos, fives);
    if (places > MAX_EXACT_PLACES) return null;
    const magnitude = numerator < 0n ? -numerator : numerator;
    const digits = (magnitude * 10n ** BigInt(places)) / denominator;
    let text;
    if (places === 0) {
        text = digits.toString();
    } else {
        const padded = digits.toString().padStart(places + 1, "0");
        const cut = padded.length - places;
        const fraction = padded.slice(cut).replace(/0+$/, "");
        text = fraction
            ? `${padded.slice(0, cut)}.${fraction}`
            : padded.slice(0, cut);
    }
    return numerator < 0n ? `-${text}` : text;
}

function render(value, precision) {
    const rounded = roundTo(value, precision);
    // Never report zero for a value that is merely small: 0.0000001% of
    // 0.0000001 is 1e-16, not 0, even at the default precision.
    if (rounded === "0") return exactDecimal(value) ?? rounded;
    return rounded;
}

function compute(mode, a, b) {
    switch (mode) {
        case "of":
            return divide(multiply(a, b), HUNDRED);
        case "change":
            if (a.numerator === 0n)
                throw new Error(
                    "mode change needs a non-zero starting value: a percentage change from 0 is undefined.",
                );
            return divide(multiply(subtract(b, a), HUNDRED), a);
        case "share":
            return divide(multiply(a, HUNDRED), b);
        case "difference":
            return divide(
                multiply(multiply(absolute(subtract(a, b)), TWO), HUNDRED),
                add(a, b),
            );
        default:
            throw new Error(`unknown mode ${JSON.stringify(mode)}.`);
    }
}

export const percentageTools = [
    [
        "percentage",
        'Percentages on exact decimal numbers, with no floating point error. Four modes: `of` answers "a percent of b" (a=15, b=200 gives 30); `change` answers the percent change from a to b, signed, so 100 to 150 gives 50 and 150 to 100 gives -33.33; `difference` answers the percent difference between two values using their average, which is symmetric, so the order of a and b does not matter; `share` answers "a is what percent of b". Pass both values as decimal strings: a JSON number loses digits past 2^53, so 12345678901234567890 must stay a string. Results are exact when the decimal terminates within 60 places; otherwise they are rounded to `precision` decimal places, half away from zero, and a non-zero result never collapses to 0.',
        {
            mode: z
                .enum(["of", "change", "difference", "share"])
                .describe(
                    "of = a percent of b; change = percent change from a to b; difference = symmetric percent difference of a and b; share = a as a percent of b.",
                ),
            a: z
                .string()
                .min(1)
                .max(256)
                .describe(
                    'First value, a plain decimal such as "15" or "-0.25".',
                ),
            b: z
                .string()
                .min(1)
                .max(256)
                .describe('Second value, a plain decimal such as "200".'),
            precision: z
                .number()
                .int()
                .min(0)
                .max(MAX_PRECISION)
                .default(10)
                .describe(
                    "Decimal places used when the result does not terminate, default 10, maximum 20.",
                ),
        },
        ({ mode, a, b, precision }) => {
            const left = parseDecimal(a, "a");
            const right = parseDecimal(b, "b");
            const value = compute(mode, left, right);
            return {
                mode,
                result: render(value, precision),
                unit: "percent",
            };
        },
    ],
];
