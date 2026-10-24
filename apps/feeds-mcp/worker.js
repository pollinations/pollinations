import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const MAX_SUMMARY = 500;

async function fetchFeed(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
        throw new Error(`Feed returned HTTP ${response.status}.`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (/^image\/|^application\/pdf/.test(contentType.split(";")[0])) {
        throw new Error(
            `${contentType.split(";")[0]} is not an RSS or Atom feed.`,
        );
    }
    return response.text();
}

const NAMED_ENTITIES = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    mdash: "\u2014",
    ndash: "\u2013",
    hellip: "\u2026",
    lsquo: "\u2018",
    rsquo: "\u2019",
    ldquo: "\u201c",
    rdquo: "\u201d",
};

// ponytail: single-pass entity decode plus the same regex tag strip the
// dictionary and arXiv servers use, so feeds that embed HTML summaries only
// lose fidelity, never correctness. Upgrade path: a real XML parser if a
// feed's shape actually defeats the regexes.
function decodeEntities(value) {
    return value.replace(
        /&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi,
        (entity, hex, code, name) => {
            if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
            if (code) return String.fromCodePoint(Number(code));
            return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
        },
    );
}

function decodeXml(value) {
    return decodeEntities(
        value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"),
    ).replace(/\s+/g, " ");
}

function extractText(html) {
    return html
        .replace(/<\/?[a-zA-Z][^>]*>/g, " ")
        .replace(/\s+([,.;:!?])/g, "$1")
        .replace(/\s+/g, " ")
        .trim();
}

function tagText(block, tag) {
    const match = block.match(
        new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"),
    );
    return match ? decodeXml(match[1]).trim() : undefined;
}

function atomLink(block) {
    for (const [, source] of block.matchAll(/<link\s([^>]*?)\/?>/g)) {
        const attrs = Object.fromEntries(
            [...source.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, n, v]) => [
                n,
                decodeEntities(v),
            ]),
        );
        if (!attrs.rel || attrs.rel === "alternate") {
            return attrs.href;
        }
    }
    return undefined;
}

function truncate(value, max) {
    if (value === undefined) return undefined;
    return value.length > max
        ? { summary: value.slice(0, max), truncated: true }
        : { summary: value, truncated: false };
}

function parseRss(xml) {
    const channel = xml.slice(0, xml.indexOf("<item>"));
    const entries = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(
        ([, item]) => ({
            title: tagText(item, "title"),
            link: tagText(item, "link"),
            published: tagText(item, "pubDate"),
            summary: tagText(item, "description"),
        }),
    );
    return {
        type: "rss",
        feed: {
            title: tagText(channel, "title"),
            link: tagText(channel, "link"),
            description: tagText(channel, "description"),
        },
        entries,
    };
}

function parseAtom(xml) {
    const header = xml.slice(0, xml.indexOf("<entry"));
    const entries = [
        ...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi),
    ].map(([, entry]) => ({
        title: tagText(entry, "title"),
        link: atomLink(entry),
        published: tagText(entry, "updated") ?? tagText(entry, "published"),
        summary: tagText(entry, "summary") ?? tagText(entry, "content"),
    }));
    return {
        type: "atom",
        feed: {
            title: tagText(header, "title"),
            link: atomLink(header),
            description: tagText(header, "subtitle"),
        },
        entries,
    };
}

function parseFeed(xml) {
    const trimmed = xml.trim();
    if (/<(?:rss:rdf|rdf:rdf)\b/i.test(trimmed) || /<rss[\s>]/i.test(trimmed)) {
        return parseRss(trimmed);
    }
    if (/<feed[\s>]/i.test(trimmed)) {
        return parseAtom(trimmed);
    }
    throw new Error("The response is not an RSS or Atom feed.");
}

const readSchema = z.object({
    url: z
        .string()
        .trim()
        .min(1)
        .max(2048)
        .refine((value) => {
            try {
                return ["http:", "https:"].includes(new URL(value).protocol);
            } catch {
                return false;
            }
        }, "Enter an http(s) feed URL.")
        .describe("RSS or Atom feed URL, e.g. `https://example.com/feed.xml`."),
    limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe("How many entries to return, 1-50. Defaults to 10."),
});

function buildServer() {
    const server = new McpServer(
        { name: "feeds-mcp", title: "Feeds MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "feed_read",
        {
            description:
                "Read an RSS or Atom feed and return its title, link and the " +
                "latest entries with title, link, date and a plain-text " +
                "summary. The URL is fetched without caller credentials.",
            inputSchema: readSchema,
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: true,
            },
        },
        async ({ url, limit }) => {
            const parsed = parseFeed(await fetchFeed(url));
            const entries = parsed.entries.slice(0, limit).map((entry) => {
                const summary = truncate(
                    extractText(entry.summary ?? ""),
                    MAX_SUMMARY,
                );
                return {
                    title: entry.title,
                    link: entry.link,
                    published: entry.published,
                    summary: summary?.summary,
                    truncated: summary?.truncated,
                };
            });
            return createMCPResponse([
                createTextContent({ ...parsed, entries }, true),
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
                name: "feeds-mcp",
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
                            'Bearer realm="feeds-mcp.pollinations.ai"',
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
