import { z } from "zod";

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";
const PREFIXES = { 2: "0b", 8: "0o", 16: "0x" };

// BigInt rather than Number: a 128-bit hash is a normal thing for an agent to convert,
// and Number silently loses precision past 2^53.
function parseInBase(text, base) {
    let body = text.trim().toLowerCase();
    let negative = false;
    if (body.startsWith("-")) {
        negative = true;
        body = body.slice(1);
    } else if (body.startsWith("+")) {
        body = body.slice(1);
    }
    // A literal "0" is the one valid input that is all zeros, so only an empty body is rejected.
    if (body === "")
        throw new Error(`value ${JSON.stringify(text)} has no digits.`);

    const radix = BigInt(base);
    let value = 0n;
    for (const [index, character] of [...body].entries()) {
        const digit = DIGITS.indexOf(character);
        if (digit === -1 || digit >= base)
            throw new Error(
                `value ${JSON.stringify(text)} is not valid in base ${base}: ${JSON.stringify(character)} at position ${index}.`,
            );
        value = value * radix + BigInt(digit);
    }
    return negative ? -value : value;
}

function toBase(value, base) {
    const negative = value < 0n;
    let remaining = negative ? -value : value;
    const radix = BigInt(base);
    let digits = "";
    while (remaining > 0n) {
        digits = DIGITS[Number(remaining % radix)] + digits;
        remaining /= radix;
    }
    return (negative ? "-" : "") + (digits || "0");
}

export const baseTools = [
    [
        "convert_number_base",
        "Convert an integer exactly between any bases from 2 to 36, with arbitrary precision so long values such as hashes and keys stay exact. Accepts an optional leading sign, and can return the conventional 0b/0o/0x prefix for binary, octal and hexadecimal.",
        {
            value: z
                .string()
                .min(1)
                .max(4096)
                .describe(
                    "The digits to convert, read in from_base. A leading - or + is allowed.",
                ),
            from_base: z
                .number()
                .int()
                .min(2)
                .max(36)
                .default(10)
                .describe("Base of value, 2–36."),
            to_base: z
                .number()
                .int()
                .min(2)
                .max(36)
                .default(16)
                .describe("Base to convert to, 2–36."),
            uppercase: z
                .boolean()
                .default(false)
                .describe(
                    "Return digits above 9 in upper case, e.g. FF rather than ff.",
                ),
            prefix: z
                .boolean()
                .default(false)
                .describe(
                    "Also return the 0b/0o/0x prefix when the target base has one. Ignored for other bases.",
                ),
        },
        ({ value, from_base, to_base, uppercase, prefix }) => {
            const decimal = parseInBase(value, from_base);
            const digits = toBase(decimal, to_base);
            return {
                value: uppercase ? digits.toUpperCase() : digits,
                decimal: decimal.toString(),
                from_base,
                to_base,
                uppercase,
                // Only bases with a language-level literal get a prefix; there is none for
                // base 3 or base 36, so the field is null rather than an invented spelling.
                prefixed:
                    prefix && PREFIXES[to_base]
                        ? (decimal < 0n ? "-" : "") +
                          PREFIXES[to_base] +
                          (uppercase
                              ? digits.replace("-", "").toUpperCase()
                              : digits.replace("-", ""))
                        : null,
            };
        },
    ],
];
