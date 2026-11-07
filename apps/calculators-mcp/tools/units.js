import { z } from "zod";

// Deterministic physical and digital unit conversions.
// Exact SI and IEC ratios for digital storage, length, mass, temperature, speed, area, and volume.

const RATIOS = {
    // Digital storage: base = byte (B)
    b: { category: "data", factor: 0.125, canonical: "b" },
    B: { category: "data", factor: 1, canonical: "B" },
    KB: { category: "data", factor: 1e3, canonical: "KB" },
    KiB: { category: "data", factor: 1024, canonical: "KiB" },
    MB: { category: "data", factor: 1e6, canonical: "MB" },
    MiB: { category: "data", factor: 1024 ** 2, canonical: "MiB" },
    GB: { category: "data", factor: 1e9, canonical: "GB" },
    GiB: { category: "data", factor: 1024 ** 3, canonical: "GiB" },
    TB: { category: "data", factor: 1e12, canonical: "TB" },
    TiB: { category: "data", factor: 1024 ** 4, canonical: "TiB" },
    PB: { category: "data", factor: 1e15, canonical: "PB" },
    PiB: { category: "data", factor: 1024 ** 5, canonical: "PiB" },

    // Length: base = meter (m)
    m: { category: "length", factor: 1, canonical: "m" },
    km: { category: "length", factor: 1000, canonical: "km" },
    cm: { category: "length", factor: 0.01, canonical: "cm" },
    mm: { category: "length", factor: 0.001, canonical: "mm" },
    um: { category: "length", factor: 1e-6, canonical: "um" },
    nm: { category: "length", factor: 1e-9, canonical: "nm" },
    in: { category: "length", factor: 0.0254, canonical: "in" },
    ft: { category: "length", factor: 0.3048, canonical: "ft" },
    yd: { category: "length", factor: 0.9144, canonical: "yd" },
    mi: { category: "length", factor: 1609.344, canonical: "mi" },
    nmi: { category: "length", factor: 1852, canonical: "nmi" },

    // Mass: base = kilogram (kg)
    kg: { category: "mass", factor: 1, canonical: "kg" },
    g: { category: "mass", factor: 0.001, canonical: "g" },
    mg: { category: "mass", factor: 1e-6, canonical: "mg" },
    ug: { category: "mass", factor: 1e-9, canonical: "ug" },
    t: { category: "mass", factor: 1000, canonical: "t" },
    lb: { category: "mass", factor: 0.45359237, canonical: "lb" },
    oz: { category: "mass", factor: 0.028349523125, canonical: "oz" },
    stone: { category: "mass", factor: 6.35029318, canonical: "stone" },

    // Speed: base = m/s
    "m/s": { category: "speed", factor: 1, canonical: "m/s" },
    "km/h": { category: "speed", factor: 1 / 3.6, canonical: "km/h" },
    mph: { category: "speed", factor: 0.44704, canonical: "mph" },
    knot: { category: "speed", factor: 1852 / 3600, canonical: "knot" },
    "ft/s": { category: "speed", factor: 0.3048, canonical: "ft/s" },

    // Area: base = square meter (sq_m)
    sq_m: { category: "area", factor: 1, canonical: "sq_m" },
    sq_km: { category: "area", factor: 1e6, canonical: "sq_km" },
    sq_cm: { category: "area", factor: 1e-4, canonical: "sq_cm" },
    sq_mm: { category: "area", factor: 1e-6, canonical: "sq_mm" },
    sq_ft: { category: "area", factor: 0.09290304, canonical: "sq_ft" },
    sq_in: { category: "area", factor: 0.00064516, canonical: "sq_in" },
    sq_mi: { category: "area", factor: 2589988.110336, canonical: "sq_mi" },
    acre: { category: "area", factor: 4046.8564224, canonical: "acre" },
    ha: { category: "area", factor: 10000, canonical: "ha" },

    // Volume: base = liter (l)
    l: { category: "volume", factor: 1, canonical: "l" },
    ml: { category: "volume", factor: 0.001, canonical: "ml" },
    cu_m: { category: "volume", factor: 1000, canonical: "cu_m" },
    gal: { category: "volume", factor: 3.785411784, canonical: "gal" },
    qt: { category: "volume", factor: 0.946352946, canonical: "qt" },
    pt: { category: "volume", factor: 0.473176473, canonical: "pt" },
    cup: { category: "volume", factor: 0.2365882365, canonical: "cup" },
    fl_oz: { category: "volume", factor: 0.0295735295625, canonical: "fl_oz" },
};

