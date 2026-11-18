import { z } from "zod";

// Parse a decimal string into an exact {numerator, denominator} pair using BigInt.
// No floating point: "0.1" is exactly 1/10 here, where Number("0.1") is
// 0.1000000000000000055511151231257827.
function parseDecimal(body) {
    const parts = body.split(".");
    if (parts.length > 2) throw new Error("more than one decimal point.");
    const [whole, frac = ""] = parts;
    if (!/^\d*$/.test(whole) || !/^\d*$/.test(frac))
        throw new Error("is not a decimal number.");
    // "." and "+." would otherwise pass: both parts match \d* and the whole
    // number is empty, which silently returns 0.
    if (whole === "" && frac === "") throw new Error("has no digits.");

    const denominator = 10n ** BigInt(frac.length);
    const numerator =
        (whole === "" ? 0n : BigInt(whole)) * denominator +
        (frac === "" ? 0n : BigInt(frac));
    return { numerator, denominator };
}

function gcd(a, b) {
    a = a < 0n ? -a : a;
    b = b < 0n ? -b : b;
    while (b !== 0n) [a, b] = [b, a % b];
    return a;
}

export const fractionTools = [
    [
        "to_fraction",
        "Convert a decimal string to its simplest exact fraction, or reduce an existing fraction, with arbitrary precision. The value is carried as BigInt integers, never a float, so '0.3333333333333333' is exactly 3333333333333333/10000000000000000 rather than a rounded 1/3, and large reductions such as 9360/1260 come back reduced (52/7). A leading - or + is accepted; the result is 'n/d', or a bare integer when the denominator reduces to 1.",
        {
            value: z
                .string()
                .min(1)
                .max(4096)
                .describe(
                    "A decimal like '1.5' or '0.25', or an existing fraction like '3/2'.",
                ),
        },
        ({ value }) => {
            let body = value.trim();
            let negative = false;
            if (body.startsWith("-")) {
                negative = true;
                body = body.slice(1);
            } else if (body.startsWith("+")) {
                body = body.slice(1);
            }
            if (body === "")
                throw new Error(`value ${JSON.stringify(value)} is empty.`);

            let numerator, denominator;
            if (body.includes("/")) {
                const parts = body.split("/");
                if (parts.length !== 2)
                    throw new Error(
                        `value ${JSON.stringify(value)} is not a single fraction: expected one '/'.`,
                    );
                const [num, den] = parts;
                if (!/^\d+$/.test(num) || !/^\d+$/.test(den))
                    throw new Error(
                        `value ${JSON.stringify(value)} is not a valid fraction.`,
                    );
                numerator = BigInt(num);
                denominator = BigInt(den);
                if (denominator === 0n)
                    throw new Error("denominator must not be zero.");
            } else {
                ({ numerator, denominator } = parseDecimal(body));
            }

            const divisor = gcd(numerator, denominator);
            let n = numerator / divisor;
            const d = denominator / divisor;
            if (negative) n = -n;

            return { fraction: d === 1n ? `${n}` : `${n}/${d}` };
        },
    ],
];
