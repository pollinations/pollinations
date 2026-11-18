// Agify name-age estimate. No key; the public API is keyless.
import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://api.agify.io";

function toEstimate(payload) {
    if (
        !payload ||
        typeof payload.name !== "string" ||
        typeof payload.count !== "number"
    )
        throw new Error("Agify did not return an age estimate.");
    return {
        name: payload.name,
        predicted_age: payload.age ?? null,
        sample_count: payload.count,
        is_prediction: true,
    };
}

export const agifyTools = [
    [
        "agify",
        "Estimate the likely age of a person from their first name, using Agify's public name statistics. Returns a predicted age and the number of records behind it. This is a statistical prediction, not a fact about any individual.",
        {
            name: z
                .string()
                .trim()
                .min(1)
                .max(100)
                .describe(
                    "First name to estimate an age for, for example michael.",
                ),
        },
        async ({ name }) => {
            const trimmed = String(name ?? "").trim();
            if (!trimmed)
                throw new Error("Provide a name to estimate an age for.");
            const url = `${API_ROOT}/?name=${encodeURIComponent(trimmed)}`;
            return toEstimate(await fetchJson(url));
        },
    ],
];
