import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const MUSICBRAINZ_BASE = "https://musicbrainz.org/ws/2";
// MusicBrainz blocks generic user agents; identify ourselves on every request.
const USER_AGENT = "pollinations-musicbrainz-mcp/0.1 (https://pollinations.ai)";

// MusicBrainz needs no key, so the caller's Pollinations key is never forwarded.
async function fetchJson(url) {
    const response = await fetch(url, {
        headers: { accept: "application/json", "user-agent": USER_AGENT },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.error) {
        const reason =
            body?.error ||
            `MusicBrainz request failed with status ${response.status}`;
        throw new Error(reason);
    }
    return body;
}

function buildServer() {
    const server = new McpServer(
        { name: "musicbrainz-mcp", title: "MusicBrainz MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "search_artists",
        {
            description:
                "Search MusicBrainz for artists by name. Returns each artist's " +
                "MusicBrainz id, type, country, area, life-span years, " +
                "disambiguation and match score. Use the id with artist_releases.",
            inputSchema: {
                query: z
                    .string()
                    .min(1)
                    .describe("Artist name to search for, e.g. 'radiohead'"),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(10)
                    .optional()
                    .describe(
                        "Maximum number of artists to return (default 5)",
                    ),
            },
        },
        async ({ query, limit }) => {
            const url = new URL(`${MUSICBRAINZ_BASE}/artist`);
            url.searchParams.set("query", query);
            url.searchParams.set("fmt", "json");
            url.searchParams.set("limit", String(limit ?? 5));
            const body = await fetchJson(url);
            if (!body.artists?.length) {
                throw new Error(`No artists found for ${query}`);
            }
            const results = body.artists.map((artist) => ({
                id: artist.id,
                name: artist.name,
                sort_name: artist["sort-name"],
                type: artist.type ?? null,
                country: artist.country ?? null,
                area: artist.area?.name ?? null,
                begin: artist["life-span"]?.begin ?? null,
                end: artist["life-span"]?.end ?? null,
                disambiguation: artist.disambiguation ?? "",
                score: artist.score,
            }));
            return createMCPResponse([
                createTextContent(
                    JSON.stringify(
                        { query, count: results.length, results },
                        null,
                        2,
                    ),
                ),
            ]);
        },
    );
    server.registerTool(
        "artist_releases",
        {
            description:
                "List an artist's releases from MusicBrainz by artist id: " +
                "titles, status, dates, countries, primary label and catalog " +
                "number, per-medium track lists with durations in milliseconds, " +
                "and tags. Get artist ids from search_artists.",
            inputSchema: {
                artist_id: z
                    .string()
                    .min(1)
                    .describe("MusicBrainz artist UUID, from search_artists"),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(25)
                    .optional()
                    .describe(
                        "Maximum number of releases to return (default 10)",
                    ),
            },
        },
        async ({ artist_id, limit }) => {
            const url = new URL(`${MUSICBRAINZ_BASE}/release`);
            url.searchParams.set("artist", artist_id);
            url.searchParams.set("fmt", "json");
            url.searchParams.set("limit", String(limit ?? 10));
            url.searchParams.set("inc", "labels+tags");
            const body = await fetchJson(url);
            if (!body.releases?.length) {
                throw new Error(`No releases found for artist ${artist_id}`);
            }
            const results = body.releases.map((release) => ({
                id: release.id,
                title: release.title,
                status: release.status ?? null,
                date: release.date ?? null,
                country: release.country ?? null,
                artist: release["artist-credit"]?.[0]?.name ?? null,
                label: release["label-info"]?.[0]?.label?.name ?? null,
                catalog_number:
                    release["label-info"]?.[0]?.["catalog-number"] ?? null,
                tracks: (release.media ?? []).flatMap((medium) =>
                    (medium.track ?? []).map((track) => ({
                        number: track.number,
                        title: track.title,
                        length_ms: track.length ?? null,
                    })),
                ),
                tags: (release.tags ?? []).map(({ name, count }) => ({
                    name,
                    count,
                })),
            }));
            return createMCPResponse([
                createTextContent(
                    JSON.stringify(
                        { artist_id, count: results.length, results },
                        null,
                        2,
                    ),
                ),
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
                "WWW-Authenticate":
                    'Bearer realm="musicbrainz-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "musicbrainz-mcp",
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
