import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const ARXIV_API_URL = "https://export.arxiv.org/api/query";

async function queryArxiv(params) {
    const url = new URL(ARXIV_API_URL);
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    const response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
        throw new Error(`arXiv returned HTTP ${response.status}.`);
    }
    return response.text();
}

// ponytail: reads the Atom shape arXiv has published for years instead of an
// XML dependency, so a feed that changes shape fails loudly below. Upgrade
// path: fast-xml-parser once arXiv's feed actually changes.
function decodeXml(value) {
    return value
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
            String.fromCodePoint(Number.parseInt(hex, 16)),
        )
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");
}

function tagText(block, tag) {
    const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
    return match ? decodeXml(match[1]).trim() : undefined;
}

function tagAttributes(source) {
    return Object.fromEntries(
        [...source.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, name, value]) => [
            name,
            decodeXml(value),
        ]),
    );
}

function parseEntry(entry) {
    const links = [...entry.matchAll(/<link\s([^>]*?)\/?>/g)].map(
        ([, source]) => tagAttributes(source),
    );
    return {
        id: tagText(entry, "id"),
        title: tagText(entry, "title"),
        summary: tagText(entry, "summary"),
        published: tagText(entry, "published"),
        updated: tagText(entry, "updated"),
        authors: [
            ...entry.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/g),
        ].map(([, name]) => decodeXml(name).trim()),
        categories: [...entry.matchAll(/<category\s[^>]*term="([^"]*)"/g)].map(
            ([, term]) => decodeXml(term),
        ),
        primaryCategory: tagAttributes(
            entry.match(/<arxiv:primary_category\s([^>]*?)\/?>/)?.[1] ?? "",
        ).term,
        absUrl: links.find((link) => link.rel === "alternate")?.href,
        pdfUrl: links.find((link) => link.title === "pdf")?.href,
        comment: tagText(entry, "arxiv:comment"),
        doi: tagText(entry, "arxiv:doi"),
        journalRef: tagText(entry, "arxiv:journal_ref"),
    };
}

function parseFeed(xml) {
    if (!xml.includes("<feed")) {
        throw new Error("arXiv returned a response that is not an Atom feed.");
    }
    const total = xml.match(
        /<opensearch:totalResults>([\s\S]*?)<\/opensearch:totalResults>/,
    );
    const totalResults = total ? Number(decodeXml(total[1]).trim()) : undefined;
    const papers = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(
        ([, entry]) => parseEntry(entry),
    );
    return { totalResults, papers };
}

function normalizeIds(value) {
    return value
        .split(",")
        .map((id) =>
            id
                .trim()
                .replace(/^https?:\/\/(?:www\.)?arxiv\.org\/abs\//i, "")
                .replace(/[?#].*$/, ""),
        )
        .filter(Boolean);
}

const searchSchema = z.object({
    query: z
        .string()
        .trim()
        .min(1)
        .max(500)
        .describe(
            "arXiv query. Plain words match every field; use field queries to narrow: " +
                "ti: (title), au: (author), abs: (abstract), cat: (category, e.g. cat:cs.LG), " +
                "joined with AND, OR and ANDNOT, e.g. `ti:transformer AND cat:cs.CL`.",
        ),
    limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(5)
        .describe("How many papers to return, 1-50. Defaults to 5."),
    sortBy: z
        .enum(["relevance", "lastUpdatedDate", "submittedDate"])
        .default("relevance")
        .describe(
            "Sort order: relevance (default), lastUpdatedDate, submittedDate.",
        ),
});

const paperSchema = z.object({
    id: z
        .string()
        .trim()
        .min(1)
        .max(512)
        .describe(
            "arXiv id or abstract URL, e.g. `2401.01234` or " +
                "`https://arxiv.org/abs/2401.01234`. Several ids may be separated by commas.",
        ),
});

function buildServer() {
    const server = new McpServer(
        { name: "arxiv-mcp", title: "arXiv MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "arxiv_search",
        {
            description:
                "Search arXiv for papers and return id, title, authors, abstract, dates, " +
                "categories, and abstract and PDF links. Queries are sent to arXiv without " +
                "caller credentials.",
            inputSchema: searchSchema,
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: true,
            },
        },
        async ({ query, limit, sortBy }) => {
            const xml = await queryArxiv({
                search_query: query,
                start: "0",
                max_results: String(limit),
                sortBy,
            });
            return createMCPResponse([createTextContent(parseFeed(xml), true)]);
        },
    );
    server.registerTool(
        "arxiv_paper",
        {
            description:
                "Fetch papers by arXiv id or abstract URL and return the same fields as " +
                "arxiv_search. Ids are sent to arXiv without caller credentials.",
            inputSchema: paperSchema,
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: true,
            },
        },
        async ({ id }) => {
            const ids = normalizeIds(id);
            if (ids.length === 0) {
                throw new Error(`No arXiv id found in "${id}".`);
            }
            const xml = await queryArxiv({
                id_list: ids.join(","),
                max_results: String(ids.length),
            });
            return createMCPResponse([createTextContent(parseFeed(xml), true)]);
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
                name: "arxiv-mcp",
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
                            'Bearer realm="arxiv-mcp.pollinations.ai"',
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
