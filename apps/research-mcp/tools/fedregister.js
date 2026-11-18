// US Federal Register documents search. Keyless; one fetch per call. The
// API's `conditions[term]` parameter needs its brackets URL-encoded exactly
// as probed — URLSearchParams does that. Abstracts can be long, so they are
// capped at 400 characters; the `next_page_url` in the response is noise and
// is dropped.
import { z } from "zod";

const API_ROOT = "https://www.federalregister.gov/api/v1/documents.json";
const ABSTRACT_LIMIT = 400;
const MAX_RESULTS = 10;

function formatDocument(item) {
    const abstract =
        typeof item.abstract === "string" && item.abstract
            ? item.abstract.slice(0, ABSTRACT_LIMIT)
            : null;
    return {
        title: item.title ?? null,
        type: item.type ?? null,
        publication_date: item.publication_date ?? null,
        document_number: item.document_number ?? null,
        agencies: Array.isArray(item.agencies)
            ? item.agencies.map((a) => a.name).filter(Boolean)
            : [],
        abstract,
    };
}

export const federalRegisterTools = [
    [
        "federal_register",
        "Search the US Federal Register for federal documents — proposed rules, final rules and notices — by keyword: title, type, publication date, document number, agencies and a short abstract. Keyless.",
        {
            term: z
                .string()
                .min(1)
                .max(500)
                .describe(
                    "Search term, for example 'climate' or 'artificial intelligence'",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(MAX_RESULTS)
                .default(5)
                .describe("Maximum number of documents to return (1-10)."),
        },
        async ({ term, limit }, fetchJson) => {
            const query = String(term ?? "").trim();
            if (!query) throw new Error("Provide a search term.");
            const max = limit ?? 5;
            if (!Number.isInteger(max) || max < 1 || max > MAX_RESULTS)
                throw new Error(
                    `limit must be an integer between 1 and ${MAX_RESULTS}.`,
                );
            const params = new URLSearchParams({
                "conditions[term]": query,
                per_page: String(max),
            });
            const data = await fetchJson(`${API_ROOT}?${params}`);
            const results = Array.isArray(data?.results) ? data.results : [];
            return {
                total: data?.count ?? results.length,
                term: query,
                documents: results.slice(0, max).map(formatDocument),
            };
        },
    ],
];
