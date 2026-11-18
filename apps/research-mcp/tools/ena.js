import { z } from "zod";

const API_ROOT = "https://www.ebi.ac.uk/ena/portal/api/search";
const DESCRIPTION_LIMIT = 1_000;

// ENA's portal search is Lucene-based: the description field matches whole
// words, not substrings ("emoglo" matches nothing inside "hemoglobin"), and
// a bare multi-word value is rejected with HTTP 400. Quoting the term fixes
// both shapes — a quoted single word answers exactly like the bare one — so
// the term is always sent as a quoted phrase, with Lucene specials escaped.
function escapeTerm(term) {
    return term.replace(/([\\"*?])/g, "\\$1");
}

function formatRecord(record) {
    const description = record.description ? String(record.description) : null;
    const taxId = record.tax_id ? Number.parseInt(record.tax_id, 10) : null;
    return {
        accession: record.accession ?? null,
        description:
            description && description.length > DESCRIPTION_LIMIT
                ? `${description.slice(0, DESCRIPTION_LIMIT)}...`
                : description,
        tax_id: Number.isInteger(taxId) ? taxId : null,
    };
}

export const enaTools = [
    [
        "ena_sequence",
        "Search the European Nucleotide Archive for sequence records by a word in their description (e.g. 'hemoglobin'). Matches whole words, not substrings — a partial word like 'emoglo' matches nothing.",
        {
            query: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Description keyword or phrase (e.g. 'hemoglobin', 'hemoglobin beta')",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of records to return (1-10, default 5)",
                ),
        },
        async ({ query, limit }, fetchJson) => {
            const term = query.trim();
            if (!term) throw new Error("Query must not be empty.");
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const search = `description="${escapeTerm(term)}"`;
            const url =
                `${API_ROOT}?query=${encodeURIComponent(search)}` +
                `&result=sequence&format=json&limit=${n}` +
                `&fields=accession,description,tax_id`;
            const data = await fetchJson(url);
            if (!Array.isArray(data))
                throw new Error("Unexpected response from ENA.");
            return {
                query: term,
                total: data.length,
                sequences: data.slice(0, n).map(formatRecord),
            };
        },
    ],
];
