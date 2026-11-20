import { z } from "zod";

// Largest input we accept, per operand. BigInt has no ceiling of its own, but a tool that
// accepts unbounded input is a way to spend someone else's CPU, so both the inputs and the
// estimated size of the result are bounded.
const MAX_INPUT_DIGITS = 10000;
const MAX_RESULT_DIGITS = 100000;

function parseInteger(value, operand) {
    const text = value.trim();
    if (!/^[+-]?\d+$/.test(text))
        throw new Error(
            `${operand} is not a decimal integer: ${JSON.stringify(value)}.`,
        );
    const digits = text.replace(/^[+-]/, "").length;
    if (digits > MAX_INPUT_DIGITS)
        throw new Error(
            `${operand} has ${digits} digits, at most ${MAX_INPUT_DIGITS} are accepted.`,
        );
    return BigInt(text);
}

// Decimal digits in |base| ** exponent, without building the value. Only the exponent bound
// needs this, and there an estimate that is never too small is enough.
function estimatedDigits(base, exponent) {
    const magnitude = base < 0n ? -base : base;
    if (magnitude <= 1n) return 1;
    const digitCount = magnitude.toString().length;
    return Math.ceil(digitCount * Number(exponent));
}

function gcd(a, b) {
    a = a < 0n ? -a : a;
    b = b < 0n ? -b : b;
    while (b !== 0n) [a, b] = [b, a % b];
    return a;
}

function apply(operator, a, b) {
    switch (operator) {
        case "add":
            return a + b;
        case "subtract":
            return a - b;
        case "multiply":
            return a * b;
        case "divide":
            if (b === 0n) throw new Error("division by zero.");
            // BigInt division truncates toward zero.
            return a / b;
        case "modulo":
            if (b === 0n)
                throw new Error("the divisor of a modulo must not be zero.");
            return a % b;
        case "power": {
            if (b < 0n)
                throw new Error(
                    "the exponent must not be negative, the result would not be an integer.",
                );
            // Checked before computing: 2**1000000 is about a megabyte of digits and takes
            // far longer to build than a caller expects to wait.
            const estimated = estimatedDigits(a, b);
            if (estimated > MAX_RESULT_DIGITS)
                throw new Error(
                    `the result would have roughly ${estimated} digits, over the ${MAX_RESULT_DIGITS} limit.`,
                );
            return a ** b;
        }
        case "gcd":
            return gcd(a, b);
        default:
            throw new Error(`unknown operator ${JSON.stringify(operator)}.`);
    }
}

export const integerTools = [
    [
        "integer_math",
        "Exact arithmetic on arbitrarily large decimal integers, evaluated with BigInt, so nothing is rounded and no digit is lost. Operands are strings: a JSON number cannot carry more than about 15 significant digits, so 12345678901234567890 arrives intact. Operators are add, subtract, multiply, divide and modulo (truncating toward zero), power (non-negative integer exponent) and gcd.",
        {
            a: z
                .string()
                .min(1)
                .max(12000)
                .describe(
                    'Left operand, a decimal integer such as "12345678901234567890".',
                ),
            operator: z
                .enum([
                    "add",
                    "subtract",
                    "multiply",
                    "divide",
                    "modulo",
                    "power",
                    "gcd",
                ])
                .describe("Operation to apply to a and b."),
            b: z
                .string()
                .min(1)
                .max(12000)
                .describe("Right operand, or the exponent for power."),
        },
        ({ a, operator, b }) => {
            const left = parseInteger(a, "a");
            const right = parseInteger(b, "b");
            return { result: apply(operator, left, right).toString() };
        },
    ],
];
