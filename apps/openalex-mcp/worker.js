import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

const USER_AGENT = "openalex-mcp/0.1 (https://pollinations.ai)";
const ABSTRACT_LIMIT = 3000;
const AUTHOR_LIMIT = 5;

const WORK_FIELDS =
    "id,title,authorships,publication_year,primary_location,doi,cited_by_count,open_access";
const AUTHOR_FIELDS =
    "id,display_name,last_known_institutions,works_count,cited_by_count,summary_stats";

// Strict on purpose: the id becomes part of the upstream path.
const WORK_ID = /^W\d{1,12}$/;
const DOI = /^10\.\d{4,9}\/(?!.*\.\.)[-._;()/:A-Za-z0-9]+$/;

const SORTS = {
    relevance: undefined,
    cited_by_count: "cited_by_count:desc",
    publication_date: "publication_date:desc",
};

const year = z.number().int().min(1000).max(2100);

async function openalex(path, params) {
    const response = await fetch(
        `https://api.openalex.org${path}?${new URLSearchParams(params)}`,
        { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } },
    );
    if (response.status === 404) return null;
    if (!response.ok) {
        throw new Error(`OpenAlex answered ${response.status}`);
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

const shortId = (url) => url.replace("https://openalex.org/", "");

function summarizeWork(work) {
    return {
        id: shortId(work.id),
        title: work.title,
        authors: work.authorships
            .slice(0, AUTHOR_LIMIT)
            .map(({ author }) => author.display_name),
        year: work.publication_year,
        venue: work.primary_location?.source?.display_name ?? null,
        doi: work.doi?.replace("https://doi.org/", "") ?? null,
        cited_by_count: work.cited_by_count,
        open_access_url: work.open_access?.oa_url ?? null,
    };
}

// OpenAlex ships abstracts as { word: [positions] }; put each word back at its position.
function rebuildAbstract(index) {
    if (!index) return null;
    const words = [];
    for (const [word, positions] of Object.entries(index)) {
        for (const position of positions) words[position] = word;
    }
    return words.filter(Boolean).join(" ");
}

function buildServer() {
    const server = new McpServer(
        { name: "openalex-mcp", title: "OpenAlex MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "openalex_search_works",
        {
            description:
                "Search scholarly works across all fields. Returns title, first 5 authors, year, venue, DOI, citation count, open-access URL and OpenAlex id; read one with openalex_work.",
            inputSchema: z.object({
                query: z.string().min(1).max(300),
                from_year: year.optional(),
                to_year: year.optional(),
                sort: z
                    .enum(["relevance", "cited_by_count", "publication_date"])
                    .default("relevance"),
                limit: z.number().int().min(1).max(20).default(10),
            }),
        },
        async ({ query, from_year, to_year, sort, limit }) => {
            const filter = [
                from_year && `from_publication_date:${from_year}-01-01`,
                to_year && `to_publication_date:${to_year}-12-31`,
            ].filter(Boolean);
            const found = await openalex("/works", {
                search: query,
                "per-page": limit,
                select: WORK_FIELDS,
                ...(filter.length && { filter: filter.join(",") }),
                ...(SORTS[sort] && { sort: SORTS[sort] }),
            });
            return asText(found.results.map(summarizeWork));
        },
    );

    server.registerTool(
        "openalex_work",
        {
            description: `Read one scholarly work by OpenAlex id (W followed by digits) or DOI: the search fields plus the abstract (cut at ${ABSTRACT_LIMIT} characters).`,
            inputSchema: z.object({
                id: z
                    .string()
                    .refine((id) => WORK_ID.test(id) || DOI.test(id), {
                        message:
                            "Expected an OpenAlex work id like W2741809807 or a DOI like 10.7717/peerj.4375.",
                    }),
            }),
        },
        async ({ id }) => {
            const path = WORK_ID.test(id)
                ? `/works/${id}`
                : `/works/doi:${encodeURIComponent(id)}`;
            const work = await openalex(path, {
                select: `${WORK_FIELDS},abstract_inverted_index`,
            });
            if (!work) return failure(`No OpenAlex work with id "${id}".`);
            const abstract = rebuildAbstract(work.abstract_inverted_index);
            return asText({
                ...summarizeWork(work),
                abstract: abstract?.slice(0, ABSTRACT_LIMIT) ?? null,
                abstract_truncated: (abstract?.length ?? 0) > ABSTRACT_LIMIT,
            });
        },
    );

    server.registerTool(
        "openalex_search_authors",
        {
            description:
                "Search authors by name. Returns name, institutions, works count, citation count, h-index and OpenAlex id.",
            inputSchema: z.object({
                name: z.string().min(1).max(200),
                limit: z.number().int().min(1).max(10).default(5),
            }),
        },
        async ({ name, limit }) => {
            const found = await openalex("/authors", {
                search: name,
                "per-page": limit,
                select: AUTHOR_FIELDS,
            });
            return asText(
                found.results.map((author) => ({
                    id: shortId(author.id),
                    name: author.display_name,
                    institutions: (author.last_known_institutions ?? []).map(
                        (institution) => institution.display_name,
                    ),
                    works_count: author.works_count,
                    cited_by_count: author.cited_by_count,
                    h_index: author.summary_stats?.h_index ?? null,
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
                name: "openalex-mcp",
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
                            'Bearer realm="openalex-mcp.pollinations.ai"',
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
