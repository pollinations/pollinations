import { z } from "zod";

// SI definitions and NIST SP 811 Appendix B.8:
// https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b8
// Derive customary factors from the international inch, pound and standard gravity.
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

export const QuantitySchema = z.enum(Object.keys(UNITS));
export const ConversionSchema = z
    .object({
        quantity: QuantitySchema,
        value: z.number().finite(),
        from: z.string().min(1),
        to: z.string().min(1),
    })
    .strict();

export function convertUnits(input) {
    const { quantity, value, from, to } = ConversionSchema.parse(input);
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
