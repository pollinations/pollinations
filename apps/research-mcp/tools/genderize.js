// Genderize name-gender prediction. No key; the public API is keyless.
// Free tier: 1,000 requests per day with no key — a shared server can
// exhaust that quickly, so the tool description says so plainly.
import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://api.genderize.io";

function toPrediction(payload) {
    if (
        !payload ||
        typeof payload.name !== "string" ||
        typeof payload.count !== "number" ||
        (payload.gender !== null &&
            payload.gender !== "male" &&
            payload.gender !== "female") ||
        typeof payload.probability !== "number"
    )
        throw new Error("Genderize did not return a gender prediction.");
    return {
        name: payload.name,
        predicted_gender: payload.gender,
        probability: payload.probability,
        sample_count: payload.count,
        is_prediction: true,
    };
}

export const genderizeTools = [
    [
        "gender_predict",
        "Predict the likely gender associated with a first name, using Genderize's public name statistics. Returns a predicted gender, its probability and the number of records behind it. This is a statistical prediction, not a fact about any individual. Free tier: 1,000 requests per day with no key, which a shared server can exhaust quickly.",
        {
            name: z
                .string()
                .trim()
                .min(1)
                .max(100)
                .describe(
                    "First name to predict a gender for, for example michael.",
                ),
            country_id: z
                .string()
                .trim()
                .regex(/^[A-Za-z]{2}$/)
                .optional()
                .describe(
                    "Optional ISO 3166-1 alpha-2 country code, for example BR, to weigh the prediction toward names in that country.",
                ),
        },
        async ({ name, country_id }) => {
            const trimmed = String(name ?? "").trim();
            if (!trimmed)
                throw new Error("Provide a name to predict a gender for.");
            const country = country_id
                ? String(country_id).trim().toUpperCase()
                : null;
            if (country_id && !/^[A-Z]{2}$/.test(country))
                throw new Error(
                    "country_id must be a two-letter country code, for example BR.",
                );
            const url = new URL(`${API_ROOT}/`);
            url.search = new URLSearchParams({
                name: trimmed,
                ...(country ? { country_id: country } : {}),
            }).toString();
            const prediction = toPrediction(await fetchJson(url));
            return { ...prediction, country_id: country };
        },
    ],
];
