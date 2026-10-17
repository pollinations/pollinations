import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

const USER_AGENT = "wikipedia-mcp/0.1 (https://pollinations.ai)";
const FULL_TEXT_LIMIT = 20_000;

const language = z
    .string()
    .regex(/^[a-z]{2,12}(-[a-z]{2,12})?$/)
    .default("en")
    .describe("Wikipedia language edition, e.g. en, de, fr, simple");

async function wikipedia(lang, path) {
    const response = await fetch(`https://${lang}.wikipedia.org${path}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (response.status === 404) return null;
    if (!response.ok) {
        throw new Error(`Wikipedia answered ${response.status}`);
    }
    return response.json();
}

const asText = (value) => ({
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
});

const failure = (message) => ({
    isError: true,
    content: [{ type: "text", text: message }],
});

/** Removes tags until none are left, so nested input such as `<<b>b>` cannot leave one behind. */
function stripTags(text) {
    let previous;
    do {
        previous = text;
        text = text.replace(/<[^>]*>/g, "");
    } while (text !== previous);
    return text;
}

const excerptText = (html) =>
    stripTags(html)
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&");

function buildServer() {
    const server = new McpServer(
        { name: "wikipedia-mcp", title: "Wikipedia MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "wikipedia_search",
        {
            description:
                "Search Wikipedia for pages. Returns title, short description, a text snippet and the page URL; read a page with wikipedia_page.",
            inputSchema: z.object({
                query: z.string().min(1).max(300),
                limit: z.number().int().min(1).max(10).default(5),
                language,
            }),
        },
        async ({ query, limit, language }) => {
            const found = await wikipedia(
                language,
                `/w/rest.php/v1/search/page?${new URLSearchParams({ q: query, limit })}`,
            );
            return asText(
                found.pages.map((page) => ({
                    title: page.title,
                    description: page.description,
                    snippet: excerptText(page.excerpt ?? ""),
                    url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(page.key)}`,
                })),
            );
        },
    );

    server.registerTool(
        "wikipedia_page",
        {
            description:
                "Read a Wikipedia page by title: the summary, or with full=true the whole article as plain text (cut at 20000 characters).",
            inputSchema: z.object({
                title: z.string().min(1).max(300),
                full: z.boolean().default(false),
                language,
            }),
        },
        async ({ title, full, language }) => {
            if (!full) {
                const summary = await wikipedia(
                    language,
                    `/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
                );
                if (!summary)
                    return failure(`No Wikipedia page titled "${title}".`);
                return asText({
                    title: summary.title,
                    description: summary.description,
                    summary: summary.extract,
                    url: summary.content_urls.desktop.page,
                });
            }
            const article = await wikipedia(
                language,
                `/w/api.php?${new URLSearchParams({
                    action: "query",
                    prop: "extracts",
                    explaintext: "1",
                    redirects: "1",
                    format: "json",
                    titles: title,
                })}`,
            );
            const page = Object.values(article.query.pages)[0];
            if (page.missing !== undefined) {
                return failure(`No Wikipedia page titled "${title}".`);
            }
            return asText({
                title: page.title,
                text: page.extract.slice(0, FULL_TEXT_LIMIT),
                truncated: page.extract.length > FULL_TEXT_LIMIT,
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
    const [scheme, token] = (request.headers.get("authorization") ?? "")
        .trim()
        .split(/\s+/, 2);
    return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "wikipedia-mcp",
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
                            'Bearer realm="wikipedia-mcp.pollinations.ai"',
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
