import { z } from "zod";

const API_ROOT = "https://openlibrary.org";
const COVERS_ROOT = "https://covers.openlibrary.org/b/id";
const DESCRIPTION_LIMIT = 8_000;
const SUBJECT_LIMIT = 20;
const SEARCH_FIELDS =
    "key,title,author_name,first_publish_year,edition_count,cover_i";

function coverUrl(coverId) {
    return coverId ? `${COVERS_ROOT}/${coverId}-M.jpg` : null;
}

function formatSearchDoc(doc) {
    return {
        key: doc.key ?? null,
        title: doc.title ?? null,
        authors: Array.isArray(doc.author_name) ? doc.author_name : [],
        firstPublishYear: doc.first_publish_year ?? null,
        editions: doc.edition_count ?? null,
        coverUrl: coverUrl(doc.cover_i),
    };
}

function extractDescription(description) {
    if (!description) return null;
    const text =
        typeof description === "string"
            ? description
            : (description.value ?? null);
    return text ? String(text).slice(0, DESCRIPTION_LIMIT) : null;
}

function normalizeWorkKey(key) {
    const trimmed = key.trim();
    const bare = trimmed
        .replace(/^https?:\/\/openlibrary\.org/i, "")
        .replace(/^\/?works\//i, "")
        .replace(/\.json$/i, "");
    if (!/^OL\d+W$/i.test(bare))
        throw new Error(
            "Use an Open Library work key like 'OL66554W' (or '/works/OL66554W').",
        );
    return bare.toUpperCase();
}

export const openLibraryTools = [
    [
        "openlibrary_search",
        "Search Open Library for books by title, author, or keyword, returning the matching works with authors, first publish year, edition count, and cover.",
        {
            query: z
                .string()
                .min(1)
                .max(500)
                .describe(
                    "Search query (book title, author name, or keywords)",
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
            const url = `${API_ROOT}/search.json?q=${encodeURIComponent(query.trim())}&limit=${limit}&fields=${SEARCH_FIELDS}`;
            const data = await fetchJson(url);
            const docs = data?.docs || [];
            return {
                totalResults: data?.numFound ?? docs.length,
                query: query.trim(),
                results: docs.map(formatSearchDoc),
            };
        },
    ],
    [
        "openlibrary_work",
        "Retrieve details for a specific Open Library work: description, subjects, first publish date, edition count, and cover.",
        {
            key: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Open Library work key (e.g. 'OL66554W' for Pride and Prejudice)",
                ),
        },
        async ({ key }, fetchJson) => {
            const workKey = normalizeWorkKey(key);
            const work = await fetchJson(`${API_ROOT}/works/${workKey}.json`);
            // Editions count only: limit=1 keeps the response ~1 KB (limit=0 is ignored by the API).
            const editions = await fetchJson(
                `${API_ROOT}/works/${workKey}/editions.json?limit=1`,
            ).catch(() => null);
            return {
                work: {
                    key: work.key ?? `/works/${workKey}`,
                    title: work.title ?? null,
                    description: extractDescription(work.description),
                    subjects: Array.isArray(work.subjects)
                        ? work.subjects.slice(0, SUBJECT_LIMIT)
                        : [],
                    firstPublishDate: work.first_publish_date ?? null,
                    editionsCount: editions?.size ?? null,
                    coverUrl: coverUrl(
                        Array.isArray(work.covers) ? work.covers[0] : null,
                    ),
                },
            };
        },
    ],
];