const ALIASES = {
    // Data
    bit: "b",
    bits: "b",
    byte: "B",
    bytes: "B",
    kb: "KB",
    kilobyte: "KB",
    kilobytes: "KB",
    kib: "KiB",
    kibibyte: "KiB",
    kibibytes: "KiB",
    mb: "MB",
    megabyte: "MB",
    megabytes: "MB",
    mib: "MiB",
    mebibyte: "MiB",
    mebibytes: "MiB",
    gb: "GB",
    gigabyte: "GB",
    gigabytes: "GB",
    gib: "GiB",
    gibibyte: "GiB",
    gibibytes: "GiB",
    tb: "TB",
    terabyte: "TB",
    terabytes: "TB",
    tib: "TiB",
    tebibyte: "TiB",
    tebibytes: "TiB",
    pb: "PB",
    petabyte: "PB",
    petabytes: "PB",
    pib: "PiB",
    pebibyte: "PiB",
    pebibytes: "PiB",

    // Length
    meter: "m",
    meters: "m",
    metre: "m",
    metres: "m",
    kilometer: "km",
    kilometers: "km",
    kilometre: "km",
    kilometres: "km",
    centimeter: "cm",
    centimeters: "cm",
    millimeter: "mm",
    millimeters: "mm",
    micrometer: "um",
    micrometers: "um",
    micron: "um",
    microns: "um",
    nanometer: "nm",
    nanometers: "nm",
    inch: "in",
    inches: "in",
    foot: "ft",
    feet: "ft",
    yard: "yd",
    yards: "yd",
    mile: "mi",
    miles: "mi",
    nautical_mile: "nmi",
    nautical_miles: "nmi",
    nauticalmile: "nmi",

    // Mass
    gram: "g",
    grams: "g",
    kilogram: "kg",
    kilograms: "kg",
    milligram: "mg",
    milligrams: "mg",
    microgram: "ug",
    micrograms: "ug",
    tonne: "t",
    tonnes: "t",
    ton: "t",
    tons: "t",
    metric_ton: "t",
    metric_tonne: "t",
    pound: "lb",
    pounds: "lb",
    lbs: "lb",
    ounce: "oz",
    ounces: "oz",
    stones: "stone",

    // Temperature
    c: "C",
    celsius: "C",
    centigrade: "C",
    degc: "C",
    f: "F",
    fahrenheit: "F",
    degf: "F",
    k: "K",
    kelvin: "K",

    // Speed
    mps: "m/s",
    m_s: "m/s",
    kph: "km/h",
    kmh: "km/h",
    km_h: "km/h",
    miles_per_hour: "mph",
    knots: "knot",
    kt: "knot",
    fps: "ft/s",
    ft_s: "ft/s",

    // Area
    m2: "sq_m",
    sqm: "sq_m",
    square_meter: "sq_m",
    square_meters: "sq_m",
    km2: "sq_km",
    sqkm: "sq_km",
    square_kilometer: "sq_km",
    sq_cm2: "sq_cm",
    sq_mm2: "sq_mm",
    sqft: "sq_ft",
    ft2: "sq_ft",
    square_foot: "sq_ft",
    square_feet: "sq_ft",
    sqin: "sq_in",
    in2: "sq_in",
    square_inch: "sq_in",
    square_inches: "sq_in",
    sqmi: "sq_mi",
    mi2: "sq_mi",
    square_mile: "sq_mi",
    square_miles: "sq_mi",
    acres: "acre",
    hectare: "ha",
    hectares: "ha",

    // Volume
    liter: "l",
    liters: "l",
    litre: "l",
    litres: "l",
    L: "l",
    milliliter: "ml",
    milliliters: "ml",
    m3: "cu_m",
    cubic_meter: "cu_m",
    cubic_meters: "cu_m",
    gallon: "gal",
    gallons: "gal",
    quart: "qt",
    quarts: "qt",
    pint: "pt",
    pints: "pt",
    cups: "cup",
    fluid_ounce: "fl_oz",
    fluid_ounces: "fl_oz",
};

