import { z } from "zod";

// Strings, not numbers: a JSON number carries about fifteen significant digits, and the
// point of this tool is the digits a double would have rounded away.
const MAX_DIGITS = 10000;

function parseInteger(value, label) {
    const text = value.trim();
    if (!/^-?\d+$/.test(text))
        throw new Error(
            `${label} is not a decimal integer: ${JSON.stringify(value)}.`,
        );
    if (text.replace(/^-/, "").length > MAX_DIGITS)
        throw new Error(`${label} has more than ${MAX_DIGITS} digits.`);
    return BigInt(text);
}

// Square and multiply: each step squares the running factor and multiplies it in when
// the bit is set, so the exponent's bit length, not its size, sets the work. Raising
// first and reducing afterwards is not an option — 123456789 to the 987654321 has more
// digits than there are atoms in the room.
function modularPower(base, exponent, modulus) {
    // 1 % modulus, so modulus 1 with exponent 0 is 0 rather than 1.
    let result = 1n % modulus;
    let factor = base % modulus;
    if (factor < 0n) factor += modulus;
    let power = exponent;
    while (power > 0n) {
        if (power & 1n) result = (result * factor) % modulus;
        factor = (factor * factor) % modulus;
        power >>= 1n;
    }
    return result;
}

export const modularTools = [
    [
        "modular_power",
        "Raise a base to an exponent modulo a modulus, exactly, with arbitrary precision. Square-and-multiply keeps every intermediate below the modulus, so the exponent may be enormous: 123456789 to the 987654321 modulo 1000000007 is one step, where computing the power first would need a billion digits. The base may be negative and is reduced into 0..modulus-1 first; the exponent must not be negative; the modulus must be at least 1.",
        {
            base: z
                .string()
                .min(1)
                .max(10010)
                .describe(
                    'The base, as a decimal integer, for example "123456789".',
                ),
            exponent: z
                .string()
                .min(1)
                .max(10010)
                .describe("The exponent, as a non-negative decimal integer."),
            modulus: z
                .string()
                .min(1)
                .max(10010)
                .describe("The modulus, as a decimal integer of at least 1."),
        },
        ({ base, exponent, modulus }) => {
            const parsedModulus = parseInteger(modulus, "modulus");
            if (parsedModulus < 1n)
                throw new Error("modulus must be at least 1.");
            const parsedExponent = parseInteger(exponent, "exponent");
            if (parsedExponent < 0n)
                throw new Error("exponent must not be negative.");
            return {
                result: modularPower(
                    parseInteger(base, "base"),
                    parsedExponent,
                    parsedModulus,
                ).toString(),
            };
        },
    ],
];
