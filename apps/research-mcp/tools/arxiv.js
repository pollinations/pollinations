import { z } from "zod";
import { fetchText } from "../fetch.js";

const ARXIV_API_URL = "https://export.arxiv.org/api/query";

function cleanText(text) {
    return text ? text.replace(/\s+/g, " ").trim() : "";
}

function parseArxivFeed(xmlText) {
    const entries = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;

    for (const match of xmlText.matchAll(entryRegex)) {
        const entryBlock = match[1];

        const idMatch = /<id>([\s\S]*?)<\/id>/.exec(entryBlock);
        const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(entryBlock);
        const summaryMatch = /<summary>([\s\S]*?)<\/summary>/.exec(entryBlock);
        const publishedMatch = /<published>([\s\S]*?)<\/published>/.exec(
            entryBlock,
        );
        const updatedMatch = /<updated>([\s\S]*?)<\/updated>/.exec(entryBlock);

        // Authors
        const authors = [];
        const authorRegex =
            /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g;
        for (const authorMatch of entryBlock.matchAll(authorRegex)) {
            authors.push(cleanText(authorMatch[1]));
        }

        // Links
        let pdfUrl = null;
        let absUrl = null;
        const linkRegex = /<link([^>]+)\/>/g;
        for (const linkMatch of entryBlock.matchAll(linkRegex)) {
            const attrs = linkMatch[1];
            const hrefMatch = /href="([^"]+)"/.exec(attrs);
            const titleAttr = /title="([^"]+)"/.exec(attrs);
            const relAttr = /rel="([^"]+)"/.exec(attrs);
            if (hrefMatch) {
                if (titleAttr && titleAttr[1] === "pdf") {
                    pdfUrl = hrefMatch[1];
                } else if (relAttr && relAttr[1] === "alternate") {
                    absUrl = hrefMatch[1];
                }
            }
        }

        // Categories
        const primaryCatMatch =
            /<arxiv:primary_category[^>]*term="([^"]+)"/.exec(entryBlock);
        const primaryCategory = primaryCatMatch ? primaryCatMatch[1] : null;

        const rawId = idMatch ? cleanText(idMatch[1]) : "";
        const arxivId = rawId.split("/abs/").pop() || rawId;

        entries.push({
            id: arxivId,
            url: absUrl || rawId,
            pdf_url: pdfUrl,
            title: cleanText(titleMatch ? titleMatch[1] : ""),
            summary: cleanText(summaryMatch ? summaryMatch[1] : ""),
            authors,
            primary_category: primaryCategory,
            published: publishedMatch ? cleanText(publishedMatch[1]) : null,
            updated: updatedMatch ? cleanText(updatedMatch[1]) : null,
        });
    }

    return entries;
}

export async function searchArxiv({ query, category, limit = 5 }) {
    const targetLimit = Math.max(1, Math.min(limit, 25));
    let searchQuery = query ? `all:${query.trim()}` : "";
    if (category?.trim()) {
        searchQuery = searchQuery
            ? `${searchQuery} AND cat:${category.trim()}`
            : `cat:${category.trim()}`;
    }

    if (!searchQuery) {
        throw new Error(
            "Must provide at least a query string or a category filter",
        );
    }

    const params = new URLSearchParams({
        search_query: searchQuery,
        start: "0",
        max_results: String(targetLimit),
        sortBy: "relevance",
        sortOrder: "descending",
    });

    const url = `${ARXIV_API_URL}?${params.toString()}`;
    const xml = await fetchText(url);
    const articles = parseArxivFeed(xml);

    return {
        query: searchQuery,
        total: articles.length,
        articles,
    };
}

export const arxivTools = [
    [
        "arxiv_search",
        "Search scientific, AI, math, and physics papers on arXiv with metadata, summary, and PDF link",
        {
            query: z
                .string()
                .optional()
                .describe(
                    "Search term or keywords to look up in title, abstract, or text",
                ),
            category: z
                .string()
                .optional()
                .describe(
                    "arXiv category filter (e.g. 'cs.AI', 'cs.LG', 'stat.ML', 'physics.soc-ph')",
                ),
            limit: z
                .number()
                .optional()
                .describe(
                    "Maximum number of results to return (1-25, default 5)",
                ),
        },
        async ({ query, category, limit }) => {
            return searchArxiv({ query, category, limit });
        },
    ],
];
