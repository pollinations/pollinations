import { z } from "zod";

const API_ROOT = "https://api.fda.gov/drug/label.json";

// Label texts are long (warnings run ~2 KB per label), so every text field is
// capped client-side — a 5-label answer stays far under the 512 KiB cap.
const MAX_TEXT = 1000;

function firstText(value) {
    const text = value?.[0];
    return typeof text === "string" ? text : null;
}

function truncate(text) {
    if (text == null) return null;
    return text.length > MAX_TEXT
        ? `${text.slice(0, MAX_TEXT)}… (truncated)`
        : text;
}

function projectLabel(label) {
    const openfda = label.openfda ?? {};
    return {
        brand_name: openfda.brand_name?.[0] ?? null,
        generic_name: openfda.generic_name?.[0] ?? null,
        manufacturer_name: openfda.manufacturer_name?.[0] ?? null,
        active_ingredient: truncate(firstText(label.active_ingredient)),
        purpose: truncate(firstText(label.purpose)),
        indications: truncate(firstText(label.indications_and_usage)),
        warnings: truncate(firstText(label.warnings)),
        dosage: truncate(firstText(label.dosage_and_administration)),
        set_id: label.set_id ?? null,
        effective_time: label.effective_time ?? null,
    };
}

export const openfdaTools = [
    [
        "openfda_drug_label",
        "Look up FDA drug labels by brand or generic name (openFDA, no key): purpose, indications, warnings and dosage. Labels are informational only — do not rely on them for medical decisions.",
        {
            drug: z
                .string()
                .trim()
                .min(1)
                .max(100)
                .describe(
                    "Brand or generic drug name, e.g. 'aspirin' or 'ibuprofen'.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(5)
                .default(3)
                .describe("Maximum labels to return (default 3, max 5)."),
        },
        async ({ drug, limit }, fetchJson) => {
            // Quote the term so multi-word names match as a phrase; strip
            // quotes from the input so it cannot break out of the phrase.
            const quoted = `"${drug.replace(/"/g, "")}"`;
            const search = `openfda.brand_name:${quoted} OR openfda.generic_name:${quoted}`;
            const url = `${API_ROOT}?search=${encodeURIComponent(search)}&limit=${limit}`;
            let data;
            try {
                data = await fetchJson(url);
            } catch (error) {
                // openFDA answers 404 "No matches found!" for unknown drugs.
                if (
                    error instanceof Error &&
                    error.message.includes("HTTP 404")
                )
                    return { drug, totalResults: 0, labels: [] };
                throw error;
            }
            return {
                drug,
                totalResults: data.meta?.results?.total ?? 0,
                disclaimer: data.meta?.disclaimer ?? null,
                labels: (data.results ?? []).map(projectLabel),
            };
        },
    ],
];
