import { z } from "zod";

// Convert a number between bases 2-36, computed locally — no network or
// model calls. The integer part is exact for any length (BigInt); the
// fractional part is exact rational arithmetic, truncated to `precision`
// digits (default 12, max 64) — a repeating fraction is reported with
// `exact: false`. Output digits are lowercase (0-9a-z).
const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

function digitValue(char) {
    const value = DIGITS.indexOf(char.toLowerCase());
    return value;
}

function parse(value, fromBase) {
    if (/\s/.test(value)) {
        throw new Error(
            `Invalid number: ${JSON.stringify(value)} — no whitespace allowed.`,
        );
    }
    let sign = 1n;
    let rest = value;
    if (rest.startsWith("-") || rest.startsWith("+")) {
        sign = rest.startsWith("-") ? -1n : 1n;
        rest = rest.slice(1);
    }
    const parts = rest.split(".");
    if (parts.length > 2 || rest === "" || parts.some((part) => part === "")) {
        throw new Error(
            `Invalid number: ${JSON.stringify(value)} — expected digits with at most one decimal point, e.g. "ff" or "10.5".`,
        );
    }
    const [intPart, fracPart = ""] = parts;
    for (const char of intPart + fracPart) {
        const digit = digitValue(char);
        if (digit === -1 || digit >= fromBase) {
            throw new Error(
                `Invalid digit ${JSON.stringify(char)} for base ${fromBase} — digits must be below the source base.`,
            );
        }
    }
    let integer = 0n;
    for (const char of intPart) {
        integer = integer * BigInt(fromBase) + BigInt(digitValue(char));
    }
    let numerator = 0n;
    let denominator = 1n;
    for (const char of fracPart) {
        numerator = numerator * BigInt(fromBase) + BigInt(digitValue(char));
        denominator *= BigInt(fromBase);
    }
    return { sign, integer, numerator, denominator };
}

function renderInteger(integer, toBase) {
    if (integer === 0n) return "0";
    let result = "";
    let remaining = integer;
    while (remaining > 0n) {
        result = DIGITS[Number(remaining % BigInt(toBase))] + result;
        remaining /= BigInt(toBase);
    }
    return result;
}

function renderFraction(numerator, denominator, toBase, precision) {
    let digits = "";
    let exact = true;
    let remaining = numerator;
    for (let i = 0; i < precision && remaining !== 0n; i++) {
        remaining *= BigInt(toBase);
        const digit = remaining / denominator;
        digits += DIGITS[Number(digit)];
        remaining %= denominator;
    }
    if (remaining !== 0n) exact = false;
    return { digits, exact };
}

function convert(value, fromBase, toBase, precision) {
    const { sign, integer, numerator, denominator } = parse(value, fromBase);
    const { digits, exact } = renderFraction(
        numerator,
        denominator,
        toBase,
        precision,
    );
    const rendered = renderInteger(integer, toBase);
    const isZero = integer === 0n && numerator === 0n;
    const result =
        (sign < 0n && !isZero ? "-" : "") +
        rendered +
        (digits === "" ? "" : `.${digits}`);
    return { result, exact };
}

export const baseTools = [
    [
        "base_convert",
        "Convert a number between bases 2-36 (binary, octal, decimal, hexadecimal and anything in between), computed locally. The integer part is exact for any length; a fractional part is converted to `precision` digits (default 12) and reported with `exact: false` when it repeats. No network or model calls.",
        {
            value: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    'The number to convert, as a string in the source base, e.g. "255", "ff", "1010" or "10.5". Digits are 0-9a-z (case-insensitive); an optional leading "-" or "+" and one decimal point are allowed.',
                ),
            from_base: z
                .int()
                .min(2)
                .max(36)
                .describe("The base of the input number, 2-36, e.g. 10."),
            to_base: z
                .int()
                .min(2)
                .max(36)
                .describe("The base to convert to, 2-36, e.g. 16."),
            precision: z
                .int()
                .min(1)
                .max(64)
                .default(12)
                .describe(
                    "Maximum fractional digits in the result (default 12). Repeating fractions are truncated at this many digits.",
                ),
        },
        ({ value, from_base, to_base, precision }) => {
            const { result, exact } = convert(
                value,
                from_base,
                to_base,
                precision,
            );
            return { value, from_base, to_base, result, exact };
        },
    ],
];
