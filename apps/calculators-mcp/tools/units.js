import { z } from "zod";

const conversions = {
    // Length (base meter)
    m: 1,
    km: 1000,
    cm: 0.01,
    mm: 0.001,
    in: 0.0254,
    ft: 0.3048,
    yd: 0.9144,
    mi: 1609.344,
    // Mass (base gram)
    g: 1,
    kg: 1000,
    mg: 0.001,
    lb: 453.59237,
    oz: 28.349523125,
    // Digital storage (base byte)
    b: 1,
    kb: 1000,
    mb: 1e6,
    gb: 1e9,
    tb: 1e12,
    kib: 1024,
    mib: 1048576,
    gib: 1073741824,
    tib: 1099511627776,
    // Speed (base m/s)
    "m/s": 1,
    "km/h": 1 / 3.6,
    mph: 0.44704,
    knot: 0.514444,
};

function convert(value, from, to) {
    const f = from.trim().toLowerCase();
    const t = to.trim().toLowerCase();

    // Temperature
    if (["c", "f", "k"].includes(f) && ["c", "f", "k"].includes(t)) {
        const k =
            f === "c"
                ? value + 273.15
                : f === "f"
                  ? ((value + 459.67) * 5) / 9
                  : value;
        const res =
            t === "c" ? k - 273.15 : t === "f" ? (k * 9) / 5 - 459.67 : k;
        return { value, from, to, result: Number(res.toFixed(6)) };
    }

    if (!conversions[f] || !conversions[t]) {
        throw new Error(
            `Unsupported unit conversion from "${from}" to "${to}".`,
        );
    }

    const baseVal = value * conversions[f];
    const result = baseVal / conversions[t];
    return { value, from, to, result: Number(result.toFixed(6)) };
}

export const unitTools = [
    [
        "convert_units",
        "Convert values accurately between measurement units: length (m, km, cm, mm, in, ft, yd, mi), mass (g, kg, mg, lb, oz), temperature (C, F, K), digital storage (B, KB, MB, GB, TB, KiB, MiB, GiB, TiB), or speed (m/s, km/h, mph, knot).",
        {
            value: z.number().describe("The numeric value to convert."),
            from: z
                .string()
                .trim()
                .min(1)
                .max(20)
                .describe("Source unit symbol (e.g. 'mi', 'C', 'GiB', 'kg')."),
            to: z
                .string()
                .trim()
                .min(1)
                .max(20)
                .describe("Target unit symbol (e.g. 'km', 'F', 'MiB', 'lb')."),
        },
        ({ value, from, to }) => convert(value, from, to),
    ],
];