function resolveUnit(raw) {
    const trimmed = raw.trim();
    if (Object.hasOwn(RATIOS, trimmed)) {
        return { key: trimmed, ...RATIOS[trimmed] };
    }
    const lower = trimmed.toLowerCase();
    const resolvedKey = ALIASES[lower] ?? (Object.hasOwn(RATIOS, lower) ? lower : null);
    if (resolvedKey && Object.hasOwn(RATIOS, resolvedKey)) {
        return { key: resolvedKey, ...RATIOS[resolvedKey] };
    }
    if (lower === "c" || lower === "f" || lower === "k") {
        const tempKey = lower.toUpperCase();
        return { key: tempKey, category: "temperature", canonical: tempKey };
    }
    const tempKey = ALIASES[lower];
    if (tempKey === "C" || tempKey === "F" || tempKey === "K") {
        return { key: tempKey, category: "temperature", canonical: tempKey };
    }
    return null;
}

function cleanNumber(n) {
    if (!Number.isFinite(n)) return n;
    if (Math.abs(n) < 1e-15) return 0;
    return Number(n.toPrecision(10));
}

function convertTemperature(value, from, to) {
    if (from === to) return value;
    let celsius;
    if (from === "C") celsius = value;
    else if (from === "F") celsius = (value - 32) * (5 / 9);
    else if (from === "K") celsius = value - 273.15;

    if (to === "C") return celsius;
    if (to === "F") return celsius * (9 / 5) + 32;
    if (to === "K") return celsius + 273.15;
    throw new Error(`Unsupported temperature target: ${to}`);
}

export function convertUnits({ value, from, to }) {
    if (!Number.isFinite(value)) {
        throw new Error("Value must be a finite number");
    }
    const source = resolveUnit(from);
    if (!source) {
        throw new Error(`Unknown source unit: "${from}"`);
    }
    const target = resolveUnit(to);
    if (!target) {
        throw new Error(`Unknown target unit: "${to}"`);
    }
    if (source.category !== target.category) {
        throw new Error(
            `Incompatible unit categories: cannot convert ${source.category} (${source.canonical}) to ${target.category} (${target.canonical})`,
        );
    }

    let result;
    if (source.category === "temperature") {
        result = cleanNumber(convertTemperature(value, source.key, target.key));
    } else {
        const baseValue = value * source.factor;
        result = cleanNumber(baseValue / target.factor);
    }

    return {
        value,
        from: source.canonical,
        result,
        to: target.canonical,
        category: source.category,
    };
}

export const unitTools = [
    [
        "unit_convert",
        "Convert quantities between units of measurement across digital data (bytes, KiB, MB, GiB, etc.), length, mass, temperature (C, F, K), speed, area, and volume. Pure local calculation with exact ratios.",
        {
            value: z.number().describe("Numeric amount to convert"),
            from: z.string().min(1).max(30).describe("Source unit symbol or name (e.g. 'GiB', 'km', 'kg', 'F')"),
            to: z.string().min(1).max(30).describe("Target unit symbol or name (e.g. 'MB', 'mi', 'lb', 'C')"),
        },
        convertUnits,
    ],
];
