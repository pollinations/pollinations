import { z } from "zod";
import { getJson } from "../fetch.js";

const INTENSITY = "https://api.carbonintensity.org.uk/intensity";

export const carbonTools = [
    [
        "carbon_intensity",
        "Current UK electricity carbon intensity for the current half-hour, from National Grid ESO. Returns the half-hour window (from, to), forecast and actual intensity in gCO2/kWh, and the index word (very low, low, moderate, high or very high). UK only; no parameters.",
        z.object({}),
        async () => {
            const result = await getJson(INTENSITY);
            const entry = result?.data?.[0];
            if (!entry?.intensity)
                throw new Error(
                    "Carbon intensity did not return a current reading.",
                );
            return {
                from: entry.from,
                to: entry.to,
                forecast: entry.intensity.forecast,
                actual: entry.intensity.actual,
                index: entry.intensity.index,
            };
        },
    ],
];
