// Adapted from gggff123's #18066; grouped under the shared private Worker.
import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://www.ebi.ac.uk/europepmc/webservices/rest";
const ABSTRACT_LIMIT = 8_000;
// The caller's Pollinations key authenticates the proxy. Europe PMC is public,
// so the key is never forwarded upstream.

const SORTS = {
    relevance: undefined,
    cited: "CITED desc",
    date: "P_PDATE_D desc",
};

const ENTITIES = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
};

function decodeEntities(text) {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
        const key = entity.toLowerCase();
        if (key.startsWith("#x")) {
            const code = Number.parseInt(key.slice(2), 16);
            return code <= 0x10ffff ? String.fromCodePoint(code) : match;
        }
        if (key.startsWith("#")) {
            const code = Number.parseInt(key.slice(1), 10);
            return code <= 0x10ffff ? String.fromCodePoint(code) : match;
        }
        return ENTITIES[key] ?? match;
    });
}

const BREAK_TAGS = new Set([
    "br",
    "p",
    "div",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
]);

export function abstractToText(html) {
    if (!html) return null;
    const input = String(html);
    let text = "";
    let inTag = false;
    let tagName = "";

    for (const char of input) {
        if (inTag) {
            if (char === ">") {
                inTag = false;
                const name = tagName
                    .trim()
                    .replace(/^\//, "")
                    .split(/\s+/)[0]
                    .toLowerCase();
                if (BREAK_TAGS.has(name)) text += "\n\n";
                continue;
            }
            tagName += char;
            continue;
        }
        if (char === "<") {
            inTag = true;
            tagName = "";
            continue;
        }
        text += char;
    }

    const cleaned = decodeEntities(text)
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    return cleaned.length > ABSTRACT_LIMIT
        ? `${cleaned.slice(0, ABSTRACT_LIMIT)}\n[cut at ${ABSTRACT_LIMIT} characters]`
        : cleaned;
}

async function fetchEuropePmc(params) {
    const url = new URL(`${API_ROOT}/search`);
    for (const [key, value] of Object.entries(params))
        if (value !== undefined && value !== null && value !== "")
            url.searchParams.set(key, String(value));
    return fetchJson(url);
}

function articleUrl(result) {
    const id = result.pmid ?? result.id;
    return `https://europepmc.org/article/${result.source ?? "MED"}/${id}`;
}

function articleSummary(result) {
    return {
        id: result.id ?? null,
        source: result.source ?? null,
        pmid: result.pmid ?? null,
        pmcid: result.pmcid ?? null,
        doi: result.doi ?? null,
        title: result.title ?? null,
        authors: result.authorString ?? null,
        journal:
            result.journalTitle ?? result.journalInfo?.journal?.title ?? null,
        year: result.pubYear ?? null,
        cited_by: result.citedByCount ?? null,
        open_access: result.isOpenAccess === "Y",
        url: articleUrl(result),
    };
}

function buildQuery({ query, openAccess, minYear }) {
    const parts = [`(${query})`];
    if (openAccess) parts.push("OPEN_ACCESS:y");
    if (minYear !== undefined) {
        parts.push(`PUB_YEAR:[${minYear} TO ${new Date().getUTCFullYear()}]`);
    }
    return parts.join(" AND ");
}

function idQuery(id) {
    const trimmed = id.trim();
    if (/^PMC\d+$/i.test(trimmed)) return `PMCID:${trimmed.toUpperCase()}`;
    if (/^10\.\d{4,9}\//.test(trimmed)) return `DOI:"${trimmed}"`;
    if (/^\d+$/.test(trimmed)) return `EXT_ID:${trimmed} AND SRC:MED`;
    return `EXT_ID:"${trimmed}"`;
}

export const europePmcTools = [
    [
        "search_articles",
        'Search biomedical literature through Europe PMC. Returns titles, authors, journal, year, citation count, and identifiers. Supports Europe PMC query syntax, for example AUTH:"Doudna J" or TITLE_ABS:CRISPR.',
        {
            query: z
                .string()
                .min(1)
                .max(500)
                .describe(
                    "Search terms or a Europe PMC query, for example semaglutide AND obesity.",
                ),
            limit: z
                .number()
                .int()
                .min(1)
                .max(50)
                .default(10)
                .describe("Maximum number of articles to return."),
            sort: z
                .enum(["relevance", "cited", "date"])
                .default("relevance")
                .describe("Order results by relevance, citations, or date."),
            open_access: z
                .boolean()
                .default(false)
                .describe("Only return open-access articles."),
            min_year: z
                .number()
                .int()
                .min(1800)
                .max(2100)
                .optional()
                .describe(
                    "Only return articles published in this year or later.",
                ),
        },
        async ({ query, limit, sort, open_access, min_year }) => {
            const data = await fetchEuropePmc(
                {
                    query: buildQuery({
                        query,
                        openAccess: open_access,
                        minYear: min_year,
                    }),
                    format: "json",
                    resultType: "lite",
                    pageSize: limit,
                    sort: SORTS[sort],
                },
                "Europe PMC search",
            );
            return {
                query,
                hit_count: data.hitCount ?? 0,
                articles: (data.resultList?.result ?? []).map(articleSummary),
            };
        },
    ],
    [
        "get_article",
        "Read one biomedical article by PMID, DOI, or PMCID: abstract, authors, journal details, keywords, and MeSH terms.",
        {
            id: z
                .string()
                .min(1)
                .max(200)
                .regex(/^[A-Za-z0-9._/():-]+$/)
                .describe(
                    "PMID (32554568), DOI (10.1016/S0140-6736(20)30752-2), or PMCID (PMC7566194).",
                ),
        },
        async ({ id }) => {
            const data = await fetchEuropePmc(
                {
                    query: idQuery(id),
                    format: "json",
                    resultType: "core",
                    pageSize: 1,
                },
                "Europe PMC article",
            );
            const result = data.resultList?.result?.[0];
            if (!result) {
                throw new Error(
                    `No article found for ${id}. Use a PMID, DOI, or PMCID.`,
                );
            }

            return {
                ...articleSummary(result),
                abstract: abstractToText(result.abstractText),
                journal_details: {
                    title: result.journalInfo?.journal?.title ?? null,
                    volume: result.journalInfo?.volume ?? null,
                    issue: result.journalInfo?.issue ?? null,
                    pages: result.pageInfo ?? null,
                    year: result.journalInfo?.yearOfPublication ?? null,
                },
                publication_types:
                    result.pubTypeList?.pubType?.map(
                        (type) => type ?? type?.["#text"],
                    ) ?? [],
                keywords: result.keywordList?.keyword ?? [],
                mesh_terms:
                    result.meshHeadingList?.meshHeading?.map(
                        (heading) => heading.descriptorName,
                    ) ?? [],
                full_text_available:
                    result.isOpenAccess === "Y" || result.inEPMC === "Y",
            };
        },
    ],
];
