// LibriVox public-domain audiobooks. No key; the JSON feed is public.
import { z } from "zod";
import { abstractToText } from "./europe-pmc.js";

const API_ROOT = "https://librivox.org/api/feed/audiobooks";
const DESCRIPTION_LIMIT = 500;

// The feed has no substring search. `title=` matches the full title exactly
// ("Count of Monte Cristo" works, "count" 404s), `author=` matches the
// author's surname ("dumas" works, "Alexandre" 404s), and passing both
// together answers HTTP 500 — so exactly one of them is required. The
// `search=` param is silently ignored upstream (it returns the unfiltered
// feed), so it is never sent.
function bookSummary(book) {
    const description = abstractToText(book.description) ?? null;
    return {
        id: book.id ?? null,
        title: book.title ?? null,
        authors: (book.authors ?? []).map(
            (author) =>
                [author.first_name, author.last_name]
                    .filter(Boolean)
                    .join(" ") || null,
        ),
        description:
            description === null
                ? null
                : description.length > DESCRIPTION_LIMIT
                  ? `${description.slice(0, DESCRIPTION_LIMIT)}…`
                  : description,
        description_truncated:
            description !== null && description.length > DESCRIPTION_LIMIT,
        total_time: book.totaltime ?? null,
        language: book.language ?? null,
        url: book.url_librivox ?? null,
    };
}

export const librivoxTools = [
    [
        "librivox_search",
        "Search LibriVox public-domain audiobooks by exact title or author surname. Returns title, author, total running time, language, and a LibriVox link; audio files are linked, never fetched. Public-domain classics only. The title must match exactly and the author is matched by surname — there is no substring or keyword search.",
        {
            title: z
                .string()
                .min(1)
                .max(200)
                .optional()
                .describe(
                    "Exact book title, for example Count of Monte Cristo. Must match the full title.",
                ),
            author: z
                .string()
                .min(1)
                .max(100)
                .optional()
                .describe(
                    "Author surname, for example Dumas. Partial surnames match; first names do not.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(25)
                .default(5)
                .describe("Maximum number of audiobooks to return."),
        },
        async ({ title, author, limit = 5 }, fetchJson) => {
            const cleanTitle = title?.trim();
            const cleanAuthor = author?.trim();
            if (cleanTitle && cleanAuthor)
                throw new Error(
                    "Pass exactly one of title or author — LibriVox rejects a call with both.",
                );
            if (!cleanTitle && !cleanAuthor)
                throw new Error(
                    "Pass a title or an author surname to search LibriVox.",
                );
            if (!Number.isInteger(limit) || limit < 1 || limit > 25)
                throw new Error("limit must be an integer between 1 and 25.");
            const url = new URL(API_ROOT);
            url.searchParams.set("format", "json");
            url.searchParams.set("limit", String(limit));
            if (cleanTitle) url.searchParams.set("title", cleanTitle);
            if (cleanAuthor) url.searchParams.set("author", cleanAuthor);
            let data;
            try {
                data = await fetchJson(url);
            } catch (error) {
                // No match answers HTTP 404 with {"error": "Audiobooks could
                // not be found"} — an empty result, not a failure.
                if (error.message.includes("HTTP 404"))
                    return {
                        title: cleanTitle ?? null,
                        author: cleanAuthor ?? null,
                        total: 0,
                        books: [],
                    };
                throw error;
            }
            const books = data.books ?? [];
            return {
                title: cleanTitle ?? null,
                author: cleanAuthor ?? null,
                total: books.length,
                books: books.map(bookSummary),
            };
        },
    ],
];
