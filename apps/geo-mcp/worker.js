import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org";
// Nominatim blocks requests without a User-Agent identifying the client.
const USER_AGENT = "pollinations-geo-mcp/0.1 (https://pollinations.ai)";

// Nominatim is public and keyless, so the caller's Pollinations key is never forwarded.
async function fetchJson(url) {
    const response = await fetch(url, {
        headers: { accept: "application/json", "user-agent": USER_AGENT },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.error) {
        const reason =
            (typeof body?.error === "string" && body.error) ||
            `Nominatim request failed with status ${response.status}`;
        throw new Error(reason);
    }
    return body;
}

async function geocode(query, limit) {
    const url = new URL(`${NOMINATIM_URL}/search`);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("addressdetails", "1");
    const hits = await fetchJson(url);
    if (!Array.isArray(hits) || hits.length === 0) {
        throw new Error(`No places found for "${query}"`);
    }
    return {
        query,
        count: hits.length,
        results: hits.map((hit) => ({
            place_id: hit.place_id,
            name: hit.name,
            display_name: hit.display_name,
            latitude: Number(hit.lat),
            longitude: Number(hit.lon),
            type: hit.type,
            category: hit.class,
            importance: hit.importance,
            country: hit.address?.country ?? null,
            country_code: hit.address?.country_code ?? null,
            state: hit.address?.state ?? null,
            city: hit.address?.city ?? null,
            postcode: hit.address?.postcode ?? null,
            road: hit.address?.road ?? null,
            suburb: hit.address?.suburb ?? null,
        })),
    };
}

async function reverseGeocode(latitude, longitude) {
    const url = new URL(`${NOMINATIM_URL}/reverse`);
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");
    const hit = await fetchJson(url);
    return {
        latitude,
        longitude,
        name: hit.name,
        display_name: hit.display_name,
        type: hit.type,
        category: hit.class,
        address: {
            country: hit.address?.country ?? null,
            country_code: hit.address?.country_code ?? null,
            state: hit.address?.state ?? null,
            city: hit.address?.city ?? null,
            postcode: hit.address?.postcode ?? null,
            road: hit.address?.road ?? null,
        },
    };
}

function buildServer() {
    const server = new McpServer(
        { name: "geo-mcp", title: "Geo MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "geocode",
        {
            description:
                "Geocode a place name to coordinates with Nominatim " +
                "(OpenStreetMap): returns matched place names, display names, " +
                "coordinates and address parts for up to 5 results.",
            inputSchema: {
                query: z
                    .string()
                    .min(1)
                    .describe("Free-text place, e.g. 'Moradabad, India'"),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(5)
                    .optional()
                    .describe("How many matches to return (default 1)"),
            },
        },
        async ({ query, limit }) => {
            const report = await geocode(query, limit ?? 1);
            return createMCPResponse([
                createTextContent(JSON.stringify(report, null, 2)),
            ]);
        },
    );
    server.registerTool(
        "reverse_geocode",
        {
            description:
                "Reverse-geocode coordinates to an address with Nominatim " +
                "(OpenStreetMap): returns the display name, place type and " +
                "address parts for a latitude/longitude.",
            inputSchema: {
                latitude: z
                    .number()
                    .min(-90)
                    .max(90)
                    .describe("Decimal degrees north"),
                longitude: z
                    .number()
                    .min(-180)
                    .max(180)
                    .describe("Decimal degrees east"),
            },
        },
        async ({ latitude, longitude }) => {
            const report = await reverseGeocode(latitude, longitude);
            return createMCPResponse([
                createTextContent(JSON.stringify(report, null, 2)),
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
                "WWW-Authenticate": 'Bearer realm="geo-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "geo-mcp",
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
