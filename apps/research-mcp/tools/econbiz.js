// EconBiz (ZBW Leibniz Information Centre for Economics) — keyless.
// The caller's Pollinations key authenticates the proxy. EconBiz is public,
// so the key is never forwarded upstream.
import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://api.econbiz.de/v1/search";
const MAX_AUTHORS = 5;

function firstString(value) {
    if (!Array.isArray(value) || value.length === 0) return null;
    const text = String(value[0]).trim();
    return text.length > 0 ? text : null;
}

function formatRecord(record) {
    return {
        id: record.id ?? null,
        title: record.title ?? null,
        authors: Array.isArray(record.person)
            ? record.person
                  .map((name) => String(name).trim())
                  .filter((name) => name.length > 0)
                  .slice(0, MAX_AUTHORS)
            : [],
        date: firstString(record.date),
        publisher: firstString(record.publisher),
        identifier_url: firstString(record.identifier_url),
    };
}

export const econbizTools = [
    [
        "econbiz_search",
        "Search economics literature through EconBiz (ZBW): working papers, journal articles, and books on a topic. Returns titles, authors, date, publisher, and a link for each match. No key needed.",
        {
            query: z
                .string()
                .min(1)
                .max(200)
                .describe(
                    "Search terms, for example climate change or minimum wage.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe("Maximum number of results to return."),
        },
        async ({ query, limit }) => {
            const term = String(query ?? "").trim();
            if (term.length === 0) {
                throw new Error("Query must not be empty.");
            }
            const count =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 5;
            const url = new URL(API_ROOT);
            url.searchParams.set("q", term);
            const data = await fetchJson(url);
            const hits = data?.hits;
            if (!hits || !Array.isArray(hits.hits)) {
                throw new Error("EconBiz returned an unexpected response.");
            }
            return {
                query: term,
                total: hits.total ?? 0,
                records: hits.hits.slice(0, count).map(formatRecord),
            };
        },
    ],
];
