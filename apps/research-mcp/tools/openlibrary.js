import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://openlibrary.org/api/books";
const SUBJECT_LIMIT = 12;

// Both ISBN checksums are verified before the lookup. A mistyped digit and a book that
// is simply not catalogued produce the same empty answer from the API, so checking the
// digit first is what makes the difference visible to the caller.
function normalizeIsbn(value) {
    const text = value.replace(/[\s-]/g, "").toUpperCase();
    if (/^\d{9}[\dX]$/.test(text)) {
        let total = 0;
        for (let index = 0; index < 10; index += 1)
            total +=
                (10 - index) * (text[index] === "X" ? 10 : Number(text[index]));
        if (total % 11 !== 0)
            throw new Error(
                `ISBN ${value} fails its ISBN-10 check digit; the number was probably mistyped.`,
            );
        return text;
    }
    if (/^\d{13}$/.test(text)) {
        let total = 0;
        for (let index = 0; index < 13; index += 1)
            total += (index % 2 === 0 ? 1 : 3) * Number(text[index]);
        if (total % 10 !== 0)
            throw new Error(
                `ISBN ${value} fails its ISBN-13 check digit; the number was probably mistyped.`,
            );
        return text;
    }
    throw new Error(
        `ISBN ${value} is not ten or thirteen digits (a trailing X is allowed on ISBN-10).`,
    );
}

function names(list) {
    return Array.isArray(list)
        ? list.map((entry) => entry?.name).filter(Boolean)
        : [];
}

export const openLibraryTools = [
    [
        "lookup_isbn",
        "Look up a book by its ISBN in the Open Library catalogue, which is open and needs no key. Accepts ISBN-10 or ISBN-13, with hyphens or spaces. Both check digits are verified locally first, so a mistyped number is reported as mistyped rather than as a book that does not exist. Returns the title, authors, publishers, publication date, page count, subjects and cover URLs. The caller's Pollinations key authenticates the proxy and is never forwarded upstream, since the catalogue is public.",
        {
            isbn: z
                .string()
                .min(10)
                .max(20)
                .describe(
                    "ISBN-10 or ISBN-13, for example 9780140328721 or 0-14-032872-6.",
                ),
        },
        async ({ isbn }, fetchJsonFn = fetchJson) => {
            const normalized = normalizeIsbn(isbn);
            const query = new URLSearchParams({
                bibkeys: `ISBN:${normalized}`,
                format: "json",
                jscmd: "data",
            });
            const payload = await fetchJsonFn(`${API_ROOT}?${query}`);
            const book = payload?.[`ISBN:${normalized}`];
            if (!book)
                throw new Error(
                    `Open Library has no record for ISBN ${normalized}.`,
                );
            return {
                isbn: normalized,
                title: book.title ?? null,
                subtitle: book.subtitle ?? null,
                authors: names(book.authors),
                publishers: names(book.publishers),
                publishPlaces: names(book.publish_places),
                publishDate: book.publish_date ?? null,
                numberOfPages: book.number_of_pages ?? null,
                subjects: names(book.subjects).slice(0, SUBJECT_LIMIT),
                cover: book.cover
                    ? {
                          small: book.cover.small ?? null,
                          medium: book.cover.medium ?? null,
                          large: book.cover.large ?? null,
                      }
                    : null,
                openLibraryUrl:
                    book.url ?? `https://openlibrary.org/isbn/${normalized}`,
                // The other ISBN the book was published under, which is how a caller
                // crosses between the ten- and thirteen-digit forms.
                identifiers: book.identifiers ?? null,
            };
        },
    ],
];
