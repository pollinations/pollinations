import { z } from "zod";
import { fetchText } from "../fetch.js";
import { decodeEntities } from "./europe-pmc.js";

const API_ROOT = "https://api.elifesciences.org/search";
// The API content-negotiates: Accept: application/json answers 406, so the
// vendor media type is sent (the rfc.js plain-text precedent).
const ACCEPT = "application/vnd.elife.search+json; version=2";

// Titles carry <i> markup, so tags are stripped char by char (never a regex).
function stripTags(text) {
    let out = "";
    let inTag = false;
    for (const char of String(text)) {
        if (inTag) {
            if (char === ">") inTag = false;
            continue;
        }
        if (char === "<") {
            inTag = true;
            continue;
        }
        out += char;
    }
    return decodeEntities(out).replace(/\s+/g, " ").trim();
}

function formatArticle(item) {
    const title = stripTags(item.title ?? "") || null;
    const doi = item.doi ?? null;
    return {
        title,
        doi,
        type: item.type ?? null,
        published: item.published ? String(item.published).slice(0, 10) : null,
        elocation_id: item.elocationId ?? null,
        authors: item.authorLine ?? null,
        url: item.elocationId
            ? `https://elifesciences.org/articles/${item.elocationId}`
            : doi
              ? `https://doi.org/${doi}`
              : null,
    };
}

export const elifeTools = [
    [
        "elife_search",
        "Search eLife, a single open-access life-science journal, for research articles by keyword. Returns title, DOI, publication date, authors and article link. For other journals use crossref_search or the PLOS and bioRxiv lookups.",
        {
            query: z
                .string()
                .min(1)
                .max(200)
                .describe("Search keywords, for example cancer or CRISPR."),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe("Maximum number of articles to return (1-10)."),
        },
        async ({ query, limit }) => {
            const trimmed = String(query ?? "").trim();
            if (!trimmed) {
                throw new Error("query must not be blank.");
            }
            const count =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const url = `${API_ROOT}?for=${encodeURIComponent(trimmed)}&page=1&per-page=${count}&use-date=published`;
            const data = JSON.parse(await fetchText(url, ACCEPT));
            if (!Array.isArray(data?.items)) {
                throw new Error(
                    "eLife search returned an unexpected response.",
                );
            }
            return {
                query: trimmed,
                total: data.total ?? data.items.length,
                results: data.items.map(formatArticle),
            };
        },
    ],
];
