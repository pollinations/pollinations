import { z } from "zod";

// Number.parseInt returns the digit for a valid character and NaN otherwise, which is the
// whole validation the parser needs.
function parseInBase(text, base) {
    let body = text.trim().toLowerCase();
    let negative = false;
    if (body.startsWith("-")) {
        negative = true;
        body = body.slice(1);
    } else if (body.startsWith("+")) {
        body = body.slice(1);
    }
    // "0" is a legitimate all-zero input, so only an empty body is rejected.
    if (body === "")
        throw new Error(`value ${JSON.stringify(text)} has no digits.`);

    const radix = BigInt(base);
    let value = 0n;
    for (const [index, character] of [...body].entries()) {
        const digit = Number.parseInt(character, base);
        if (Number.isNaN(digit))
            throw new Error(
                `value ${JSON.stringify(text)} is not valid in base ${base}: ${JSON.stringify(character)} at position ${index}.`,
            );
        value = value * radix + BigInt(digit);
    }
    return negative ? -value : value;
}

export const baseTools = [
    [
        "convert_number_base",
        "Convert an integer exactly between any bases from 2 to 36, with arbitrary precision so long values such as hashes and keys stay exact. A leading - or + is accepted.",
        {
            value: z
                .string()
                .min(1)
                .max(4096)
                .describe("The digits to convert, read in from_base."),
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
        },
        ({ value, from_base, to_base }) => {
            const decimal = parseInBase(value, from_base);
            // BigInt#toString(radix) is exact for every radix up to 36, sign included.
            return {
                value: decimal.toString(to_base),
                decimal: decimal.toString(),
            };
        },
    ],
];
