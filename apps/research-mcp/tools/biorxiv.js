import { z } from "zod";

const API_ROOT = "https://api.biorxiv.org/details";
const PAGE_SIZE = 30;
const ABSTRACT_LIMIT = 500;
const DEFAULT_WINDOW_DAYS = 7;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 30;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeCategory(value) {
    return value.toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function parseDate(value, name) {
    if (!DATE_RE.test(value))
        throw new Error(`${name} must be a YYYY-MM-DD date, got "${value}"`);
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    )
        throw new Error(`${name} is not a real calendar date: "${value}"`);
    return date;
}

function formatDate(date) {
    return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function cleanString(val) {
    if (!val) return "";
    return String(val).replace(/\s+/g, " ").trim();
}

function formatPreprint(item) {
    const doi = item.doi ?? null;
    const abstract = cleanString(item.abstract);
    const authors = cleanString(item.authors);
    return {
        title: cleanString(item.title) || null,
        authors: authors
            ? authors
                  .split(";")
                  .map((a) => a.trim())
                  .filter(Boolean)
            : [],
        date: item.date ?? null,
        doi,
        url: doi ? `https://doi.org/${doi}` : null,
        category: item.category ?? null,
        type: item.type ?? null,
        version: item.version ?? null,
        license: item.license ?? null,
        server: item.server ?? null,
        abstractSnippet: abstract ? abstract.slice(0, ABSTRACT_LIMIT) : null,
    };
}

async function fetchPage(fetchJson, server, start, end, cursor, category) {
    const query = category ? `?category=${encodeURIComponent(category)}` : "";
    const data = await fetchJson(
        `${API_ROOT}/${server}/${start}/${end}/${cursor}/json${query}`,
    );
    const messages = Array.isArray(data?.messages) ? data.messages : [];
    const status = messages[0]?.status ?? "";
    // The API answers HTTP 200 even for errors and empty ranges; the
    // message is the real status. Unknown categories are silently ignored
    // upstream, so the caller checks the echoed category instead.
    if (status === "no posts found")
        return { total: 0, items: [], categoryEcho: null };
    if (status !== "ok")
        throw new Error(`bioRxiv API: ${status || "unexpected response"}`);
    const total = Number.parseInt(messages[0]?.total ?? "0", 10) || 0;
    return {
        total,
        items: Array.isArray(data?.collection) ? data.collection : [],
        categoryEcho: messages[0]?.category ?? null,
    };
}

export const biorxivTools = [
    [
        "biorxiv_recent",
        "List recent preprints on bioRxiv or medRxiv by posting date — a 'what's new' browser, not a keyword search (the API has no search). Returns the newest preprints in the date window first, with title, authors, date, DOI, category, type, version, license and a short abstract snippet. The API lists oldest-first and 30 per page, so the tool fetches the newest page for the window.",
        {
            server: z
                .enum(["biorxiv", "medrxiv"])
                .default("biorxiv")
                .describe(
                    "Preprint server: biorxiv (biology) or medrxiv (health sciences)",
                ),
            start_date: z
                .string()
                .regex(DATE_RE, "start_date must be YYYY-MM-DD")
                .optional()
                .describe(
                    "First posting date, YYYY-MM-DD (default: 6 days before end_date)",
                ),
            end_date: z
                .string()
                .regex(DATE_RE, "end_date must be YYYY-MM-DD")
                .optional()
                .describe("Last posting date, YYYY-MM-DD (default: today)"),
            category: z
                .string()
                .min(1)
                .max(100)
                .optional()
                .describe(
                    "Subject category, e.g. neuroscience or cell_biology for bioRxiv, cardiovascular medicine for medRxiv. Unknown categories are rejected — the API silently ignores bad ones and returns every category.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(MAX_LIMIT)
                .default(DEFAULT_LIMIT)
                .describe(
                    "Maximum number of preprints to return (1-30, default 10)",
                ),
        },
        async (
            {
                server = "biorxiv",
                start_date,
                end_date,
                category,
                limit = DEFAULT_LIMIT,
            },
            fetchJson,
        ) => {
            const end = end_date ? parseDate(end_date, "end_date") : new Date();
            const start = start_date
                ? parseDate(start_date, "start_date")
                : addDays(end, -(DEFAULT_WINDOW_DAYS - 1));
            if (start > end)
                throw new Error(
                    `start_date ${formatDate(start)} is after end_date ${formatDate(end)}`,
                );
            const startStr = formatDate(start);
            const endStr = formatDate(end);
            const trimmedCategory = category?.trim() || null;
            const first = await fetchPage(
                fetchJson,
                server,
                startStr,
                endStr,
                0,
                trimmedCategory,
            );
            if (first.total === 0)
                return {
                    server,
                    startDate: startStr,
                    endDate: endStr,
                    category: trimmedCategory,
                    totalResults: 0,
                    preprints: [],
                };
            if (trimmedCategory) {
                const echo = first.categoryEcho
                    ? normalizeCategory(first.categoryEcho)
                    : "";
                if (echo !== normalizeCategory(trimmedCategory))
                    throw new Error(
                        `Unknown category "${trimmedCategory}" for ${server}`,
                    );
            }
            let items = first.items;
            if (first.total > PAGE_SIZE) {
                const lastCursor =
                    Math.floor((first.total - 1) / PAGE_SIZE) * PAGE_SIZE;
                const last = await fetchPage(
                    fetchJson,
                    server,
                    startStr,
                    endStr,
                    lastCursor,
                    trimmedCategory,
                );
                items = last.items;
            }
            // API order is oldest-first within the window; a "recent"
            // listing returns the newest first.
            const newest = items.slice(-limit).reverse();
            return {
                server,
                startDate: startStr,
                endDate: endStr,
                category: trimmedCategory,
                totalResults: first.total,
                preprints: newest.map(formatPreprint),
            };
        },
    ],
];
