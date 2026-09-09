import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMcpUsageHeaders } from "../../shared/mcp-usage.ts";

const EXA_API_URL = "https://api.exa.ai";

class ExaFailure extends Error {
    constructor(status, message, cost = 0) {
        super(message);
        this.status = status;
        this.cost = cost;
    }
}

async function callExa(path, payload, env, fetchImpl) {
    if (!env.EXA_API_KEY) {
        throw new ExaFailure(500, "Exa API key is not configured");
    }
    const response = await fetchImpl(`${EXA_API_URL}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": env.EXA_API_KEY,
        },
        body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => null);
    const cost = body?.costDollars?.total;
    if (!response.ok) {
        throw new ExaFailure(
            response.status >= 500 ? 502 : response.status,
            body?.error ||
                body?.message ||
                `Exa returned HTTP ${response.status}`,
            Number.isFinite(cost) ? cost : 0,
        );
    }
    if (!Number.isFinite(cost) || cost < 0) {
        throw new ExaFailure(502, "Exa response is missing usage cost");
    }
    return { body, cost };
}

function formatSearchResults(results) {
    if (!Array.isArray(results) || results.length === 0) {
        return "No search results found.";
    }
    return results
        .map((result) => {
            const lines = [
                `Title: ${result.title || "Untitled"}`,
                `URL: ${result.url}`,
            ];
            if (result.publishedDate) {
                lines.push(`Published: ${result.publishedDate}`);
            }
            if (result.author) lines.push(`Author: ${result.author}`);
            if (Array.isArray(result.highlights) && result.highlights.length) {
                lines.push(`Highlights:\n${result.highlights.join("\n")}`);
            }
            return lines.join("\n");
        })
        .join("\n\n---\n\n");
}

function formatFetchedPages(body) {
    const pages = Array.isArray(body?.results) ? body.results : [];
    const errors = Array.isArray(body?.statuses)
        ? body.statuses.filter(({ status }) => status === "error")
        : [];
    const sections = pages.map((page) => {
        const lines = [`# ${page.title || "Untitled"}`, `URL: ${page.url}`];
        if (page.text) lines.push("", page.text);
        return lines.join("\n");
    });
    for (const error of errors) {
        sections.push(
            `Could not fetch ${error.id}: ${error.error?.tag || "unknown error"}`,
        );
    }
    return sections.join("\n\n---\n\n") || "No content found.";
}

function textResult(text) {
    return { content: [{ type: "text", text }] };
}

async function runWithUsage(reportUsage, tool, adjustmentId, units, run) {
    try {
        const { cost, result } = await run();
        reportUsage({
            cost,
            tool,
            status: 200,
            adjustmentId,
            adjustmentUnits: units,
        });
        return result;
    } catch (error) {
        const failure =
            error instanceof ExaFailure
                ? error
                : new ExaFailure(502, "Exa request failed");
        reportUsage({
            cost: failure.cost,
            tool,
            status: failure.status,
            adjustmentId,
            adjustmentUnits: units,
            error: failure.message,
        });
        throw failure;
    }
}

function buildServer(env, fetchImpl, reportUsage) {
    const server = new McpServer(
        { name: "pollinations-exa-mcp", version: "0.1.0" },
        {
            instructions:
                "Search the live web with Exa, then fetch full pages when search highlights are not enough.",
            capabilities: { tools: {} },
        },
    );

    server.registerTool(
        "web_search_exa",
        {
            description:
                "Search the live web for current information and return relevant pages with highlights.",
            inputSchema: z.object({
                query: z.string().min(1),
                numResults: z.number().int().min(1).max(10).optional(),
            }),
        },
        (params) =>
            runWithUsage(
                reportUsage,
                "web_search_exa",
                "exa.search.v1",
                1,
                async () => {
                    const { body, cost } = await callExa(
                        "/search",
                        {
                            query: params.query,
                            type: "auto",
                            numResults: params.numResults ?? 10,
                            contents: { highlights: true },
                        },
                        env,
                        fetchImpl,
                    );
                    return {
                        cost,
                        result: textResult(formatSearchResults(body.results)),
                    };
                },
            ),
    );

    server.registerTool(
        "web_fetch_exa",
        {
            description:
                "Read one or more known webpages as clean text. Use after search when highlights are insufficient.",
            inputSchema: z.object({
                urls: z.array(z.url()).min(1),
                maxCharacters: z.number().int().positive().optional(),
            }),
        },
        (params) =>
            runWithUsage(
                reportUsage,
                "web_fetch_exa",
                "exa.contents.text.v1",
                params.urls.length,
                async () => {
                    const { body, cost } = await callExa(
                        "/contents",
                        {
                            urls: params.urls,
                            text: {
                                maxCharacters: params.maxCharacters ?? 3000,
                            },
                        },
                        env,
                        fetchImpl,
                    );
                    return {
                        cost,
                        result: textResult(formatFetchedPages(body)),
                    };
                },
            ),
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
