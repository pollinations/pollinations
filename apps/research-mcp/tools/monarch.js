import { z } from "zod";

const API_ROOT = "https://api.monarchinitiative.org/v3/api/search";
const DESCRIPTION_LIMIT = 500;
const XREF_LIMIT = 10;

function formatResult(item) {
    const description = item.description
        ? String(item.description).slice(0, DESCRIPTION_LIMIT)
        : null;
    const xref = Array.isArray(item.xref)
        ? item.xref.filter((x) => typeof x === "string").slice(0, XREF_LIMIT)
        : [];
    return {
        id: item.id ?? null,
        category: item.category ?? null,
        name: item.name ?? null,
        description,
        xref,
    };
}

export const monarchTools = [
    [
        "monarch_search",
        "Search the Monarch Initiative ontology for diseases, genes, phenotypes and other biomedical entities by keyword. Returns each match's ontology id (e.g. MONDO:0007254), category, name, a short description and cross-references to other ontologies (DOID, ICD10, UMLS). Use it to find the ontology id for a disease or gene, or to see what an entity is; it does not look up variants or gene sequences — ClinVar and NCBI Gene answer those.",
        {
            query: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Search query (disease, gene or phenotype name, e.g. 'breast cancer')",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of results to return (1-10, default 5)",
                ),
        },
        async ({ query, limit }, fetchJson) => {
            const trimmed = query.trim();
            if (!trimmed) throw new Error("query must not be blank.");
            const safeLimit =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const url = `${API_ROOT}?q=${encodeURIComponent(trimmed)}&limit=${safeLimit}`;
            const data = await fetchJson(url);
            const items = Array.isArray(data?.items) ? data.items : [];
            return {
                query: trimmed,
                total:
                    typeof data?.total === "number" ? data.total : items.length,
                results: items.map(formatResult),
            };
        },
    ],
];
