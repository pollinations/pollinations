import { z } from "zod";

const API_ROOT = "https://api.datacite.org/dois";

function cleanString(val) {
    if (!val) return "";
    return String(val)
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function formatCreators(creators) {
    if (!Array.isArray(creators)) return [];
    return creators
        .map((c) => {
            const name =
                c.name || [c.givenName, c.familyName].filter(Boolean).join(" ");
            return name || null;
        })
        .filter(Boolean);
}

function formatSubjects(subjects) {
    if (!Array.isArray(subjects)) return [];
    return subjects.map((s) => cleanString(s.subject)).filter(Boolean);
}

function formatRecord(item) {
    const attrs = item.attributes || {};
    const title = cleanString(attrs.titles?.[0]?.title) || null;

    return {
        doi: attrs.doi ?? null,
        title,
        creators: formatCreators(attrs.creators),
        publisher: cleanString(attrs.publisher) || null,
        year: attrs.publicationYear ?? null,
        subjects: formatSubjects(attrs.subjects),
        resourceType: attrs.types?.resourceTypeGeneral ?? null,
        type: cleanString(attrs.types?.resourceType) || null,
        url: attrs.url || (attrs.doi ? `https://doi.org/${attrs.doi}` : null),
    };
}

export const dataciteTools = [
    [
        "datacite_search",
        "Search DataCite for research datasets, software, and other research outputs by keyword — the DOI registry for the outputs CrossRef does not cover.",
        {
            query: z
                .string()
                .min(1)
                .max(500)
                .describe(
                    "Search query (keywords, dataset or software title, or author name)",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(50)
                .default(10)
                .describe(
                    "Maximum number of results to return (1-50, default 10)",
                ),
        },
        async ({ query, limit }, fetchJson) => {
            const url = `${API_ROOT}?query=${encodeURIComponent(query.trim())}&page%5Bsize%5D=${limit}`;
            const data = await fetchJson(url);
            const items = data?.data || [];
            return {
                totalResults: data?.meta?.total ?? items.length,
                query: query.trim(),
                results: items.map(formatRecord),
            };
        },
    ],
];
