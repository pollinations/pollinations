import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const GDELT_API_URL = "https://api.gdeltproject.org/api/v2/doc/doc";

async function searchNews({ query, timespan, maxrecords }) {
    const params = new URLSearchParams({
        query,
        mode: "artlist",
        maxrecords: String(maxrecords),
        format: "json",
        sort: "datedesc",
    });
    if (timespan) {
        params.set("timespan", timespan);
    }
    const response = await fetch(`${GDELT_API_URL}?${params}`, {
        signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
        throw new Error(
            response.status === 429
                ? "GDELT is rate limiting this client (one search per 5 seconds); retry in a few seconds."
                : `GDELT returned HTTP ${response.status}.`,
        );
    }
    const body = await response.text();
    let payload;
    try {
        payload = JSON.parse(body);
    } catch {
        // GDELT answers non-JSON when a client queries more than once per
        // 5 seconds; surface that instead of a parse error.
        throw new Error(
            "GDELT is rate limiting this client (one search per 5 seconds); retry in a few seconds.",
        );
    }
    const articles = (payload.articles ?? []).map((article) => ({
        url: article.url,
        title: article.title,
        seen: article.seendate,
        domain: article.domain,
        language: article.language,
        country: article.sourcecountry,
    }));
    return { query, articles };
}

const searchSchema = z.object({
    query: z
        .string()
        .trim()
        .min(2)
        .max(500)
        .describe(
            "Search words. GDELT operators narrow it: phrases in quotes, " +
                "sourcelang:eng, sourcecountry:us, domain:reuters.com, and " +
                'AND/OR/NOT between terms, e.g. `"solar farm" sourcelang:eng`.',
        ),
    timespan: z
        .string()
        .trim()
        .regex(
            /^\d+(min|h|d|w|m)$/,
            "Use a GDELT timespan like 30min, 12h, 7d, 3w or 6m.",
        )
        .optional()
        .describe(
            "How far back to search: 30min, 12h, 7d, 3w or 6m. Defaults to GDELT's 3 months.",
        ),
    maxrecords: z
        .number()
        .int()
        .min(1)
        .max(75)
        .default(20)
        .describe("How many articles to return, 1-75. Defaults to 20."),
});

function buildServer() {
    const server = new McpServer(
        { name: "news-mcp", title: "News MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "news_search",
        {
            description:
                "Search worldwide news through GDELT and return the newest " +
                "matching articles with title, URL, publish time, domain, " +
                "language and country. Queries are sent to GDELT without " +
                "caller credentials.",
            inputSchema: searchSchema,
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: true,
            },
        },
        async (args) =>
            createMCPResponse([
                createTextContent(await searchNews(args), true),
            ]),
    );
    return server;
}

const mcpHandler = createMcpHandler(() => buildServer(), {
    legacy: "stateless",
    onerror: (error) => console.error(error),
});

function readBearerToken(request) {
    return (
        request.headers
            .get("authorization")
            ?.trim()
            .match(/^Bearer\s+(\S+)$/i)?.[1] ?? null
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "news-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }

        if (url.pathname !== "/") {
            return new Response("Not found", { status: 404 });
        }

        const token = readBearerToken(request);
        if (!token) {
            return Response.json(
                {
                    error: "unauthorized",
                    message: "Send a Pollinations API key as a bearer token.",
                },
                {
                    status: 401,
                    headers: {
                        "WWW-Authenticate":
                            'Bearer realm="news-mcp.pollinations.ai"',
                    },
                },
            );
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

        return mcpHandler.fetch(request, {
            authInfo: {
                token,
                clientId: "pollinations-api-key",
                scopes: [],
            },
        });
    },
};
