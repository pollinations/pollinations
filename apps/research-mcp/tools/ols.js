import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://www.ebi.ac.uk/ols4/api/search";
const DESCRIPTION_LIMIT = 500;
const SYNONYM_LIMIT = 5;

// Ontology terms (HP, MONDO, GO, ...) live in the EBI Ontology Lookup
// Service, not in an encyclopedia or a gene database. The tool fetches the
// default page and slices client-side to the requested limit.
function termSummary(doc) {
    const description = Array.isArray(doc.description)
        ? (doc.description[0] ?? null)
        : null;
    const synonyms = [
        ...(doc.exact_synonyms ?? []),
        ...(doc.related_synonyms ?? []),
    ];
    return {
        label: doc.label ?? null,
        ontology: doc.ontology_name ?? null,
        ontology_prefix: doc.ontology_prefix ?? null,
        obo_id: doc.obo_id ?? null,
        description:
            description === null
                ? null
                : description.length > DESCRIPTION_LIMIT
                  ? `${description.slice(0, DESCRIPTION_LIMIT)}...`
                  : description,
        synonyms: [...new Set(synonyms)].slice(0, SYNONYM_LIMIT),
    };
}

export const olsTools = [
    [
        "ols_term",
        "Search ontology terms across the EBI Ontology Lookup Service (Human Phenotype Ontology, MONDO, Gene Ontology and more). Returns the term label, ontology, OBO id, a short description and synonyms. Use it for what a term means in a controlled vocabulary, not for encyclopedia facts or gene data.",
        {
            query: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Search terms, for example diabetes or heart failure.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe("Maximum number of terms to return."),
        },
        async ({ query, limit }) => {
            const trimmed = query.trim();
            if (!trimmed) throw new Error("Query must not be blank.");
            const safeLimit =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const url = new URL(API_ROOT);
            url.searchParams.set("q", trimmed);
            const data = await fetchJson(url);
            const docs = data?.response?.docs;
            if (!Array.isArray(docs))
                throw new Error("Unexpected OLS response.");
            return {
                query: trimmed,
                total: data.response.numFound ?? docs.length,
                terms: docs.slice(0, safeLimit).map(termSummary),
            };
        },
    ],
];
