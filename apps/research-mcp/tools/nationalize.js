// Nationalize name-nationality prediction. No key; the public API is keyless.
import { z } from "zod";

const API_ROOT = "https://api.nationalize.io";

function toPrediction(payload, limit) {
    if (
        !payload ||
        typeof payload.name !== "string" ||
        typeof payload.count !== "number" ||
        !Array.isArray(payload.country)
    )
        throw new Error("Nationalize did not return a nationality prediction.");
    return {
        name: payload.name,
        sample_count: payload.count,
        countries: payload.country.slice(0, limit).map((entry) => ({
            country_id: entry.country_id ?? null,
            probability: entry.probability ?? null,
        })),
        is_prediction: true,
    };
}

export const nationalizeTools = [
    [
        "nationality_predict",
        "Predict the likely nationality of a person from their first or full name, using Nationalize's public name statistics. Returns the most likely countries with probabilities and the number of records behind the prediction. This is a statistical prediction, not a fact about any individual.",
        {
            name: z
                .string()
                .trim()
                .min(1)
                .max(100)
                .describe(
                    "First or full name to predict a nationality for, for example michael.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(3)
                .describe("Most likely countries to return."),
        },
        async ({ name, limit }, fetchJson) => {
            const trimmed = String(name ?? "").trim();
            if (!trimmed)
                throw new Error("Provide a name to predict a nationality for.");
            const count = limit ?? 3;
            if (!Number.isInteger(count) || count < 1 || count > 10)
                throw new Error("limit must be between 1 and 10.");
            const url = `${API_ROOT}/?name=${encodeURIComponent(trimmed)}`;
            return toPrediction(await fetchJson(url), count);
        },
    ],
];
