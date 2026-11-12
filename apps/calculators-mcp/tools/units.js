import { z } from "zod";

const f = (numerator, denominator = 1n) => ({ numerator, denominator });

// Conversion factors are exact fractions against each category's base unit, so converting
// between two units is one multiplication and one division of fractions and loses nothing.
// Floats would not: one inch is 0.0254 m, and 100 inches times that is 2.5399999999999996 m
// as a double.
const CATEGORIES = {
    length: {
        base: "m",
        units: {
            m: f(1n),
            km: f(1000n),
            cm: f(1n, 100n),
            mm: f(1n, 1000n),
            um: f(1n, 1000000n),
            nm: f(1n, 1000000000n),
            in: f(254n, 10000n),
            ft: f(3048n, 10000n),
            yd: f(9144n, 10000n),
            mi: f(1609344n, 1000n),
            nmi: f(1852n),
        },
    },
    mass: {
        base: "kg",
        units: {
            kg: f(1n),
            g: f(1n, 1000n),
            mg: f(1n, 1000000n),
            t: f(1000n),
            lb: f(45359237n, 100000000n),
            oz: f(45359237n, 1600000000n),
            st: f(6350293180n, 1000000000n),
        },
    },
    volume: {
        base: "l",
        units: {
            l: f(1n),
            ml: f(1n, 1000n),
            cl: f(1n, 100n),
            dl: f(1n, 10n),
            m3: f(1000n),
            // A US gallon is 3.785411784 l and an imperial one 4.54609 l, exactly, and they
            // are not interchangeable: 1 gal_us is 0.8326742 gal_uk.
            gal_us: f(473176473n, 125000000n),
            gal_uk: f(454609n, 100000n),
            floz_us: f(473176473n, 16000000000n),
            cup_us: f(473176473n, 2000000000n),
            tbsp_us: f(473176473n, 32000000000n),
            tsp_us: f(473176473n, 96000000000n),
        },
    },
};

// Temperature is affine rather than proportional: 0 °C is 32 °F, so a single factor cannot
// express it. Every pair goes through Celsius, with 273.15 K = 0 °C kept exact as 27315/100.
const TEMPERATURES = ["C", "F", "K"];

function gcd(a, b) {
    a = a < 0n ? -a : a;
    b = b < 0n ? -b : b;
    while (b !== 0n) [a, b] = [b, a % b];
    return a;
}

function reduce(value) {
    const divisor = gcd(value.numerator, value.denominator);
    return {
        numerator: value.numerator / divisor,
        denominator: value.denominator / divisor,
    };
}

const multiply = (a, b) =>
    reduce({
        numerator: a.numerator * b.numerator,
        denominator: a.denominator * b.denominator,
    });

function divide(a, b) {
    if (b.numerator === 0n)
        throw new Error("division by zero in a conversion factor.");
    return reduce({
        numerator: a.numerator * b.denominator,
        denominator: a.denominator * b.numerator,
    });
}

const add = (a, b) =>
    reduce({
        numerator: a.numerator * b.denominator + b.numerator * a.denominator,
        denominator: a.denominator * b.denominator,
    });

const whole = (value) => ({ numerator: value, denominator: 1n });

// A decimal string read as an exact fraction, so "0.1" is 1/10 rather than the double
// 0.1000000000000000055511151231257827.
function parseDecimal(value, label) {
    let body = value.trim();
    let sign = 1n;
    if (body.startsWith("-")) {
        sign = -1n;
        body = body.slice(1);
    } else if (body.startsWith("+")) {
        body = body.slice(1);
    }
    const parts = body.split(".");
    if (parts.length > 2)
        throw new Error(`${label}: more than one decimal point.`);
    const [integerPart = "", fractionalPart = ""] = parts;
    if (!/^\d*$/.test(integerPart) || !/^\d*$/.test(fractionalPart))
        throw new Error(`${label} is not a number: ${JSON.stringify(value)}.`);
    if (integerPart === "" && fractionalPart === "")
        throw new Error(`${label} has no digits: ${JSON.stringify(value)}.`);
    const denominator = 10n ** BigInt(fractionalPart.length);
    const numerator =
        (integerPart === "" ? 0n : BigInt(integerPart)) * denominator +
        (fractionalPart === "" ? 0n : BigInt(fractionalPart));
    return reduce({ numerator: sign * numerator, denominator });
}

