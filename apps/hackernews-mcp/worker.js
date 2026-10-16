import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

const USER_AGENT = "hackernews-mcp/0.1 (https://pollinations.ai)";
const FIREBASE = "https://hacker-news.firebaseio.com/v0";
const ALGOLIA = "https://hn.algolia.com/api/v1";
const LISTS = {
    top: "topstories",
    new: "newstories",
    best: "beststories",
    ask: "askstories",
    show: "showstories",
    job: "jobstories",
};
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

async function getJson(url) {
    const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!response.ok) {
        throw new Error(`Hacker News answered ${response.status}`);
    }
    return response.json();
}

/** Firebase answers 200 with null or `deleted`/`dead` flags for removed items. */
async function liveItem(id) {
    const item = await getJson(`${FIREBASE}/item/${id}.json`);
    return item && !item.deleted && !item.dead ? item : null;
}

const asText = (value) => ({
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
});

const failure = (message) => ({
    isError: true,
    content: [{ type: "text", text: message }],
});

/** HN comment HTML to plain text: paragraphs become blank lines, links keep their URL. */
const htmlToText = (html = "") =>
    html
        .replace(/<a [^>]*href="([^"]*)"[^>]*>.*?<\/a>/gi, "$1")
        .replace(/<p>/gi, "\n\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(
            /&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi,
            (whole, hex, dec, name) => {
                const code = hex ? Number.parseInt(hex, 16) : Number(dec);
                if (name) return ENTITIES[name.toLowerCase()] ?? whole;
                return code <= 0x10ffff ? String.fromCodePoint(code) : whole;
            },
        )
        .trim();

const discussionUrl = (id) => `https://news.ycombinator.com/item?id=${id}`;
const isoTime = (seconds) => new Date(seconds * 1000).toISOString();

const summary = (item) => ({
    id: item.id,
    title: item.title,
    url: item.url ?? null,
    score: item.score,
    by: item.by,
    time: isoTime(item.time),
    comments: item.descendants ?? 0,
    discussion: discussionUrl(item.id),
});

function buildServer() {
    const server = new McpServer(
        { name: "hackernews-mcp", title: "Hacker News MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "hn_stories",
        {
            description:
                "List current Hacker News stories (top, new, best, ask, show or job). Returns id, title, url, score, author, time, comment count and the discussion URL; read comments with hn_item.",
            inputSchema: z.object({
                list: z.enum(Object.keys(LISTS)).default("top"),
                limit: z.number().int().min(1).max(30).default(10),
            }),
        },
        async ({ list, limit }) => {
            const ids = await getJson(`${FIREBASE}/${LISTS[list]}.json`);
            const items = await Promise.all(ids.slice(0, limit).map(liveItem));
            return asText(items.filter(Boolean).map(summary));
        },
    );

    server.registerTool(
        "hn_item",
        {
            description:
                "Read one Hacker News item (story, comment, job or poll) by id, with its first top-level comments as plain text.",
            inputSchema: z.object({
                id: z.number().int().positive(),
                comments: z.number().int().min(0).max(20).default(5),
            }),
        },
        async ({ id, comments }) => {
            const item = await liveItem(id);
            if (!item) return failure(`No Hacker News item ${id}.`);
            const replies = await Promise.all(
                (item.kids ?? []).slice(0, comments).map(liveItem),
            );
            return asText({
                id: item.id,
                type: item.type,
                title: item.title,
                url: item.url ?? null,
                text: htmlToText(item.text),
                score: item.score,
                by: item.by,
                time: isoTime(item.time),
                totalComments: item.descendants ?? 0,
                discussion: discussionUrl(item.id),
                comments: replies.filter(Boolean).map((reply) => ({
                    id: reply.id,
                    by: reply.by,
                    time: isoTime(reply.time),
                    text: htmlToText(reply.text),
                })),
            });
        },
    );

    server.registerTool(
        "hn_search",
        {
            description:
                "Search Hacker News stories and comments via Algolia, by relevance or newest first. Optionally restrict to story, comment, ask_hn or show_hn.",
            inputSchema: z.object({
                query: z.string().min(1).max(300),
                sort: z.enum(["relevance", "date"]).default("relevance"),
                tags: z
                    .enum(["story", "comment", "ask_hn", "show_hn"])
                    .optional(),
                limit: z.number().int().min(1).max(20).default(10),
            }),
        },
        async ({ query, sort, tags, limit }) => {
            const params = new URLSearchParams({
                query,
                hitsPerPage: limit,
                ...(tags && { tags }),
            });
            const endpoint = sort === "date" ? "search_by_date" : "search";
            const found = await getJson(`${ALGOLIA}/${endpoint}?${params}`);
            return asText(
                found.hits.map((hit) => ({
                    id: Number(hit.objectID),
                    type: hit._tags.includes("comment") ? "comment" : "story",
                    title: hit.title ?? hit.story_title ?? null,
                    url: hit.url ?? null,
                    text: htmlToText(hit.comment_text ?? hit.story_text),
                    score: hit.points,
                    by: hit.author,
                    time: hit.created_at,
                    comments: hit.num_comments ?? 0,
                    discussion: discussionUrl(hit.objectID),
                })),
            );
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
                name: "hackernews-mcp",
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
                            'Bearer realm="hackernews-mcp.pollinations.ai"',
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
