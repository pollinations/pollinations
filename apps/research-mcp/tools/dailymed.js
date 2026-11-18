// DailyMed drug label names. No key; the API is the FDA's public label
// repository. Names only — the full label text is a separate, heavy fetch.
import { z } from "zod";

const API_ROOT = "https://dailymed.nlm.nih.gov/dailymed/services/v2";

const NAME_TYPES = { B: "brand", G: "generic" };

function toDrug(entry) {
    if (!entry || typeof entry.drug_name !== "string")
        throw new Error("DailyMed did not return a drug name.");
    return {
        name: entry.drug_name,
        type: NAME_TYPES[entry.name_type] ?? null,
    };
}

export const dailymedTools = [
    [
        "dailymed_drug",
        "Search DailyMed, the FDA's official drug label repository, for drug label names matching a drug name. Returns matching names with brand or generic type and the total number of matches. Names only — no label text, dosage or usage. Names are returned exactly as published, in capitals with upstream spacing.",
        {
            name: z
                .string()
                .trim()
                .min(1)
                .max(200)
                .describe("Drug name to search for, for example aspirin."),
            limit: z
                .number()
                .int()
                .min(1)
                .max(25)
                .default(5)
                .describe("How many names to return, 1-25. Default 5."),
        },
        async ({ name, limit = 5 }, fetchJson) => {
            const trimmed = (name ?? "").trim();
            if (!trimmed) throw new Error("A drug name is required.");
            if (!Number.isInteger(limit) || limit < 1 || limit > 25)
                throw new Error("limit must be an integer from 1 to 25.");
            const data = await fetchJson(
                `${API_ROOT}/drugnames.json?drug_name=${encodeURIComponent(trimmed)}&pagesize=${limit}`,
            );
            if (!data || !Array.isArray(data.data))
                throw new Error("DailyMed did not return drug names.");
            // The same name often appears twice, once as brand and once as
            // generic, so merge types under one name.
            const byName = new Map();
            for (const drug of data.data.map(toDrug)) {
                const existing = byName.get(drug.name);
                if (existing) {
                    if (drug.type && !existing.types.includes(drug.type))
                        existing.types.push(drug.type);
                } else {
                    byName.set(drug.name, {
                        name: drug.name,
                        types: drug.type ? [drug.type] : [],
                    });
                }
            }
            return {
                name: trimmed,
                total:
                    typeof data.metadata?.total_elements === "number"
                        ? data.metadata.total_elements
                        : byName.size,
                drugs: [...byName.values()],
            };
        },
    ],
];