// At most `significantDigits` significant digits, rounding half up. Significant rather than
// fixed decimals, so 1e-9 km keeps its magnitude and 100 in to cm still reads 254.
function render(value, significantDigits = 12) {
    let numerator = value.numerator;
    const denominator = value.denominator;
    const negative = numerator < 0n;
    if (negative) numerator = -numerator;

    const integerPart = numerator / denominator;
    let remainder = numerator % denominator;
    const integerDigits = integerPart.toString();
    if (remainder === 0n) return (negative ? "-" : "") + integerDigits;

    const digits = [...integerDigits].map(Number);
    let significant = integerPart === 0n ? 0 : integerDigits.length;
    while (remainder !== 0n && significant < significantDigits) {
        remainder *= 10n;
        const digit = Number(remainder / denominator);
        remainder %= denominator;
        digits.push(digit);
        if (significant > 0 || digit !== 0) significant += 1;
    }

    let roundUp = false;
    if (remainder !== 0n) {
        remainder *= 10n;
        roundUp = remainder / denominator >= 5n;
    }

    let point = integerDigits.length;
    if (roundUp) {
        let index = digits.length - 1;
        for (;;) {
            if (index < 0) {
                digits.unshift(1);
                point += 1;
                break;
            }
            if (digits[index] < 9) {
                digits[index] += 1;
                break;
            }
            digits[index] = 0;
            index -= 1;
        }
    }

    const head = digits.slice(0, point).join("");
    const tail = digits.slice(point).join("").replace(/0+$/, "");
    return (negative ? "-" : "") + (tail ? `${head}.${tail}` : head);
}

function toCelsius(value, unit) {
    switch (unit) {
        case "C":
            return value;
        case "F":
            return multiply(add(value, whole(-32n)), f(5n, 9n));
        case "K":
            return add(value, f(-27315n, 100n));
        default:
            throw new Error(
                `unknown temperature unit ${JSON.stringify(unit)}.`,
            );
    }
}

function fromCelsius(value, unit) {
    switch (unit) {
        case "C":
            return value;
        case "F":
            return add(multiply(value, f(9n, 5n)), whole(32n));
        case "K":
            return add(value, f(27315n, 100n));
        default:
            throw new Error(
                `unknown temperature unit ${JSON.stringify(unit)}.`,
            );
    }
}

export const unitTools = [
    [
        "convert_units",
        "Convert a value between units of length, mass, volume or temperature, using exact fractions instead of floating point, so 100 in to cm is 254 and not 253.99999999999997. Length: m, km, cm, mm, um, nm, in, ft, yd, mi, nmi. Mass: kg, g, mg, t, lb, oz, st. Volume: l, ml, cl, dl, m3, gal_us, gal_uk, floz_us, cup_us, tbsp_us, tsp_us. Temperature: C, F, K, which goes through Celsius because it is affine and not proportional. The value is a string so decimals arrive exact.",
        {
            value: z
                .string()
                .min(1)
                .max(64)
                .describe(
                    'The amount to convert, as a decimal string such as "12.5".',
                ),
            from: z
                .string()
                .min(1)
                .describe('Unit to convert from, such as "in".'),
            to: z.string().min(1).describe('Unit to convert to, such as "cm".'),
        },
        ({ value, from, to }) => {
            const amount = parseDecimal(value, "value");
            if (from === to) return { result: render(amount), unit: to };

            if (TEMPERATURES.includes(from) && TEMPERATURES.includes(to))
                return {
                    result: render(fromCelsius(toCelsius(amount, from), to)),
                    unit: to,
                };

            for (const table of Object.values(CATEGORIES)) {
                const source = table.units[from];
                const target = table.units[to];
                if (!source || !target) continue;
                return {
                    result: render(divide(multiply(amount, source), target)),
                    unit: to,
                };
            }

            throw new Error(
                `cannot convert ${JSON.stringify(from)} to ${JSON.stringify(to)}: they are not units of the same category. The units of each category are listed in this tool's description.`,
            );
        },
    ],
];
