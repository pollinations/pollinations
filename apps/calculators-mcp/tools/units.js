import { z } from "zod";

// Canonical unit, category, factor to the category's base unit, and aliases.
// Temperature is affine, so its factors are null and handled separately.
const UNIT_DEFINITIONS = [
    // Length (base: metre)
    ["m", "length", 1, ["meter", "meters", "metre", "metres"]],
    [
        "km",
        "length",
        1000,
        ["kilometer", "kilometers", "kilometre", "kilometres"],
    ],
    [
        "cm",
        "length",
        0.01,
        ["centimeter", "centimeters", "centimetre", "centimetres"],
    ],
    [
        "mm",
        "length",
        0.001,
        ["millimeter", "millimeters", "millimetre", "millimetres"],
    ],
    [
        "um",
        "length",
        1e-6,
        ["micrometer", "micrometers", "micrometre", "micrometres", "µm"],
    ],
    [
        "nm",
        "length",
        1e-9,
        ["nanometer", "nanometers", "nanometre", "nanometres"],
    ],
    ["mi", "length", 1609.344, ["mile", "miles"]],
    ["yd", "length", 0.9144, ["yard", "yards"]],
    ["ft", "length", 0.3048, ["foot", "feet"]],
    ["in", "length", 0.0254, ["inch", "inches"]],
    ["nmi", "length", 1852, ["nauticalmile", "nauticalmiles"]],
    // Mass (base: kilogram)
    ["kg", "mass", 1, ["kilogram", "kilograms"]],
    ["g", "mass", 0.001, ["gram", "grams"]],
    ["mg", "mass", 1e-6, ["milligram", "milligrams"]],
    ["t", "mass", 1000, ["tonne", "tonnes", "metricton", "metrictons"]],
    ["lb", "mass", 0.45359237, ["pound", "pounds", "lbs"]],
    ["oz", "mass", 0.028349523125, ["ounce", "ounces"]],
    ["st", "mass", 6.35029318, ["stone", "stones"]],
    // Volume (base: litre)
    ["l", "volume", 1, ["liter", "liters", "litre", "litres"]],
    [
        "ml",
        "volume",
        0.001,
        ["milliliter", "milliliters", "millilitre", "millilitres"],
    ],
    [
        "m3",
        "volume",
        1000,
        ["cubicmeter", "cubicmeters", "cubicmetre", "cubicmetres"],
    ],
    ["gal", "volume", 3.785411784, ["gallon", "gallons"]],
    ["qt", "volume", 0.946352946, ["quart", "quarts"]],
    ["pt", "volume", 0.473176473, ["pint", "pints"]],
    ["cup", "volume", 0.2365882365, ["cups"]],
    ["floz", "volume", 0.0295735295625, ["fluidounce", "fluidounces"]],
    ["tbsp", "volume", 0.01478676478125, ["tablespoon", "tablespoons"]],
    ["tsp", "volume", 0.00492892159375, ["teaspoon", "teaspoons"]],
    // Area (base: square metre)
    [
        "m2",
        "area",
        1,
        ["squaremeter", "squaremeters", "squaremetre", "squaremetres"],
    ],
    [
        "km2",
        "area",
        1e6,
        [
            "squarekilometer",
            "squarekilometers",
            "squarekilometre",
            "squarekilometres",
        ],
    ],
    [
        "cm2",
        "area",
        1e-4,
        [
            "squarecentimeter",
            "squarecentimeters",
            "squarecentimetre",
            "squarecentimetres",
        ],
    ],
    ["ha", "area", 10000, ["hectare", "hectares"]],
    ["acre", "area", 4046.8564224, ["acres"]],
    ["ft2", "area", 0.09290304, ["squarefoot", "squarefeet"]],
    ["in2", "area", 0.00064516, ["squareinch", "squareinches"]],
    ["yd2", "area", 0.83612736, ["squareyard", "squareyards"]],
    ["mi2", "area", 2589988.110336, ["squaremile", "squaremiles"]],
    // Speed (base: metre per second)
    [
        "m/s",
        "speed",
        1,
        [
            "mps",
            "meterpersecond",
            "meterspersecond",
            "metrepersecond",
            "metrespersecond",
        ],
    ],
    [
        "km/h",
        "speed",
        1 / 3.6,
        [
            "kmh",
            "kph",
            "kilometerperhour",
            "kilometersperhour",
            "kilometreperhour",
            "kilometresperhour",
        ],
    ],
    ["mph", "speed", 0.44704, ["mileperhour", "milesperhour"]],
    ["kn", "speed", 0.5144444444444445, ["knot", "knots", "kt"]],
    ["ft/s", "speed", 0.3048, ["fps", "footpersecond", "feetpersecond"]],
    // Time (base: second)
    ["s", "time", 1, ["sec", "secs", "second", "seconds"]],
    ["ms", "time", 0.001, ["millisecond", "milliseconds"]],
    ["us", "time", 1e-6, ["microsecond", "microseconds", "µs"]],
    ["min", "time", 60, ["minute", "minutes"]],
    ["h", "time", 3600, ["hr", "hrs", "hour", "hours"]],
    ["day", "time", 86400, ["days", "d"]],
    ["week", "time", 604800, ["weeks", "wk", "wks"]],
    // Data (base: byte). kb/mb are decimal; kib/mib are binary.
    ["byte", "data", 1, ["bytes", "b"]],
    ["kb", "data", 1000, ["kilobyte", "kilobytes"]],
    ["mb", "data", 1e6, ["megabyte", "megabytes"]],
    ["gb", "data", 1e9, ["gigabyte", "gigabytes"]],
    ["tb", "data", 1e12, ["terabyte", "terabytes"]],
    ["kib", "data", 1024, ["kibibyte", "kibibytes"]],
    ["mib", "data", 1048576, ["mebibyte", "mebibytes"]],
    ["gib", "data", 1073741824, ["gibibyte", "gibibytes"]],
    ["tib", "data", 1099511627776, ["tebibyte", "tebibytes"]],
    ["bit", "data", 0.125, ["bits"]],
    ["kbit", "data", 125, ["kilobit", "kilobits"]],
    ["mbit", "data", 125000, ["megabit", "megabits"]],
    ["gbit", "data", 125000000, ["gigabit", "gigabits"]],
    // Temperature (affine, base: Celsius)
    ["C", "temperature", null, ["celsius", "°c"]],
    ["F", "temperature", null, ["fahrenheit", "°f"]],
    ["K", "temperature", null, ["kelvin"]],
];

