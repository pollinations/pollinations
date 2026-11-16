import { z } from "zod";

const API_ROOT = "https://gutendex.com/books/";
const SUBJECT_LIMIT = 10;
const SUMMARY_LIMIT = 500;

function cleanString(val) {
    if (!val) return "";
    return String(val)
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function formatAuthors(people) {
    if (!Array.isArray(people)) return [];
    return people.map((p) => p?.name).filter(Boolean);
}

function pickFormat(formats, prefix) {
    if (!formats || typeof formats !== "object") return null;
    const keys = Object.keys(formats);
    const exact = keys.find((k) => k === prefix);
    if (exact) return formats[exact];
    const utf8 = keys.find((k) => k === `${prefix}; charset=utf-8`);
    if (utf8) return formats[utf8];
    const any = keys.find((k) => k.startsWith(prefix));
    return any ? formats[any] : null;
}

function formatBook(item) {
    const summary = Array.isArray(item.summaries) ? item.summaries[0] : null;
    return {
        id: item.id ?? null,
        title: cleanString(item.title) || null,
        authors: formatAuthors(item.authors),
        translators: formatAuthors(item.translators),
        languages: Array.isArray(item.languages) ? item.languages : [],
        subjects: Array.isArray(item.subjects)
            ? item.subjects.slice(0, SUBJECT_LIMIT)
            : [],
        bookshelves: Array.isArray(item.bookshelves)
            ? item.bookshelves.slice(0, SUBJECT_LIMIT)
            : [],
        mediaType: item.media_type ?? null,
        downloadCount: item.download_count ?? null,
        summary: summary ? cleanString(summary).slice(0, SUMMARY_LIMIT) : null,
        textUrl: pickFormat(item.formats, "text/plain"),
        epubUrl: pickFormat(item.formats, "application/epub+zip"),
        htmlUrl: pickFormat(item.formats, "text/html"),
    };
}

export const gutendexTools = [
    [
        "gutendex_search",
        "Search Project Gutenberg's public-domain library for free ebooks by title, author, or keyword. Returns full-text books with direct download links.",
        {
            query: z
                .string()
                .min(1)
                .max(500)
                .describe("Search query (book title, author name, or keyword)"),
            limit: z
                .number()
                .int()
                .min(1)
                .max(25)
                .default(10)
                .describe(
                    "Maximum number of results to return (1-25, default 10)",
                ),
        },
        async ({ query, limit }, fetchJson) => {
            const url = `${API_ROOT}?search=${encodeURIComponent(query.trim())}`;
            const data = await fetchJson(url);
            const items = Array.isArray(data?.results) ? data.results : [];
            return {
                totalResults: data?.count ?? items.length,
                query: query.trim(),
                books: items.slice(0, limit).map(formatBook),
            };
        },
    ],
    [
        "gutendex_book",
        "Retrieve a Project Gutenberg book by its Gutendex id, with authors, subjects, summary, and direct download links for the full text.",
        {
            id: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Gutendex book id (e.g. '1342' for Pride and Prejudice)",
                ),
        },
        async ({ id }, fetchJson) => {
            const normalizedId = id
                .trim()
                .replace(/^https?:\/\/gutendex\.com\/books\//i, "")
                .replace(/\/$/, "");
            if (!/^\d{1,10}$/.test(normalizedId))
                throw new Error(
                    "Use a Gutendex book id like '1342' (digits only).",
                );
            const data = await fetchJson(`${API_ROOT}${normalizedId}/`);
            return { book: formatBook(data) };
        },
    ],
];
