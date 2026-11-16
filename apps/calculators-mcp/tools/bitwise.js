import { z } from "zod";

// Largest input we accept, per operand. BigInt itself has no ceiling, but a tool that
// accepts unbounded input is a way to spend someone else's CPU, so the operands and the
// shift amount are both bounded.
const MAX_INPUT_DIGITS = 10000;
const MAX_SHIFT = 100000;

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

function shiftAmount(value) {
    if (value < 0n) throw new Error("the shift amount must not be negative.");
    if (value > BigInt(MAX_SHIFT))
        throw new Error(
            `the shift amount ${value} is over the ${MAX_SHIFT} limit.`,
        );
    return value;
}

function apply(operator, a, b) {
    switch (operator) {
        case "and":
            return a & b;
        case "or":
            return a | b;
        case "xor":
            return a ^ b;
        case "shift_left":
            return a << shiftAmount(b);
        case "shift_right":
            return a >> shiftAmount(b);
        default:
            throw new Error(`unknown operator ${JSON.stringify(operator)}.`);
    }
}

export const bitwiseTools = [
    [
        "bitwise",
        "Bitwise operations on arbitrarily large decimal integers, evaluated with BigInt so every bit is exact and no fixed width is assumed. Operators are and, or, xor (two operands), not (one operand, infinite two's complement, so not of 0 is -1) and shift_left, shift_right by an integer number of bits. Operands are strings: a JSON number cannot carry more than about 15 significant digits, so 12345678901234567890 arrives intact.",
        {
            a: z
                .string()
                .min(1)
                .max(12000)
                .describe(
                    'Left operand, a decimal integer such as "255" or "0b" mask.',
                ),
            operator: z
                .enum(["and", "or", "xor", "not", "shift_left", "shift_right"])
                .describe("Bitwise operation to apply to a."),
            b: z
                .string()
                .max(12000)
                .optional()
                .describe(
                    "Right operand, or the number of bits to shift for shift_left and shift_right. Ignored by not.",
                ),
        },
        ({ a, operator, b }) => {
            const left = parseInteger(a, "a");
            if (operator === "not") return { result: (~left).toString() };
            if (b === undefined || b.trim() === "")
                throw new Error(`operator ${operator} needs a second operand.`);
            const right = parseInteger(b, "b");
            return { result: apply(operator, left, right).toString() };
        },
    ],
];