const normalizeUnit = (value) =>
    value
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, "");

const UNITS = new Map();
for (const [canonical, category, factor, aliases] of UNIT_DEFINITIONS) {
    const definition = { canonical, category, factor };
    for (const name of [canonical, ...aliases]) {
        const key = normalizeUnit(name);
        if (!UNITS.has(key)) UNITS.set(key, definition);
    }
}

function resolveUnit(value) {
    const definition = UNITS.get(normalizeUnit(value));
    if (!definition) {
        throw new Error(
            `Unknown unit "${value}". Try a common name such as m, km, kg, lb, L, GiB, h, C, or km/h.`,
        );
    }
    return definition;
}

function toCelsius(value, unit) {
    if (unit.canonical === "C") return value;
    if (unit.canonical === "F") return ((value - 32) * 5) / 9;
    return value - 273.15;
}

function fromCelsius(value, unit) {
    if (unit.canonical === "C") return value;
    if (unit.canonical === "F") return (value * 9) / 5 + 32;
    return value + 273.15;
}

function roundResult(value) {
    if (value === 0) return 0;
    return Number(value.toPrecision(12));
}

function convert(value, from, to) {
    if (from.category !== to.category) {
        throw new Error(
            `Cannot convert ${from.category} (${from.canonical}) to ${to.category} (${to.canonical}).`,
        );
    }

    const result =
        from.category === "temperature"
            ? fromCelsius(toCelsius(value, from), to)
            : (value * from.factor) / to.factor;

    return {
        value,
        from: from.canonical,
        to: to.canonical,
        category: from.category,
        result: roundResult(result),
    };
}

export const unitTools = [
    [
        "convert_units",
        "Convert a value between units of length, mass, volume, area, speed, time, data size, or temperature. Accepts common names and case-insensitive aliases (for example km, miles, lb, L, GiB, h, °C, km/h). Data units are decimal (kb = 1000 bytes) except the -ib units (kib = 1024 bytes). Local and deterministic; no network or model calls.",
        {
            value: z
                .number()
                .finite()
                .describe("Amount to convert, for example 1.5 or -40"),
            from: z
                .string()
                .trim()
                .min(1)
                .max(64)
                .describe("Source unit, for example km, miles, lb, GiB, or C"),
            to: z
                .string()
                .trim()
                .min(1)
                .max(64)
                .describe("Target unit in the same category"),
        },
        async ({ value, from, to }) =>
            convert(value, resolveUnit(from), resolveUnit(to)),
    ],
];
