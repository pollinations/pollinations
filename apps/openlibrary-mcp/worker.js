import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

const USER_AGENT = "openlibrary-mcp/0.1 (hello@pollinations.ai)";
const SEARCH_FIELDS =
    "key,title,author_name,author_key,first_publish_year,edition_count,cover_i";
const SUBJECT_LIMIT = 10;

// The upstream path is built only from IDs that match these patterns, so an ID
// cannot add a path segment, query string or fragment.
const workId = z
    .string()
    .regex(/^OL\d{1,10}W$/)
    .describe("Open Library work ID, e.g. OL59800W");

const authorId = z
    .string()
    .regex(/^OL\d{1,10}A$/)
    .describe("Open Library author ID, e.g. OL31353A");

async function openLibrary(path) {
    const response = await fetch(`https://openlibrary.org${path}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (response.status === 404) return null;
    if (!response.ok) {
        throw new Error(`Open Library answered ${response.status}`);
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

// Open Library sends long text either as a plain string or as { type, value }.
const textOf = (field) =>
    typeof field === "string" ? field : (field?.value ?? null);

const authorsOf = (doc) =>
    (doc.author_name ?? []).map((name, index) => ({
        name,
        id: doc.author_key?.[index] ?? null,
    }));

function buildServer() {
    const server = new McpServer(
        {
            name: "openlibrary-mcp",
            title: "Open Library MCP",
            version: "0.1.0",
        },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "openlibrary_search",
        {
            description:
                "Search Open Library for books. Returns title, authors (name and author ID), first publish year, edition count, work ID and cover URL. Read a work with openlibrary_work and an author with openlibrary_author.",
            inputSchema: z.object({
                query: z.string().min(1).max(300),
                limit: z.number().int().min(1).max(20).default(10),
            }),
        },
        async ({ query, limit }) => {
            const found = await openLibrary(
                `/search.json?${new URLSearchParams({ q: query, limit, fields: SEARCH_FIELDS })}`,
            );
            return asText(
                found.docs.map((doc) => ({
                    title: doc.title,
                    authors: authorsOf(doc),
                    firstPublishYear: doc.first_publish_year ?? null,
                    editionCount: doc.edition_count ?? null,
                    workId: doc.key.replace("/works/", ""),
                    coverUrl: doc.cover_i
                        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
                        : null,
                })),
            );
        },
    );

    server.registerTool(
        "openlibrary_work",
        {
            description:
                "Read an Open Library work by its work ID, e.g. OL59800W: title, description, first 10 subjects and first publish date.",
            inputSchema: z.object({ id: workId }),
        },
        async ({ id }) => {
            const work = await openLibrary(`/works/${id}.json`);
            if (!work) return failure(`No Open Library work ${id}.`);
            return asText({
                title: work.title,
                description: textOf(work.description),
                subjects: (work.subjects ?? []).slice(0, SUBJECT_LIMIT),
                firstPublishDate: work.first_publish_date ?? null,
            });
        },
    );

    server.registerTool(
        "openlibrary_author",
        {
            description:
                "Read an Open Library author by their author ID, e.g. OL31353A: name, birth and death dates and bio.",
            inputSchema: z.object({ id: authorId }),
        },
        async ({ id }) => {
            const author = await openLibrary(`/authors/${id}.json`);
            if (!author) return failure(`No Open Library author ${id}.`);
            return asText({
                name: author.name,
                birthDate: author.birth_date ?? null,
                deathDate: author.death_date ?? null,
                bio: textOf(author.bio),
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
                name: "openlibrary-mcp",
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
                            'Bearer realm="openlibrary-mcp.pollinations.ai"',
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
