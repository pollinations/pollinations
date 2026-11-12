import { z } from "zod";

// Check digits are the one part of an identifier that is pure arithmetic, and every scheme
// uses different arithmetic. Getting them right by hand is where transcription errors hide:
// a single swapped digit is invisible to the eye and caught by the checksum.
//
// Each function returns the check characters the leading part requires, so an invalid value
// can say what it should have been instead of only reporting failure.

const LUHN = "luhn";
const IBAN = "iban";
const ISBN10 = "isbn10";
const ISBN13 = "isbn13";
const EAN13 = "ean13";

function digits(value, label) {
    if (!/^\d+$/.test(value))
        throw new Error(
            `${label} expects digits only, got ${JSON.stringify(value)}.`,
        );
    return [...value].map(Number);
}

// Luhn: double every second digit from the right, subtract 9 when the double exceeds 9,
// then the total must be a multiple of ten.
function luhnCheck(payload) {
    const parsed = digits(payload, "luhn");
    let total = 0;
    let double = true;
    for (let index = parsed.length - 1; index >= 0; index -= 1) {
        let digit = parsed[index];
        if (double) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        double = !double;
        total += digit;
    }
    return String((10 - (total % 10)) % 10);
}

function luhnShape(value) {
    // Two digits is the shortest thing that has a check digit at all, and checking it here
    // keeps the failure message about the input rather than about an empty payload.
    if (!/^\d{2,}$/.test(value))
        throw new Error(
            `a luhn value is at least two digits, digits only, got ${JSON.stringify(value)}.`,
        );
}

function luhnValid(value) {
    luhnShape(value);
    return luhnCheck(value.slice(0, -1)) === value.slice(-1);
}

// IBAN: move the four leading characters to the end, map A-Z to 10-35, and the whole number
// must be 1 modulo 97. Long numbers, so it is done digit by digit with a rolling remainder
// instead of converting to an integer of arbitrary size.
function ibanMod97(value) {
    const rearranged = value.slice(4) + value.slice(0, 4);
    let remainder = 0;
    for (const character of rearranged) {
        const expanded = /\d/.test(character)
            ? character
            : String(character.charCodeAt(0) - 55);
        for (const digit of expanded)
            remainder = (remainder * 10 + Number(digit)) % 97;
    }
    return remainder;
}

function ibanExpected(value) {
    // The check digits occupy positions 3 and 4, so the rest is rebuilt around 00 and the
    // two digits that make the whole thing 1 modulo 97 are what belongs there.
    const rest = `${value.slice(0, 2)}00${value.slice(4)}`;
    const remainder = ibanMod97(rest);
    return String(98 - remainder).padStart(2, "0");
}

// ISBN-10: weights 10 down to 1, and the final digit may be X for ten. Modulo 11.
function isbn10Check(payload) {
    const parsed = digits(payload, "isbn10");
    let total = 0;
    for (let index = 0; index < parsed.length; index += 1)
        total += (10 - index) * parsed[index];
    const check = (11 - (total % 11)) % 11;
    return check === 10 ? "X" : String(check);
}

// ISBN-13 and EAN-13: weights alternate 1 and 3, modulo 10.
function ean13Check(payload) {
    const parsed = digits(payload, "ean13");
    let total = 0;
    for (let index = 0; index < parsed.length; index += 1)
        total += parsed[index] * (index % 2 === 0 ? 1 : 3);
    return String((10 - (total % 10)) % 10);
}

function normalise(value) {
    // Spaces and hyphens are formatting, not data, so they are accepted and ignored.
    return value.replace(/[\s-]/g, "");
}

function inspect(scheme, raw) {
    const value = normalise(raw);
    switch (scheme) {
        case LUHN: {
            luhnShape(value);
            const valid = luhnValid(value);
            return {
                valid,
                expected: valid ? null : luhnCheck(value.slice(0, -1)),
            };
        }
        case IBAN: {
            const shaped = /^[A-Za-z]{2}\d{2}[A-Za-z0-9]{11,30}$/.test(value);
            if (!shaped)
                throw new Error(
                    "an IBAN is two letters, two check digits, then 11 to 30 letters or digits.",
                );
            const upper = value.toUpperCase();
            const valid = ibanMod97(upper) === 1;
            return {
                valid,
                expected: valid ? null : ibanExpected(upper),
            };
        }
        case ISBN10: {
            if (!/^\d{9}[\dXx]$/.test(value))
                throw new Error(
                    "an ISBN-10 is nine digits followed by a digit or X.",
                );
            const check = value.slice(-1).toUpperCase();
            return {
                valid: isbn10Check(value.slice(0, 9)) === check,
                expected: isbn10Check(value.slice(0, 9)),
            };
        }
        case ISBN13:
        case EAN13: {
            if (!/^\d{13}$/.test(value))
                throw new Error(`an ${scheme} is thirteen digits.`);
            return {
                valid: ean13Check(value.slice(0, 12)) === value.slice(-1),
                expected: ean13Check(value.slice(0, 12)),
            };
        }
        default:
            throw new Error(`unknown scheme ${JSON.stringify(scheme)}.`);
    }
}

export const checkDigitTools = [
    [
        "check_digit",
        "Validate an identifier against the check-digit arithmetic of its scheme, and say what the check characters should be when they are wrong. Schemes: luhn for card and IMEI numbers, iban for the ISO 13616 modulo-97 check, isbn10 with its modulo-11 and X, and isbn13 or ean13 with alternating weights. Spaces and hyphens are ignored, so a value reads as written. Pure arithmetic, no network.",
        {
            scheme: z
                .enum([LUHN, IBAN, ISBN10, ISBN13, EAN13])
                .describe("Which check-digit scheme to apply."),
            value: z
                .string()
                .min(1)
                .max(64)
                .describe(
                    'The identifier, such as "4539578763621486" or "GB82 WEST 1234 5698 7654 32".',
                ),
        },
        ({ scheme, value }) => inspect(scheme, value),
    ],
];
