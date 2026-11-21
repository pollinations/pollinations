// Open Library is a public catalog: no key is sent upstream and every call is
// one fixed endpoint. Results are normalized so callers do not have to handle
// string-or-object descriptions and nested author references.
import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://openlibrary.org";
const COVERS_ROOT = "https://covers.openlibrary.org/b/id";
const DESCRIPTION_LIMIT = 4000;
const SUBJECT_LIMIT = 30;
const AUTHOR_LIMIT = 5;
const LINK_LIMIT = 10;
const LANGUAGE_LIMIT = 8;
const ALTERNATE_NAME_LIMIT = 20;
const SEARCH_FIELDS = [
    "key",
    "title",
    "author_name",
    "author_key",
    "first_publish_year",
    "edition_count",
    "language",
    "cover_i",
    "ebook_access",
    "ratings_average",
    "ratings_count",
].join(",");

const WORK_KEY = /^OL\d{1,10}W$/;
const EDITION_KEY = /^OL\d{1,10}M$/;
const AUTHOR_KEY = /^OL\d{1,10}A$/;
const ISBN = /^(?:\d{9}[\dXx]|\d{13})$/;

function plainText(value) {
    if (typeof value === "string") return value;
    if (typeof value?.value === "string") return value.value;
    return null;
}

function trimText(value, limit) {
    const text = plainText(value);
    if (!text) return null;
    return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function entityId(key) {
    return typeof key === "string" ? key.split("/").pop() : null;
}

function coverUrl(id, size = "M") {
    return typeof id === "number" ? `${COVERS_ROOT}/${id}-${size}.jpg` : null;
}

function authorIds(data) {
    return (data?.authors ?? [])
        .map((entry) => entityId(entry?.author?.key ?? entry?.key))
        .filter(Boolean);
}

async function authorNames(ids) {
    return Promise.all(
        ids.slice(0, AUTHOR_LIMIT).map(async (key) => {
            try {
                const data = await fetchJson(`${API_ROOT}/authors/${key}.json`);
                return { key, name: data?.name ?? null };
            } catch {
                // A missing author record must not hide the book itself.
                return { key, name: null };
            }
        }),
    );
}

function bookSummary(doc) {
    return {
        key: entityId(doc?.key),
        title: doc?.title ?? null,
        authors: (doc?.author_name ?? []).map((name, index) => ({
            name,
            key: doc?.author_key?.[index] ?? null,
        })),
        firstPublishYear: doc?.first_publish_year ?? null,
        editionCount: doc?.edition_count ?? null,
        languages: (doc?.language ?? []).slice(0, LANGUAGE_LIMIT),
        ebookAccess: doc?.ebook_access ?? null,
        rating:
            typeof doc?.ratings_average === "number"
                ? {
                      average: Math.round(doc.ratings_average * 100) / 100,
                      count: doc?.ratings_count ?? 0,
                  }
                : null,
        coverUrl: coverUrl(doc?.cover_i),
        url: doc?.key ? `${API_ROOT}${doc.key}` : null,
    };
}

function editionSummary(entry) {
    return {
        key: entityId(entry?.key),
        title: entry?.title ?? null,
        publishDate: entry?.publish_date ?? null,
        publishers: (entry?.publishers ?? []).slice(0, 5),
        pages: entry?.number_of_pages ?? null,
        isbn10: entry?.isbn_10 ?? [],
        isbn13: entry?.isbn_13 ?? [],
        languages: (entry?.languages ?? [])
            .map((language) => entityId(language?.key))
            .filter(Boolean)
            .slice(0, LANGUAGE_LIMIT),
        coverUrl: coverUrl((entry?.covers ?? [])[0]),
        url: entry?.key ? `${API_ROOT}${entry.key}` : null,
    };
}

const languageSchema = z
    .string()
    .trim()
    .regex(/^[a-z]{3}$/)
    .optional()
    .describe(
        "Optional three-letter MARC language code, for example eng or rus.",
    );

export const bookTools = [
    [
        "search_books",
        "Search the Open Library catalog by title, author, or subject. Returns work ids, author names and ids, first publication year, edition counts, languages, ratings and cover URLs. Use get_book or list_editions with a returned work id.",
        {
            query: z
                .string()
                .trim()
                .min(1)
                .max(200)
                .describe(
                    "Words to search for, for example dune frank herbert.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(50)
                .default(10)
                .describe("Maximum number of works to return."),
            language: languageSchema,
            sort: z
                .enum(["relevance", "new", "old", "editions"])
                .default("relevance")
                .describe(
                    "relevance keeps Open Library ranking; editions sorts by edition count.",
                ),
        },
        async ({ query, limit, language, sort }) => {
            const order = sort ?? "relevance";
            const url = new URL(`${API_ROOT}/search.json`);
            const params = {
                q: query,
                limit: String(limit ?? 10),
                fields: SEARCH_FIELDS,
            };
            if (language) params.language = language;
            if (order !== "relevance") params.sort = order;
            url.search = new URLSearchParams(params).toString();
            const data = await fetchJson(url);
            const books = (data.docs ?? []).map(bookSummary);
            return {
                query,
                language: language ?? null,
                sort: order,
                total: data.numFound ?? 0,
                returned: books.length,
                books,
            };
        },
    ],
    [
        "get_book",
        "Read one Open Library work or edition by work id (OL...W), edition id (OL...M) or ISBN-10/ISBN-13. Returns title, description, authors with names, subjects, publication dates, publishers, pages, ISBNs, languages and cover URL.",
        {
            id: z
                .string()
                .trim()
                .min(1)
                .max(40)
                .describe(
                    "Work id such as OL893414W, edition id such as OL7524304M, or ISBN such as 9780441013593.",
                ),
        },
        async ({ id }) => {
            const compact = id.replace(/[-\s]/g, "");
            let path;
            let kind;
            if (WORK_KEY.test(id)) {
                path = `/works/${id}.json`;
                kind = "work";
            } else if (EDITION_KEY.test(id)) {
                path = `/books/${id}.json`;
                kind = "edition";
            } else if (ISBN.test(compact)) {
                path = `/isbn/${compact}.json`;
                kind = "edition";
            } else {
                throw new Error(
                    "Expected a work id (OL...W), an edition id (OL...M), or an ISBN-10/ISBN-13.",
                );
            }
            const data = await fetchJson(`${API_ROOT}${path}`);
            const ids = authorIds(data);
            const subjects = (data.subjects ?? []).filter(
                (subject) => typeof subject === "string",
            );
            return {
                kind,
                key: entityId(data.key),
                title: data.title ?? null,
                subtitle: data.subtitle ?? null,
                authors: ids.length > 0 ? await authorNames(ids) : [],
                description: trimText(data.description, DESCRIPTION_LIMIT),
                subjects: {
                    total: subjects.length,
                    items: subjects.slice(0, SUBJECT_LIMIT),
                },
                firstPublishDate: data.first_publish_date ?? null,
                publishDate: data.publish_date ?? null,
                publishers: (data.publishers ?? []).slice(0, 10),
                pages: data.number_of_pages ?? null,
                isbn10: data.isbn_10 ?? [],
                isbn13: data.isbn_13 ?? [],
                languages: (data.languages ?? [])
                    .map((language) => entityId(language?.key))
                    .filter(Boolean),
                works: (data.works ?? [])
                    .map((work) => entityId(work?.key))
                    .filter(Boolean),
                links: (data.links ?? [])
                    .slice(0, LINK_LIMIT)
                    .map((link) => ({
                        title: link?.title ?? null,
                        url: link?.url ?? null,
                    }))
                    .filter((link) => link.url),
                coverUrl: coverUrl((data.covers ?? [])[0], "L"),
                url: data.key ? `${API_ROOT}${data.key}` : null,
            };
        },
    ],
    [
        "list_editions",
        "List printed editions of an Open Library work: publisher, publication date, page count, ISBN-10/ISBN-13, languages and cover. Use the total and offset to page through large works such as Dune.",
        {
            work: z
                .string()
                .trim()
                .regex(WORK_KEY)
                .describe("Work id such as OL893414W."),
            limit: z
                .number()
                .int()
                .min(1)
                .max(50)
                .default(20)
                .describe("Maximum number of editions to return."),
            offset: z
                .number()
                .int()
                .min(0)
                .max(10000)
                .default(0)
                .describe("Number of editions to skip."),
        },
        async ({ work, limit, offset }) => {
            const url = new URL(`${API_ROOT}/works/${work}/editions.json`);
            url.search = new URLSearchParams({
                limit: String(limit ?? 20),
                offset: String(offset ?? 0),
            }).toString();
            const data = await fetchJson(url);
            const editions = (data.entries ?? []).map(editionSummary);
            return {
                work,
                total: data.size ?? null,
                offset: offset ?? 0,
                returned: editions.length,
                editions,
            };
        },
    ],
    [
        "get_author",
        "Read an Open Library author by id (OL...A): name, birth and death dates, biography, alternate names and the most reprinted works. Take author ids from search_books or get_book results.",
        {
            author: z
                .string()
                .trim()
                .regex(AUTHOR_KEY)
                .describe("Author id such as OL79034A."),
            limit: z
                .number()
                .int()
                .min(1)
                .max(50)
                .default(10)
                .describe("Maximum number of works to return."),
        },
        async ({ author, limit }) => {
            const worksUrl = new URL(`${API_ROOT}/search.json`);
            worksUrl.search = new URLSearchParams({
                author_key: author,
                limit: String(limit ?? 10),
                fields: SEARCH_FIELDS,
                sort: "editions",
            }).toString();
            const [data, works] = await Promise.all([
                fetchJson(`${API_ROOT}/authors/${author}.json`),
                fetchJson(worksUrl),
            ]);
            const alternateNames = data.alternate_names ?? [];
            return {
                key: entityId(data.key) ?? author,
                name: data.name ?? null,
                personalName: data.personal_name ?? null,
                birthDate: data.birth_date ?? null,
                deathDate: data.death_date ?? null,
                bio: trimText(data.bio, DESCRIPTION_LIMIT),
                alternateNames: {
                    total: alternateNames.length,
                    items: alternateNames.slice(0, ALTERNATE_NAME_LIMIT),
                },
                workCount: works.numFound ?? null,
                works: (works.docs ?? []).map(bookSummary),
                url: `${API_ROOT}/authors/${author}`,
            };
        },
    ],
];
