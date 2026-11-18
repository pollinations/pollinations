import { z } from "zod";

const API_ROOT = "https://api.plos.org/search";
const ABSTRACT_LIMIT = 500;

// PLOS abstracts are plain text in the Solr index, but a record can carry
// markup, so strip tags character by character. A regex strip trips CodeQL's
// incomplete multi-character sanitization check (see InterPro #20161).
const stripTags = (text) => {
    let out = "";
    let inTag = false;
    for (const ch of String(text ?? "")) {
        if (inTag) {
            if (ch === ">") inTag = false;
        } else if (ch === "<") {
            inTag = true;
        } else {
            out += ch;
        }
    }
    return out;
};

const cleanText = (value) => {
    const plain = stripTags(value).replace(/\s+/g, " ").trim();
    return plain || null;
};

const cleanAbstract = (value) => {
    const raw = Array.isArray(value) ? value[0] : value;
    const plain = cleanText(raw);
    if (!plain) return null;
    return plain.length > ABSTRACT_LIMIT
        ? `${plain.slice(0, ABSTRACT_LIMIT - 3)}...`
        : plain;
};

const cleanDate = (value) => {
    if (!value) return null;
    return String(value).slice(0, 10);
};

function formatArticle(doc) {
    return {
        doi: doc.id ?? null,
        title: cleanText(doc.title_display),
        journal: doc.journal ?? null,
        publication_date: cleanDate(doc.publication_date),
        article_type: doc.article_type ?? null,
        authors: Array.isArray(doc.author_display) ? doc.author_display : [],
        abstract: cleanAbstract(doc.abstract),
    };
}

export const plosTools = [
    [
        "plos_search",
        "Search the Public Library of Science (PLOS) open-access journals for research articles by keyword or Solr query: DOI, title, journal, publication date, article type, authors and abstract.",
        {
            query: z
                .string()
                .min(1)
                .max(500)
                .describe(
                    "Search query: plain keywords (e.g. 'ocean acidification') or a Solr field query (e.g. 'title:climate')",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe(
                    "Maximum number of results to return (1-10, default 5)",
                ),
        },
        async ({ query, limit }, fetchJson) => {
            const cleanQuery = String(query ?? "").trim();
            if (!cleanQuery) throw new Error("Provide a search query.");
            const cleanLimit =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const url = `${API_ROOT}?q=${encodeURIComponent(cleanQuery)}&rows=${cleanLimit}`;
            const data = await fetchJson(url);
            const docs = data?.response?.docs;
            if (!Array.isArray(docs))
                throw new Error("Unexpected response from PLOS.");
            return {
                total: data.response.numFound ?? docs.length,
                query: cleanQuery,
                articles: docs.map(formatArticle),
            };
        },
    ],
];
