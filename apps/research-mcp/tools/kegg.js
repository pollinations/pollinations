import { z } from "zod";
import { fetchText } from "../fetch.js";

const API_ROOT = "https://rest.kegg.jp/find/compound";
// KEGG's find endpoint answers in ~2 s even for a 120-byte payload, and
// returns an empty body (one newline) for unknown terms instead of a 404.

// Parse KEGG's plain-text TSV: one compound per line, "C01405\tAspirin;
// Acetylsalicylic acid; ...". Lines without a tab or an ID are skipped.
function parseCompounds(text) {
    const compounds = [];
    for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const tab = trimmed.indexOf("\t");
        if (tab <= 0) continue;
        const names = trimmed
            .slice(tab + 1)
            .split(";")
            .map((name) => name.trim())
            .filter(Boolean)
            .slice(0, 5);
        if (names.length === 0) continue;
        compounds.push({ kegg_id: trimmed.slice(0, tab), names });
    }
    return compounds;
}

export const keggTools = [
    [
        "kegg_compound",
        "Look up chemical compounds by name in the KEGG database. Returns KEGG compound IDs with their synonyms. No key needed.",
        {
            query: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Compound name or partial name, for example aspirin. KEGG find is a substring search.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe("Maximum number of compounds to return."),
        },
        async ({ query, limit }) => {
            const term = query?.trim();
            if (!term) {
                throw new Error("Provide a compound name to look up.");
            }
            const max = Number.isInteger(limit) ? limit : 5;
            if (max < 1 || max > 10) {
                throw new Error("limit must be between 1 and 10.");
            }
            const text = await fetchText(
                `${API_ROOT}/${encodeURIComponent(term)}`,
                "text/plain",
            );
            const compounds = parseCompounds(text);
            if (compounds.length === 0) {
                throw new Error(`No KEGG compound found for "${term}".`);
            }
            return {
                query: term,
                total: compounds.length,
                compounds: compounds.slice(0, max),
            };
        },
    ],
];
