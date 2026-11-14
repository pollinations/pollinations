import { z } from "zod";

const API_ROOT = "https://doaj.org/api/search/articles";
const ABSTRACT_LIMIT = 500;
const KEYWORD_LIMIT = 5;

function cleanString(val) {
    if (!val) return "";
    return String(val)
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function formatAuthors(authors) {
    if (!Array.isArray(authors)) return [];
    return authors.map((a) => a.name).filter(Boolean);
}

function findIdentifier(item, type) {
    const identifiers = item.bibjson?.identifier;
    if (!Array.isArray(identifiers)) return null;
    return identifiers.find((i) => i.type === type)?.id ?? null;
}

function findFulltextUrl(item) {
    const links = item.bibjson?.link;
    if (!Array.isArray(links)) return null;
    return links.find((l) => l.type === "fulltext")?.url ?? null;
}

function formatArticle(item) {
    const bibjson = item.bibjson ?? {};
    const journal = bibjson.journal ?? {};
    const doi = findIdentifier(item, "doi");
    const abstract = cleanString(bibjson.abstract);

    return {
        id: item.id ?? null,
        title: cleanString(bibjson.title) || null,
        authors: formatAuthors(bibjson.author),
        journal: cleanString(journal.title) || null,
        publisher: cleanString(journal.publisher) || null,
        year: bibjson.year ?? null,
        doi,
        url: findFulltextUrl(item) || (doi ? `https://doi.org/${doi}` : null),
        keywords: Array.isArray(bibjson.keywords)
            ? bibjson.keywords.slice(0, KEYWORD_LIMIT)
            : [],
        abstract: abstract ? abstract.slice(0, ABSTRACT_LIMIT) : null,
    };
}

export const doajTools = [
    [
        "doaj_articles_search",
        "Search the Directory of Open Access Journals (DOAJ) for open-access scholarly articles by keyword, title, or author. All results are open access with a free full-text link.",
        {
            query: z
                .string()
                .min(1)
                .max(500)
                .describe(
                    "Search query (keywords, article title, or author name; fielded queries like 'title:ocean acidification' are supported)",
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
            const trimmed = query.trim();
            const url = `${API_ROOT}/${encodeURIComponent(trimmed)}?page=1&pageSize=${limit}`;
            const data = await fetchJson(url);
            const items = data?.results || [];
            return {
                totalResults: data?.total ?? items.length,
                query: trimmed,
                articles: items.map(formatArticle),
            };
        },
    ],
];
