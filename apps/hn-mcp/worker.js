import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const HN_API_BASE = "https://hn.algolia.com/api/v1";
const HN_ITEM_URL = "https://news.ycombinator.com/item?id=";

// The HN Algolia API needs no key, so the caller's Pollinations key is never forwarded.
async function fetchJson(url) {
    const response = await fetch(url, {
        headers: { accept: "application/json" },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body === null) {
        throw new Error(
            `Hacker News request failed with status ${response.status}`,
        );
    }
    return body;
}

function stripHtml(html) {
    return html
        .replace(/<p>/g, "\n\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&gt;/g, ">")
        .replace(/&lt;/g, "<")
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, "&")
        .trim();
}

function mapHit(hit) {
    const item = {
        id: Number(hit.objectID),
        title: hit.title ?? hit.story_title ?? null,
        author: hit.author,
        created_at: hit.created_at,
        hn: `${HN_ITEM_URL}${hit.objectID}`,
    };
    if (hit.url) item.url = hit.url;
    if (hit.points != null) item.points = hit.points;
    if (hit.num_comments != null) item.comments = hit.num_comments;
    if (hit.comment_text) item.text = stripHtml(hit.comment_text);
    return item;
}

function buildServer() {
    const server = new McpServer(
        { name: "hn-mcp", title: "Hacker News MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "hn_search",
        {
            description:
                "Search Hacker News stories and comments by keyword. " +
                "Returns matching items with points, comment counts and links.",
            inputSchema: {
                query: z.string().min(1).describe("Search terms"),
                tags: z
                    .string()
                    .optional()
                    .describe(
                        "Algolia tags filter: 'story' (default), 'comment', 'poll', 'show_hn', 'ask_hn', or 'author_<username>'",
                    ),
                sort: z
                    .enum(["relevance", "date"])
                    .optional()
                    .describe(
                        "Sort by relevance (default) or by most recent first",
                    ),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(30)
                    .optional()
                    .describe("Maximum hits to return, 1-30 (default 10)"),
            },
        },
        async ({ query, tags, sort, limit }) => {
            const url = new URL(
                `${HN_API_BASE}/search${sort === "date" ? "_by_date" : ""}`,
            );
            url.searchParams.set("query", query);
            url.searchParams.set("tags", tags ?? "story");
            url.searchParams.set("hitsPerPage", String(limit ?? 10));
            const body = await fetchJson(url);
            return createMCPResponse([
                createTextContent(
                    JSON.stringify(
                        {
                            total_hits: body.nbHits,
                            hits: (body.hits ?? []).map(mapHit),
                        },
                        null,
                        2,
                    ),
                ),
            ]);
        },
    );
    server.registerTool(
        "hn_front_page",
        {
            description:
                "Read the current Hacker News front page: the top-ranked " +
                "stories right now, with points and comment counts.",
            inputSchema: {
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(30)
                    .optional()
                    .describe("Maximum stories to return, 1-30 (default 10)"),
            },
        },
        async ({ limit }) => {
            const url = new URL(`${HN_API_BASE}/search`);
            url.searchParams.set("tags", "front_page");
            url.searchParams.set("hitsPerPage", String(limit ?? 10));
            const body = await fetchJson(url);
            return createMCPResponse([
                createTextContent(
                    JSON.stringify((body.hits ?? []).map(mapHit), null, 2),
                ),
            ]);
        },
    );
    server.registerTool(
        "hn_item",
        {
            description:
                "Open one Hacker News item by id: the story or comment plus " +
                "its top-level replies. Use ids from hn_search or hn_front_page.",
            inputSchema: {
                id: z.number().int().positive().describe("Hacker News item id"),
                comment_limit: z
                    .number()
                    .int()
                    .min(0)
                    .max(20)
                    .optional()
                    .describe(
                        "Top-level comments to include, 0-20 (default 5)",
                    ),
            },
        },
        async ({ id, comment_limit }) => {
            const body = await fetchJson(`${HN_API_BASE}/items/${id}`);
            const item = {
                id: body.id,
                type: body.type,
                title: body.title ?? null,
                author: body.author,
                created_at: body.created_at,
                hn: `${HN_ITEM_URL}${body.id}`,
            };
            if (body.url) item.url = body.url;
            if (body.points != null) item.points = body.points;
            if (body.text) item.text = stripHtml(body.text);
            item.comments = (body.children ?? [])
                .slice(0, comment_limit ?? 5)
                .map((child) => ({
                    id: child.id,
                    author: child.author,
                    created_at: child.created_at,
                    text: stripHtml(child.text ?? ""),
                    replies: (child.children ?? []).length,
                    hn: `${HN_ITEM_URL}${child.id}`,
                }));
            return createMCPResponse([
                createTextContent(JSON.stringify(item, null, 2)),
            ]);
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
                "WWW-Authenticate": 'Bearer realm="hn-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "hn-mcp",
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
