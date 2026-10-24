import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const SERVER_NAME = "pubmed-mcp";
const API_ROOT = "https://www.ebi.ac.uk/europepmc/webservices/rest";
const REQUEST_TIMEOUT_MS = 15_000;
const ABSTRACT_LIMIT = 8_000;
// The caller's Pollinations key authenticates the proxy. Europe PMC is public,
// so the key is never forwarded upstream.
const UPSTREAM_HEADERS = {
    Accept: "application/json",
    "User-Agent": `pollinations-${SERVER_NAME} (https://pollinations.ai)`,
};

const SORTS = {
    relevance: undefined,
    cited: "CITED desc",
    date: "P_PDATE_D desc",
};

function textResult(value) {
    return {
        content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    };
}

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

async function fetchEuropePmc(params, label) {
    const url = new URL(`${API_ROOT}/search`);
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === "") continue;
        url.searchParams.set(key, String(value));
    }

    let response;
    try {
        response = await fetch(url, {
            headers: UPSTREAM_HEADERS,
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch {
        throw new Error(
            `${label} is unreachable right now. Try again shortly.`,
        );
    }

    const body = await response.text();
    if (!response.ok) {
        throw new Error(
            `${label} error (${response.status})${body ? `: ${body.slice(0, 300)}` : ""}`,
        );
    }
    try {
        return JSON.parse(body);
    } catch {
        throw new Error(`${label} returned invalid JSON.`);
    }
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
        journal: result.journalTitle ?? null,
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
    if (/^\d+$/.test(trimmed)) return `EXT_ID:${trimmed}`;
    return `EXT_ID:"${trimmed}"`;
}

function buildServer() {
    const server = new McpServer(
        { name: SERVER_NAME, title: "PubMed", version: "0.1.0" },
        {
            instructions:
                "Search PubMed-indexed biomedical literature through Europe PMC and read article details. Use search_articles with plain terms or Europe PMC query syntax such as TITLE_ABS:remimazolam AND OPEN_ACCESS:y, then get_article with a PMID, DOI, or PMCID for the abstract and metadata.",
            capabilities: { tools: {} },
        },
    );

    server.registerTool(
        "search_articles",
        {
            title: "Search biomedical literature",
            description:
                'Search PubMed-indexed articles through Europe PMC. Returns titles, authors, journal, year, citation count, and identifiers. Supports Europe PMC query syntax, for example AUTH:"Doudna J" or TITLE_ABS:CRISPR.',
            inputSchema: z.object({
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
                    .describe(
                        "Order results by relevance, citations, or date.",
                    ),
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
            }),
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
            return textResult({
                query,
                hit_count: data.hitCount ?? 0,
                articles: (data.resultList?.result ?? []).map(articleSummary),
            });
        },
    );

    server.registerTool(
        "get_article",
        {
            title: "Get article",
            description:
                "Read one biomedical article by PMID, DOI, or PMCID: abstract, authors, journal details, keywords, and MeSH terms.",
            inputSchema: z.object({
                id: z
                    .string()
                    .min(1)
                    .max(200)
                    .regex(/^[A-Za-z0-9._/():-]+$/)
                    .describe(
                        "PMID (32554568), DOI (10.1016/S0140-6736(20)30752-2), or PMCID (PMC7566194).",
                    ),
            }),
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

            return textResult({
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
            });
        },
    );

    return server;
}

const mcpHandler = createMcpHandler(() => buildServer(), {
    legacy: "stateless",
    onerror: (error) => console.error(error),
});

function readBearerToken(request) {
    const authorization = request.headers.get("authorization");
    if (!authorization) return null;

    const [scheme, token] = authorization.trim().split(/\s+/, 2);
    if (scheme?.toLowerCase() !== "bearer" || !token) {
        return null;
    }
    return token;
}

function unauthorizedResponse() {
    return Response.json(
        {
            error: "unauthorized",
            message: "Send a Pollinations API key as a bearer token.",
        },
        {
            status: 401,
            headers: {
                "WWW-Authenticate": `Bearer realm="${SERVER_NAME}.pollinations.ai"`,
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: SERVER_NAME,
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }

        if (url.pathname !== "/") {
            return new Response("Not found", { status: 404 });
        }

        const token = readBearerToken(request);
        if (!token) return unauthorizedResponse();

        if (
            request.method === "POST" &&
            Array.isArray(
                await request
                    .clone()
                    .json()
                    .catch(() => null),
            )
        ) {
            return Response.json(
                {
                    error: "invalid_request",
                    message: "Batch requests are not supported.",
                },
                { status: 400 },
            );
        }

        return mcpHandler.fetch(request, {
            authInfo: {
                token,
                clientId: "pollinations-api-key",
                scopes: [],
            },
        });
    },
};
