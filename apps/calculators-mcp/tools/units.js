import { z } from "zod";

// Exact unit conversion, computed locally — no network or model calls.
// Linear units convert through a base unit with one factor each;
// temperature converts through Celsius because it is offset-aware.
// Results are rounded to 10 significant digits so exact values stay exact
// (1 mi = 1.609344 km) and repeating decimals stay short.
// Data sizes are SI decimal: 1 KB = 1000 B, not 1024.
const CATEGORIES = {
    length: {
        units: {
            m: 1,
            km: 1000,
            mi: 1609.344,
            ft: 0.3048,
            in: 0.0254,
            cm: 0.01,
            mm: 0.001,
            yd: 0.9144,
        },
        aliases: {
            meter: "m",
            meters: "m",
            metre: "m",
            metres: "m",
            kilometer: "km",
            kilometers: "km",
            kilometre: "km",
            kilometres: "km",
            mile: "mi",
            miles: "mi",
            foot: "ft",
            feet: "ft",
            inch: "in",
            inches: "in",
            centimeter: "cm",
            centimeters: "cm",
            centimetre: "cm",
            centimetres: "cm",
            millimeter: "mm",
            millimeters: "mm",
            millimetre: "mm",
            millimetres: "mm",
            yard: "yd",
            yards: "yd",
        },
    },
    mass: {
        units: { kg: 1, g: 0.001, lb: 0.45359237, oz: 0.028349523125, t: 1000 },
        aliases: {
            kilogram: "kg",
            kilograms: "kg",
            gram: "g",
            grams: "g",
            pound: "lb",
            pounds: "lb",
            ounce: "oz",
            ounces: "oz",
            tonne: "t",
            tonnes: "t",
            "metric ton": "t",
            "metric tons": "t",
        },
    },
    volume: {
        units: {
            l: 1,
            ml: 0.001,
            cup: 0.2365882365,
            tbsp: 0.01478676478125,
            tsp: 0.00492892159375,
            gal: 3.785411784,
            qt: 0.946352946,
            floz: 0.0295735295625,
        },
        aliases: {
            liter: "l",
            liters: "l",
            litre: "l",
            litres: "l",
            milliliter: "ml",
            milliliters: "ml",
            millilitre: "ml",
            millilitres: "ml",
            cups: "cup",
            tablespoon: "tbsp",
            tablespoons: "tbsp",
            teaspoon: "tsp",
            teaspoons: "tsp",
            gallon: "gal",
            gallons: "gal",
            quart: "qt",
            quarts: "qt",
            "fl oz": "floz",
            "fluid ounce": "floz",
            "fluid ounces": "floz",
        },
    },
    temperature: {
        // No factors: temperature converts through Celsius, not a base unit.
        units: { c: null, f: null, k: null },
        aliases: { celsius: "c", fahrenheit: "f", kelvin: "k" },
    },
    area: {
        units: {
            m2: 1,
            km2: 1000000,
            mi2: 2589988.110336,
            ft2: 0.09290304,
            in2: 0.00064516,
            cm2: 0.0001,
            acre: 4046.8564224,
            ha: 10000,
        },
        aliases: {
            "square meter": "m2",
            "square meters": "m2",
            "square metre": "m2",
            "square metres": "m2",
            sqm: "m2",
            "square kilometer": "km2",
            "square kilometers": "km2",
            "square kilometre": "km2",
            "square kilometres": "km2",
            "square mile": "mi2",
            "square miles": "mi2",
            sqmi: "mi2",
            "square foot": "ft2",
            "square feet": "ft2",
            sqft: "ft2",
            "square inch": "in2",
            "square inches": "in2",
            sqin: "in2",
            "square centimeter": "cm2",
            "square centimeters": "cm2",
            "square centimetre": "cm2",
            "square centimetres": "cm2",
            acres: "acre",
            hectare: "ha",
            hectares: "ha",
        },
    },
    speed: {
        units: {
            "m/s": 1,
            "km/h": 1 / 3.6,
            mph: 0.44704,
            "ft/s": 0.3048,
            kn: 0.5144444444444445,
        },
        aliases: {
            kph: "km/h",
            "kilometers per hour": "km/h",
            "kilometres per hour": "km/h",
            "miles per hour": "mph",
            "feet per second": "ft/s",
            knot: "kn",
            knots: "kn",
        },
    },
    data: {
        units: {
            b: 1,
            kb: 1000,
            mb: 1000000,
            gb: 1000000000,
            tb: 1000000000000,
        },
        aliases: {
            byte: "b",
            bytes: "b",
            kilobyte: "kb",
            kilobytes: "kb",
            megabyte: "mb",
            megabytes: "mb",
            gigabyte: "gb",
            gigabytes: "gb",
            terabyte: "tb",
            terabytes: "tb",
        },
    },
};

