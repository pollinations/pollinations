import { z } from "zod";

const API_URL = "https://openlibrary.org/search.json";
const FIELDS = "key,title,author_name,first_publish_year,isbn,subject";

export const openLibraryTools = [
    [
        "openlibrary_search",
        "Search Open Library books by title, author, subject, or ISBN. Returns work keys, titles, authors, first publish year, ISBNs, and Open Library URLs.",
        {
            query: z.string().trim().min(1).max(300).describe("Book search query"),
            limit: z.number().int().min(1).max(20).default(10),
        },
        async ({ query, limit }, fetchJson) => {
            const url = `${API_URL}?q=${encodeURIComponent(query)}&limit=${limit}&fields=${FIELDS}`;
            const data = await fetchJson(url);
            const docs = Array.isArray(data.docs) ? data.docs : [];
            return {
                num_found: data.numFound ?? docs.length,
                books: docs.slice(0, limit).map((d) => ({
                    key: d.key ?? null,
                    title: d.title ?? null,
                    authors: Array.isArray(d.author_name) ? d.author_name : [],
                    first_publish_year: d.first_publish_year ?? null,
                    isbn: Array.isArray(d.isbn) ? d.isbn.slice(0, 3) : [],
                    subjects: Array.isArray(d.subject) ? d.subject.slice(0, 5) : [],
                    url: d.key ? `https://openlibrary.org${d.key}` : null,
                })),
            };
        },
    ],
];
