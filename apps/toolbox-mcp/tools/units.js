import { z } from "zod";

// Adapted from CristopherSalazar's engineering unit converter (#18231).
// SI definitions and NIST SP 811 Appendix B.8:
// https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b8
const poundForce = 0.45359237 * 9.80665;
export const UNITS = {
    pressure: {
        Pa: 1,
        kPa: 1000,
        MPa: 1e6,
        bar: 1e5,
        mbar: 100,
        atm: 101325,
        psi: poundForce / 0.0254 ** 2,
        "kgf/cm2": 9.80665 / 1e-4,
    },
    volume_flow: {
        "m3/s": 1,
        "m3/h": 1 / 3600,
        "L/s": 1e-3,
        "L/min": 1e-3 / 60,
        "US_gal/min": (231 * 0.0254 ** 3) / 60,
        "imp_gal/min": 0.00454609 / 60,
    },
    power: {
        W: 1,
        kW: 1000,
        MW: 1e6,
        hp_mechanical: 550 * 0.3048 * poundForce,
        hp_metric: 75 * 9.80665,
    },
    energy: {
        J: 1,
        kJ: 1000,
        MJ: 1e6,
        Wh: 3600,
        kWh: 3.6e6,
        MWh: 3.6e9,
        Btu_IT: 1055.05585262,
    },
};

const quantitySchema = z.enum(Object.keys(UNITS));
const conversionSchema = z.strictObject({
    quantity: quantitySchema,
    value: z.number().finite(),
    from: z.string().min(1),
    to: z.string().min(1),
});

export function convertUnits(input) {
    const { quantity, value, from, to } = conversionSchema.parse(input);
    const units = UNITS[quantity];
    for (const unit of [from, to]) {
        if (!Object.hasOwn(units, unit)) {
            throw new Error(
                `Unsupported ${quantity} unit: ${unit}. Supported: ${Object.keys(units).join(", ")}`,
            );
        }
    }
    const factor = units[from] / units[to];
    const converted = value * factor;
    if (!Number.isFinite(converted) || (value !== 0 && converted === 0)) {
        throw new Error(
            "Converted value is outside the supported numeric range.",
        );
    }
    return { quantity, value, from, to, factor, converted };
}

export const unitTools = [
    [
        "list_units",
        "List supported pressure, volume_flow, power and energy units with their SI factors. Unit identifiers are case-sensitive; US and imperial gallons and mechanical and metric horsepower are distinct.",
        { quantity: quantitySchema.optional() },
        ({ quantity }) => (quantity ? { [quantity]: UNITS[quantity] } : UNITS),
    ],
    [
        "convert_units",
        "Convert pressure, volumetric flow, power or energy using fixed SI factors, without model or network calls. Use list_units for identifiers. Returns converted = value * factor with IEEE-754 double precision; no significant-figure rounding. Pressure reference (gauge/absolute) is unchanged; fluid properties and electrical power factor are not inferred.",
        conversionSchema.shape,
        convertUnits,
    ],
];
