import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://api.crossref.org/works";
const ABSTRACT_LIMIT = 8_000;

function cleanString(val) {
    if (!val) return "";
    return String(val).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function formatAuthors(authors) {
    if (!Array.isArray(authors)) return [];
    return authors.map((a) => {
        const name = [a.given, a.family].filter(Boolean).join(" ");
        return name || a.name || "Unknown Author";
    });
}

function extractDate(item) {
    const parts =
        item.published?.["date-parts"]?.[0] ||
        item["published-print"]?.["date-parts"]?.[0] ||
        item["published-online"]?.["date-parts"]?.[0] ||
        item.created?.["date-parts"]?.[0];
    if (Array.isArray(parts) && parts.length > 0) {
        return parts.join("-");
    }
    return null;
}

function formatWork(item) {
    const title = Array.isArray(item.title) ? item.title[0] : item.title;
    const container = Array.isArray(item["container-title"])
        ? item["container-title"][0]
        : item["container-title"];
    const abstract = item.abstract ? cleanString(item.abstract) : null;

    return {
        doi: item.DOI,
        title: cleanString(title) || "Untitled Work",
        authors: formatAuthors(item.author),
        container: cleanString(container) || null,
        published: extractDate(item),
        type: item.type || "journal-article",
        citations: item["is-referenced-by-count"] ?? 0,
        url: item.URL || `https://doi.org/${item.DOI}`,
        abstract: abstract ? abstract.slice(0, ABSTRACT_LIMIT) : null,
    };
}

export const crossRefTools = [
    [
        "crossref_search",
        "Search CrossRef for scholarly works, journal articles, books, and conference proceedings by keyword, author, or title.",
        {
            query: z.string().min(1).describe("Search query (keywords, paper title, or author name)"),
            limit: z.number().int().min(1).max(50).default(10).describe("Maximum number of results to return (1-50, default 10)"),
        },
        async ({ query, limit = 10 }, fetchFn = fetchJson) => {
            const url = `${API_ROOT}?query=${encodeURIComponent(query.trim())}&rows=${limit}&select=DOI,title,author,container-title,published,published-print,published-online,created,type,is-referenced-by-count,URL,abstract`;
            const data = await fetchFn(url);
            const items = data?.message?.items || [];
            return {
                totalResults: data?.message?.["total-results"] ?? items.length,
                query: query.trim(),
                works: items.map(formatWork),
            };
        },
    ],
    [
        "crossref_work",
        "Retrieve bibliographic metadata and citation metrics for a specific scholarly publication by DOI.",
        {
            doi: z.string().min(1).describe("Digital Object Identifier (e.g. '10.1038/s41586-020-2649-2')"),
        },
        async ({ doi }, fetchFn = fetchJson) => {
            const normalizedDoi = doi.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
            const url = `${API_ROOT}/${encodeURIComponent(normalizedDoi)}`;
            const data = await fetchFn(url);
            if (!data?.message) {
                throw new Error(`Publication with DOI "${doi}" not found.`);
            }
            return {
                work: formatWork(data.message),
            };
        },
    ],
];
