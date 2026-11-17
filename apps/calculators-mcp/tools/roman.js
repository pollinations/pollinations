import { z } from "zod";

// Value/symbol pairs in descending order, subtractive pairs included; the
// greedy walk below is the whole encoder.
const ROMAN_PAIRS = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
];

const ROMAN_VALUES = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

export function toRoman(value) {
    let remaining = value;
    let roman = "";
    for (const [amount, symbol] of ROMAN_PAIRS) {
        while (remaining >= amount) {
            roman += symbol;
            remaining -= amount;
        }
    }
    return roman;
}

export function fromRoman(text) {
    let value = 0;
    for (let index = 0; index < text.length; index += 1) {
        const current = ROMAN_VALUES[text[index]];
        const next = ROMAN_VALUES[text[index + 1]] ?? 0;
        // A smaller symbol before a larger one subtracts (IV, IX, XL, ...).
        value += current < next ? -current : current;
    }
    return value;
}

function parseInteger(text) {
    const body = text.trim();
    if (!/^[+-]?\d+$/.test(body))
        throw new Error(
            `value ${JSON.stringify(text)} is not an integer (1–3999).`,
        );
    const value = Number(body);
    if (value < 1 || value > 3999)
        throw new Error(
            `value ${JSON.stringify(text)} is out of range (1–3999).`,
        );
    return value;
}

function parseRoman(text) {
    const body = text.trim().toUpperCase();
    // Roman numerals have no zero and no symbol past M; MMMM would be 4000,
    // which is out of range, so the canonical re-encode check below rejects it.
    if (body === "")
        throw new Error(`value ${JSON.stringify(text)} has no Roman numerals.`);
    for (const [index, character] of [...body].entries()) {
        if (!(character in ROMAN_VALUES))
            throw new Error(
                `value ${JSON.stringify(text)} is not a Roman numeral: ${JSON.stringify(character)} at position ${index}.`,
            );
    }
    const value = fromRoman(body);
    if (value < 1 || value > 3999)
        throw new Error(
            `value ${JSON.stringify(text)} is out of range (1–3999).`,
        );
    // Re-encoding catches every non-canonical spelling (IIII, VV, IL, IC, ...)
    // because each integer has exactly one canonical form.
    if (toRoman(value) !== body)
        throw new Error(
            `value ${JSON.stringify(text)} is not a valid Roman numeral (canonical form is ${toRoman(value)}).`,
        );
    return value;
}

export const romanTools = [
    [
        "roman_numerals",
        "Convert between integers (1–3999) and Roman numerals in both directions. Roman numerals use the standard subtractive form (IV, IX, XL, XC, CD, CM); non-canonical spellings such as IIII or IL are rejected. Lowercase input is accepted and read as uppercase.",
        {
            value: z
                .string()
                .min(1)
                .max(16)
                .describe(
                    "The integer as decimal text (to_roman) or the Roman numeral (from_roman).",
                ),
            direction: z
                .enum(["to_roman", "from_roman"])
                .default("to_roman")
                .describe("Conversion direction."),
        },
        ({ value, direction }) => {
            const integer =
                direction === "to_roman"
                    ? parseInteger(value)
                    : parseRoman(value);
            return { integer, roman: toRoman(integer) };
        },
    ],
];
