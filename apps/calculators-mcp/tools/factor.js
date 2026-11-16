import { z } from "zod";

// A JSON number carries about 15 significant digits, so the operand is a string: the
// factors of 123456789012345678901234567890 are not recoverable from a double.
const MAX_INPUT_DIGITS = 30;

// Trial division clears the small factors, which is most of the work for ordinary
// numbers. What survives has no factor below the bound, so it is either prime or a
// product of a few large ones that Pollard's rho splits without sieving further.
const TRIAL_LIMIT = 100000n;

function parseInteger(value) {
    const text = value.trim();
    if (!/^\d+$/.test(text))
        throw new Error(
            `value is not a non-negative decimal integer: ${JSON.stringify(value)}.`,
        );
    if (text.length > MAX_INPUT_DIGITS)
        throw new Error(
            `value has ${text.length} digits, at most ${MAX_INPUT_DIGITS} are accepted.`,
        );
    const parsed = BigInt(text);
    if (parsed < 2n)
        throw new Error(
            `value must be at least 2 to have a prime factorization.`,
        );
    return parsed;
}

function modPow(base, exponent, modulus) {
    let result = 1n;
    let factor = base % modulus;
    let power = exponent;
    while (power > 0n) {
        if (power & 1n) result = (result * factor) % modulus;
        factor = (factor * factor) % modulus;
        power >>= 1n;
    }
    return result;
}

// The first twelve primes as bases decide primality exactly below 3.3 * 10**24, which
// is above the largest 30-digit input this tool accepts.
const WITNESSES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];

function isPrime(value) {
    if (value < 2n) return false;
    for (const prime of [
        2n,
        3n,
        5n,
        7n,
        11n,
        13n,
        17n,
        19n,
        23n,
        29n,
        31n,
        37n,
    ])
        if (value === prime) return true;
        else if (value % prime === 0n) return false;

    let odd = value - 1n;
    let shifts = 0n;
    while ((odd & 1n) === 0n) {
        odd >>= 1n;
        shifts += 1n;
    }
    for (const witness of WITNESSES) {
        let power = modPow(witness, odd, value);
        if (power === 1n || power === value - 1n) continue;
        let composite = true;
        for (let step = 1n; step < shifts; step += 1n) {
            power = (power * power) % value;
            if (power === value - 1n) {
                composite = false;
                break;
            }
        }
        if (composite) return false;
    }
    return true;
}

function gcd(a, b) {
    while (b !== 0n) [a, b] = [b, a % b];
    return a;
}

// Brent's variant of Pollard's rho: it advances the slower sequence in batches and
// checks a product of differences in one gcd per batch, so a factor is found in far
// fewer gcd calls than the plain rho.
function pollardRho(value) {
    if (value % 2n === 0n) return 2n;
    for (let constant = 1n; constant < 100n; constant += 1n) {
        let previous = 2n;
        let current = 2n;
        let product = 1n;
        let steps = 0n;
        let power = 1n;
        let divisor = 1n;
        while (divisor === 1n) {
            if (steps > 1000000n)
                throw new Error(
                    "gave up looking for a factor; the value is too hard for this tool.",
                );
            if (steps === power) {
                previous = current;
                power *= 2n;
            }
            current = (current * current + constant) % value;
            product =
                (product *
                    (current > previous
                        ? current - previous
                        : previous - current)) %
                value;
            steps += 1n;
            if (steps % 128n === 0n) divisor = gcd(product, value);
        }
        if (divisor !== value) return divisor;
    }
    throw new Error(
        "gave up looking for a factor; the value is too hard for this tool.",
    );
}

function split(value, prime, factors) {
    let remainder = value;
    let exponent = 0;
    while (remainder % prime === 0n) {
        remainder /= prime;
        exponent += 1;
    }
    factors.set(prime.toString(), exponent);
    return remainder;
}

function factorize(value) {
    const factors = new Map();
    let remaining = value;

    for (
        let candidate = 2n;
        candidate <= TRIAL_LIMIT;
        candidate += candidate === 2n ? 1n : 2n
    ) {
        if (candidate * candidate > remaining) break;
        if (remaining % candidate === 0n)
            remaining = split(remaining, candidate, factors);
    }

    const stack = remaining > 1n ? [remaining] : [];
    while (stack.length > 0) {
        const current = stack.pop();
        if (isPrime(current)) {
            factors.set(
                current.toString(),
                (factors.get(current.toString()) ?? 0) + 1,
            );
            continue;
        }
        const divisor = pollardRho(current);
        stack.push(divisor, current / divisor);
    }

    return [...factors.entries()]
        .map(([prime, exponent]) => ({ prime, exponent }))
        .sort((left, right) =>
            BigInt(left.prime) < BigInt(right.prime) ? -1 : 1,
        );
}

export const factorTools = [
    [
        "factor_integer",
        "Return the prime factorization of an integer up to 30 digits, exactly, with no floating point anywhere. Trial division clears the small primes, then a deterministic Miller-Rabin test and Pollard's rho split the remainder. Each factor is reported as a decimal string with its exponent; a prime input comes back as itself with exponent 1.",
        {
            value: z
                .string()
                .min(1)
                .max(40)
                .describe(
                    'The integer to factor, as decimal digits, for example "360".',
                ),
        },
        ({ value }) => ({ factors: factorize(parseInteger(value)) }),
    ],
];
