import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMcpUsageHeaders } from "../../shared/mcp-usage.ts";
import {
    OREOLOOK_CRAWL_PRICE_PER_PAGE,
    OREOLOOK_RESEARCH_PRICE_PER_REQUEST,
    OREOLOOK_SCRAPE_PRICE_PER_PAGE,
    OREOLOOK_SEARCH_PRICE_PER_REQUEST,
} from "../../shared/registry/mcp.ts";

const RATES = {
    search: {
        id: "oreolook.search.v1",
        price: OREOLOOK_SEARCH_PRICE_PER_REQUEST,
    },
    scrape: {
        id: "oreolook.scrape.v1",
        price: OREOLOOK_SCRAPE_PRICE_PER_PAGE,
    },
    crawl: {
        id: "oreolook.crawl.page.v1",
        price: OREOLOOK_CRAWL_PRICE_PER_PAGE,
    },
    research: {
        id: "oreolook.research.v1",
        price: OREOLOOK_RESEARCH_PRICE_PER_REQUEST,
    },
};

const FORMATS = z
    .array(z.enum(["markdown", "html", "rawHtml", "links", "screenshot"]))
    .min(1)
    .optional();

class OreoLookFailure extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

async function callOreoLook(method, path, payload, env, fetchImpl) {
    if (!env.OREOLOOK_API_URL || !env.OREOLOOK_API_KEY) {
        throw new OreoLookFailure(500, "OreoLook API is not configured");
    }
    const response = await fetchImpl(
        `${env.OREOLOOK_API_URL.replace(/\/+$/, "")}${path}`,
        {
            method,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${env.OREOLOOK_API_KEY}`,
            },
            body: payload === undefined ? undefined : JSON.stringify(payload),
        },
    );
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.success === false) {
        throw new OreoLookFailure(
            !response.ok && response.status < 500 ? response.status : 502,
            body?.error?.message ||
                body?.error ||
                `OreoLook returned HTTP ${response.status}`,
        );
    }
    return body;
}

function formatPage(page) {
    const meta = page?.metadata ?? {};
    const lines = [
        `# ${meta.title || page?.title || "Untitled"}`,
        `URL: ${meta.sourceURL || meta.url || page?.url || "unknown"}`,
    ];
    if (page?.description) lines.push(page.description);
    if (page?.markdown) lines.push("", page.markdown);
    if (page?.html) lines.push("", page.html);
    if (page?.rawHtml) lines.push("", page.rawHtml);
    if (Array.isArray(page?.links) && page.links.length) {
        lines.push("", `Links:\n${page.links.join("\n")}`);
    }
    if (page?.screenshot) lines.push("", `Screenshot: ${page.screenshot}`);
    if (page?.json) lines.push("", JSON.stringify(page.json, null, 2));
    return lines.join("\n");
}

function formatPages(pages, empty) {
    return Array.isArray(pages) && pages.length
        ? pages.map(formatPage).join("\n\n---\n\n")
        : empty;
}

function textResult(text) {
    return { content: [{ type: "text", text }] };
}

async function runWithUsage(reportUsage, tool, rate, units, run) {
    try {
        const result = await run();
        if (rate) {
            reportUsage({
                cost: units * rate.price,
                tool,
                status: 200,
                adjustmentId: rate.id,
                adjustmentUnits: units,
            });
        }
        return result;
    } catch (error) {
        const failure =
            error instanceof OreoLookFailure
                ? error
                : new OreoLookFailure(502, "OreoLook request failed");
        if (rate) {
            reportUsage({
                cost: 0,
                tool,
                status: failure.status,
                adjustmentId: rate.id,
                adjustmentUnits: units,
                error: failure.message,
            });
        }
        throw failure;
    }
}

function buildServer(env, fetchImpl, reportUsage) {
    const server = new McpServer(
        { name: "pollinations-oreolook-mcp", version: "0.1.0" },
        {
            instructions:
                "Use oreolook_search for quick web results, oreolook_scrape to read known pages, oreolook_map and oreolook_crawl to cover a whole site, oreolook_extract for structured data, and oreolook_research for a cited, multi-source answer to an open question.",
            capabilities: { tools: {} },
        },
    );
    const call = (method, path, payload) =>
        callOreoLook(method, path, payload, env, fetchImpl);
    const tool = (name, description, inputSchema, rate, units, run) =>
        server.registerTool(name, { description, inputSchema }, (params) =>
            runWithUsage(reportUsage, name, rate, units(params), async () =>
                textResult(await run(params)),
            ),
        );

    tool(
        "oreolook_search",
        "Search the live web. Returns titles, URLs and snippets; set formats to also scrape each result's content.",
        z.object({
            query: z.string().min(1),
            limit: z.number().int().min(1).max(20).optional(),
            formats: FORMATS,
        }),
        RATES.search,
        () => 1,
        async ({ query, limit, formats }) => {
            const body = await call("POST", "/v1/search", {
                query,
                limit: limit ?? 5,
                ...(formats && { scrapeOptions: { formats } }),
            });
            return formatPages(body.data, "No search results found.");
        },
    );

    tool(
        "oreolook_scrape",
        "Read one known URL as clean markdown (main content only by default). Optionally return html, links or a screenshot.",
        z.object({
            url: z.url(),
            formats: FORMATS,
            onlyMainContent: z.boolean().optional(),
            waitFor: z.number().int().min(0).max(30000).optional(),
        }),
        RATES.scrape,
        () => 1,
        async ({ url, formats, onlyMainContent, waitFor }) => {
            const body = await call("POST", "/v1/scrape", {
                url,
                formats: formats ?? ["markdown"],
                onlyMainContent: onlyMainContent ?? true,
                ...(waitFor !== undefined && { waitFor }),
            });
            return formatPage(body.data);
        },
    );

    tool(
        "oreolook_map",
        "List the URLs of a website without reading them. Use search to filter by topic, then scrape or crawl the pages you need.",
        z.object({
            url: z.url(),
            search: z.string().min(1).optional(),
            limit: z.number().int().min(1).max(5000).optional(),
            includeSubdomains: z.boolean().optional(),
        }),
        RATES.search,
        () => 1,
        async (params) => {
            const body = await call("POST", "/v1/map", params);
            const links = Array.isArray(body.links) ? body.links : [];
            return (
                links
                    .map((link) =>
                        typeof link === "string"
                            ? link
                            : [link.url, link.title]
                                  .filter(Boolean)
                                  .join(" - "),
                    )
                    .join("\n") || "No URLs found."
            );
        },
    );

    tool(
        "oreolook_crawl",
        "Start an asynchronous crawl of a website and return a job id. Poll oreolook_crawl_status with the id for results. Billed per page of the requested limit (default 20).",
        z.object({
            url: z.url(),
            limit: z.number().int().min(1).max(500).optional(),
            maxDepth: z.number().int().min(1).max(10).optional(),
            includePaths: z.array(z.string()).optional(),
            excludePaths: z.array(z.string()).optional(),
        }),
        RATES.crawl,
        ({ limit }) => limit ?? 20,
        async (params) => {
            const body = await call("POST", "/v1/crawl", {
                ...params,
                limit: params.limit ?? 20,
            });
            return `Crawl started. Job id: ${body.id}\nCall oreolook_crawl_status with this id to get the pages.`;
        },
    );

    tool(
        "oreolook_crawl_status",
        "Get the status and scraped pages of a crawl started with oreolook_crawl. Free to call.",
        z.object({ id: z.string().min(1) }),
        null,
        () => 0,
        async ({ id }) => {
            const body = await call(
                "GET",
                `/v1/crawl/${encodeURIComponent(id)}`,
            );
            return `Status: ${body.status} (${body.completed ?? 0}/${body.total ?? 0} pages)\n\n${formatPages(body.data, "No pages yet.")}`;
        },
    );

    tool(
        "oreolook_extract",
        "Extract structured data from up to 10 URLs. Describe what to extract in prompt and/or give a JSON schema.",
        z.object({
            urls: z.array(z.url()).min(1).max(10),
            prompt: z.string().min(1).optional(),
            schema: z.record(z.string(), z.unknown()).optional(),
        }),
        RATES.scrape,
        ({ urls }) => urls.length,
        async (params) => {
            const body = await call("POST", "/v1/extract", params);
            return JSON.stringify(body.data ?? {}, null, 2);
        },
    );

    tool(
        "oreolook_research",
        "Deep research: OreoLook plans queries, searches and reads many sources, and returns a synthesized answer with cited sources. Slower than search; use it for open questions that need several sources.",
        z.object({ question: z.string().min(1) }),
        RATES.research,
        () => 1,
        async ({ question }) => {
            const body = await call("POST", "/v1/chat/completions", {
                model: "oreolook",
                stream: false,
                messages: [{ role: "user", content: question }],
            });
            const content = body?.choices?.[0]?.message?.content;
            if (typeof content !== "string" || !content) {
                throw new OreoLookFailure(
                    502,
                    "OreoLook research returned no answer",
                );
            }
            return content;
        },
    );
    return server;
}

export function createWorker({ fetchImpl }) {
    return {
        async fetch(request, env) {
            if (new URL(request.url).pathname !== "/") {
                return new Response("Not found", { status: 404 });
            }
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

            let usage;
            const handler = createMcpHandler(
                () =>
                    buildServer(env, fetchImpl, (reportedUsage) => {
                        usage = reportedUsage;
                    }),
                { onerror: (error) => console.error(error) },
            );
            const response = await handler.fetch(request);
            const body = await response.arrayBuffer();
            return withMcpUsageHeaders(new Response(body, response), usage);
        },
    };
}