const BY_UNIT = {};
for (const [category, { units, aliases }] of Object.entries(CATEGORIES)) {
    for (const [symbol, factor] of Object.entries(units)) {
        BY_UNIT[symbol] = { category, symbol, factor };
    }
    for (const [alias, symbol] of Object.entries(aliases)) {
        BY_UNIT[alias] = { category, symbol, factor: units[symbol] };
    }
}

function resolve(unit) {
    const found = BY_UNIT[unit.trim().toLowerCase()];
    if (found === undefined) {
        throw new Error(
            `Unknown unit: ${JSON.stringify(unit)} — expected a length, mass, volume, temperature, area, speed or data unit (e.g. "m", "kg", "l", "c", "m2", "km/h", "gb").`,
        );
    }
    return found;
}

function round(value) {
    return Number(value.toPrecision(10));
}

function toCelsius(value, symbol) {
    if (symbol === "c") return value;
    if (symbol === "f") return ((value - 32) * 5) / 9;
    return value - 273.15;
}

function fromCelsius(value, symbol) {
    if (symbol === "c") return value;
    if (symbol === "f") return (value * 9) / 5 + 32;
    return value + 273.15;
}

function convert(value, from, to) {
    if (from.category !== to.category) {
        throw new Error(
            `Cannot convert ${from.symbol} (${from.category}) to ${to.symbol} (${to.category}) — units must be in the same category.`,
        );
    }
    if (from.category === "temperature") {
        const celsius = toCelsius(value, from.symbol);
        if (celsius < -273.15 - 1e-9) {
            throw new Error(
                `Temperature ${value} ${from.symbol} is below absolute zero (-273.15 C).`,
            );
        }
        return round(fromCelsius(celsius, to.symbol));
    }
    return round((value * from.factor) / to.factor);
}

export const unitTools = [
    [
        "unit_convert",
        "Convert a value between units of length, mass, volume, temperature, area, speed or data, computed locally. Data sizes are SI decimal (1 KB = 1000 B), not binary. Temperature conversions are offset-aware (0 C = 32 F); no network or model calls.",
        {
            value: z
                .number()
                .finite()
                .describe("The value to convert, e.g. 1."),
            from_unit: z
                .string()
                .min(1)
                .max(32)
                .describe(
                    'The unit to convert from, e.g. "mi", "kg", "cup", "C", "m2", "mph" or "GB". Full names work too ("miles", "kilograms").',
                ),
            to_unit: z
                .string()
                .min(1)
                .max(32)
                .describe(
                    'The unit to convert to, e.g. "km", "lb", "mL", "F", "ft2", "km/h" or "MB".',
                ),
        },
        ({ value, from_unit, to_unit }) => {
            const from = resolve(from_unit);
            const to = resolve(to_unit);
            return {
                value,
                from_unit: from.symbol,
                to_unit: to.symbol,
                category: from.category,
                result: convert(value, from, to),
            };
        },
    ],
];
