import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const SERVER_NAME = "sec-edgar-mcp";
const FULL_TEXT_SEARCH = "https://efts.sec.gov/LATEST/search-index";
const TICKER_MAP = "https://www.sec.gov/files/company_tickers.json";
const COMPANY_CONCEPT = "https://data.sec.gov/api/xbrl/companyconcept";
const REQUEST_TIMEOUT_MS = 15_000;
const TICKER_CACHE_MS = 60 * 60 * 1000;
// SEC asks every client to identify itself and to stay under 10 requests per
// second. The caller's Pollinations key is never forwarded upstream.
const UPSTREAM_HEADERS = {
    Accept: "application/json",
    "User-Agent": `pollinations-${SERVER_NAME} (https://pollinations.ai)`,
};

const DEFAULT_CONCEPTS = ["Revenues", "NetIncomeLoss", "Assets"];

let tickerCache = null;
let tickerCacheAt = 0;

export function resetTickerCache() {
    tickerCache = null;
    tickerCacheAt = 0;
}

function textResult(value) {
    return {
        content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    };
}

async function fetchJson(url, label) {
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

async function loadTickers() {
    if (tickerCache && Date.now() - tickerCacheAt < TICKER_CACHE_MS) {
        return tickerCache;
    }
    const data = await fetchJson(TICKER_MAP, "SEC ticker list");
    tickerCache = Object.values(data);
    tickerCacheAt = Date.now();
    return tickerCache;
}

function padCik(value) {
    return String(value).replace(/\D/g, "").padStart(10, "0").slice(-10);
}

async function resolveCompany(company) {
    if (/^\d{1,10}$/.test(company.trim())) {
        return { cik: padCik(company), ticker: null, name: null };
    }
    const tickers = await loadTickers();
    const needle = company.trim().toUpperCase();
    const matches = tickers.filter(
        (row) =>
            row.ticker?.toUpperCase() === needle ||
            row.title?.toUpperCase().includes(needle),
    );
    const row =
        matches.find(
            (candidate) => candidate.ticker?.toUpperCase() === needle,
        ) ?? matches[0];
    if (!row) {
        throw new Error(
            `No SEC filer matches "${company}". Use find_company to resolve a ticker or CIK.`,
        );
    }
    return {
        cik: padCik(row.cik_str),
        ticker: row.ticker ?? null,
        name: row.title ?? null,
    };
}

function filingUrl(source, id) {
    const [accession, file] = String(id ?? "").split(":");
    const cik = String(source?.ciks?.[0] ?? "").replace(/^0+/, "");
    if (!accession || !file || !cik) return null;
    return `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replace(/-/g, "")}/${file}`;
}

function latestValues(unit, limit) {
    return [...unit]
        .sort((a, b) =>
            String(b.filed ?? "").localeCompare(String(a.filed ?? "")),
        )
        .filter(
            (value, index, all) =>
                all.findIndex(
                    (other) =>
                        other.end === value.end &&
                        other.form === value.form &&
                        other.filed === value.filed,
                ) === index,
        )
        .slice(0, limit)
        .map((value) => ({
            end: value.end ?? null,
            value: value.val ?? null,
            fy: value.fy ?? null,
            fp: value.fp ?? null,
            form: value.form ?? null,
            filed: value.filed ?? null,
            frame: value.frame ?? null,
        }));
}

function buildServer() {
    const server = new McpServer(
        { name: SERVER_NAME, title: "SEC EDGAR", version: "0.1.0" },
        {
            instructions:
                "Research US public companies through SEC EDGAR. Use find_company to turn a ticker or name into a CIK, search_filings for full-text search across filings, and company_concepts for reported financial values from XBRL. Guidance is not investment advice; always cite the filing URL.",
            capabilities: { tools: {} },
        },
    );

    server.registerTool(
        "find_company",
        {
            title: "Find company",
            description:
                "Resolve a ticker or company name to a SEC CIK. Returns matching tickers, names, and CIKs for use with the other tools.",
            inputSchema: z.object({
                query: z
                    .string()
                    .min(1)
                    .max(100)
                    .describe("Ticker such as AAPL or part of a company name."),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(25)
                    .default(10)
                    .describe("Maximum number of matches."),
            }),
        },
        async ({ query, limit }) => {
            const tickers = await loadTickers();
            const needle = query.trim().toUpperCase();
            const matches = tickers
                .filter(
                    (row) =>
                        row.ticker?.toUpperCase() === needle ||
                        row.ticker?.toUpperCase().startsWith(needle) ||
                        row.title?.toUpperCase().includes(needle),
                )
                .sort((a, b) => {
                    const exactA = a.ticker?.toUpperCase() === needle ? 0 : 1;
                    const exactB = b.ticker?.toUpperCase() === needle ? 0 : 1;
                    return (
                        exactA - exactB ||
                        String(a.ticker).localeCompare(String(b.ticker))
                    );
                })
                .slice(0, limit)
                .map((row) => ({
                    ticker: row.ticker ?? null,
                    name: row.title ?? null,
                    cik: padCik(row.cik_str),
                }));
            return textResult({ query, matches });
        },
    );

    server.registerTool(
        "search_filings",
        {
            title: "Search filings",
            description:
                "Full-text search SEC filings by phrase, form type, and date range. Returns company names, form types, filing dates, and links to the documents on sec.gov.",
            inputSchema: z.object({
                query: z
                    .string()
                    .min(1)
                    .max(300)
                    .describe(
                        'Words or phrases to find, for example "supply chain" or "material weakness".',
                    ),
                forms: z
                    .array(z.string().min(1).max(12))
                    .min(1)
                    .max(10)
                    .optional()
                    .describe(
                        'Filing forms to include, for example ["10-K", "10-Q"].',
                    ),
                company: z
                    .string()
                    .min(1)
                    .max(100)
                    .optional()
                    .describe("Company name prefix to narrow the search."),
                years: z
                    .number()
                    .int()
                    .min(1)
                    .max(10)
                    .default(3)
                    .describe("How many years back to search from today."),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(50)
                    .default(10)
                    .describe("Maximum number of filings to return."),
            }),
        },
        async ({ query, forms, company, years, limit }) => {
            const end = new Date();
            const start = new Date(end);
            start.setUTCFullYear(end.getUTCFullYear() - years);

            const url = new URL(FULL_TEXT_SEARCH);
            url.search = new URLSearchParams({
                q: query,
                dateRange: "custom",
                startdt: start.toISOString().slice(0, 10),
                enddt: end.toISOString().slice(0, 10),
                ...(forms ? { forms: forms.join(",") } : {}),
                ...(company ? { entityName: company } : {}),
                from: "0",
            }).toString();

            const data = await fetchJson(url, "SEC full-text search");
            const hits = data?.hits?.hits ?? [];
            return textResult({
                query,
                total: data?.hits?.total?.value ?? 0,
                filings: hits.slice(0, limit).map((hit) => ({
                    company: hit._source?.display_names?.[0] ?? null,
                    form: hit._source?.form ?? null,
                    filed_at: hit._source?.file_date ?? null,
                    period_ending: hit._source?.period_ending ?? null,
                    file_type: hit._source?.file_type ?? null,
                    description: hit._source?.file_description ?? null,
                    accession: hit._source?.adsh ?? null,
                    url: filingUrl(hit._source, hit._id),
                })),
            });
        },
    );

    server.registerTool(
        "company_concepts",
        {
            title: "Read company financial concepts",
            description:
                "Read reported XBRL values for US-GAAP concepts of a US public company, such as Revenues, NetIncomeLoss, Assets, or EarningsPerShareDiluted. Returns the most recently filed values with form and fiscal period.",
            inputSchema: z.object({
                company: z
                    .string()
                    .min(1)
                    .max(100)
                    .describe("Ticker (AAPL) or CIK (320193) of the filer."),
                concepts: z
                    .array(z.string().regex(/^[A-Za-z][A-Za-z0-9]{1,100}$/))
                    .min(1)
                    .max(8)
                    .default(DEFAULT_CONCEPTS)
                    .describe(
                        "US-GAAP concept names, for example Revenues or NetIncomeLoss.",
                    ),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(20)
                    .default(4)
                    .describe("Maximum values to return per concept."),
            }),
        },
        async ({ company, concepts, limit }) => {
            const resolved = await resolveCompany(company);

            const results = await Promise.allSettled(
                concepts.map(async (concept) => {
                    const url = `${COMPANY_CONCEPT}/CIK${resolved.cik}/us-gaap/${concept}.json`;
                    const data = await fetchJson(url, `SEC concept ${concept}`);
                    const units = data.units ?? {};
                    const unitName = units.USD
                        ? "USD"
                        : (Object.keys(units)[0] ?? null);
                    return [
                        concept,
                        {
                            label: data.label ?? null,
                            description: data.description ?? null,
                            unit: unitName,
                            values:
                                unitName === null
                                    ? []
                                    : latestValues(units[unitName], limit),
                        },
                    ];
                }),
            );

            const values = {};
            const errors = {};
            results.forEach((result, index) => {
                const concept = concepts[index];
                if (result.status === "fulfilled") {
                    values[concept] = result.value[1];
                } else {
                    errors[concept] = String(
                        result.reason?.message ?? result.reason,
                    );
                }
            });

            return textResult({
                company: {
                    cik: resolved.cik,
                    ticker: resolved.ticker,
                    name: resolved.name,
                },
                concepts: values,
                errors,
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
