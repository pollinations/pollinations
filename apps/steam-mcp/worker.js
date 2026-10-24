import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const STORE_URL = "https://store.steampowered.com";

// The Steam store API needs no key, so the caller's Pollinations key is
// never forwarded.
async function fetchJson(url) {
    const response = await fetch(url, {
        headers: { accept: "application/json" },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(`Steam request failed with status ${response.status}`);
    }
    return body;
}

// Steam prices are integer minor units (cents); report major units.
function priceInMajorUnits(price) {
    if (!price) return null;
    return {
        currency: price.currency,
        initial: price.initial / 100,
        final: price.final / 100,
    };
}

async function searchGames({ query, limit }) {
    const url = new URL(`${STORE_URL}/api/storesearch/`);
    url.searchParams.set("term", query);
    url.searchParams.set("cc", "us");
    url.searchParams.set("l", "en");
    const body = await fetchJson(url);
    const results = (body?.items ?? []).slice(0, limit).map((item) => ({
        app_id: item.id,
        name: item.name,
        type: item.type,
        price: priceInMajorUnits(item.price),
    }));
    return { query, count: results.length, results };
}

async function gameDetails({ app_id }) {
    const url = new URL(`${STORE_URL}/api/appdetails`);
    url.searchParams.set("appids", String(app_id));
    url.searchParams.set("cc", "us");
    url.searchParams.set("l", "en");
    url.searchParams.set("filters", "basic");
    const body = await fetchJson(url);
    const entry = body?.[String(app_id)];
    if (!entry?.success || !entry.data) {
        throw new Error(`Steam app ${app_id} not found`);
    }
    const data = entry.data;
    return {
        app_id,
        name: data.name,
        type: data.type,
        is_free: data.is_free,
        short_description: data.short_description,
        developers: data.developers,
        publishers: data.publishers,
        platforms: data.platforms,
        release_date: data.release_date?.date,
        coming_soon: data.release_date?.coming_soon,
        price: priceInMajorUnits(data.price_overview),
        genres: (data.genres ?? []).map((genre) => genre.description),
        categories: (data.categories ?? []).map(
            (category) => category.description,
        ),
    };
}

async function gameReviews({ app_id }) {
    const url = new URL(`${STORE_URL}/appreviews/${app_id}`);
    url.searchParams.set("json", "1");
    url.searchParams.set("language", "all");
    url.searchParams.set("purchase_type", "all");
    url.searchParams.set("num_per_page", "5");
    url.searchParams.set("filter", "recent");
    const body = await fetchJson(url);
    if (body?.success !== 1) {
        throw new Error(`Steam app ${app_id} not found`);
    }
    const summary = body.query_summary ?? {};
    return {
        app_id,
        summary: {
            total_reviews: summary.total_reviews,
            total_positive: summary.total_positive,
            total_negative: summary.total_negative,
            score: summary.review_score,
            score_description: summary.review_score_desc,
        },
        reviews: (body.reviews ?? []).map((review) => ({
            author: review.author?.steamid,
            language: review.language,
            positive: review.voted_up,
            votes_up: review.votes_up,
            score: Number(review.weighted_vote_score) || 0,
            review: review.review,
            timestamp: review.timestamp_created,
        })),
    };
}

function buildServer() {
    const server = new McpServer(
        { name: "steam-mcp", title: "Steam MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "search_games",
        {
            description:
                "Search the Steam store for games by title fragment. Returns " +
                "app ids, names, types, and current USD prices.",
            inputSchema: {
                query: z
                    .string()
                    .min(1)
                    .describe("Game title fragment, e.g. 'witcher'"),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(10)
                    .optional()
                    .describe("Maximum results, 1-10 (default 5)"),
            },
        },
        async ({ query, limit }) => {
            const payload = await searchGames({ query, limit: limit ?? 5 });
            return createMCPResponse([
                createTextContent(JSON.stringify(payload, null, 2)),
            ]);
        },
    );
    server.registerTool(
        "game_details",
        {
            description:
                "Steam store details for one app id: name, type, short " +
                "description, developers, publishers, platforms, release " +
                "date, genres, categories, and current USD price.",
            inputSchema: {
                app_id: z
                    .number()
                    .int()
                    .min(1)
                    .describe(
                        "Steam app id, e.g. 570; find ids with search_games",
                    ),
            },
        },
        async ({ app_id }) => {
            const payload = await gameDetails({ app_id });
            return createMCPResponse([
                createTextContent(JSON.stringify(payload, null, 2)),
            ]);
        },
    );
    server.registerTool(
        "game_reviews",
        {
            description:
                "Recent Steam player reviews for one app id with vote and " +
                "score summaries across all languages.",
            inputSchema: {
                app_id: z
                    .number()
                    .int()
                    .min(1)
                    .describe(
                        "Steam app id, e.g. 570; find ids with search_games",
                    ),
            },
        },
        async ({ app_id }) => {
            const payload = await gameReviews({ app_id });
            return createMCPResponse([
                createTextContent(JSON.stringify(payload, null, 2)),
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
                "WWW-Authenticate": 'Bearer realm="steam-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "steam-mcp",
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
