import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

function buildServer() {
    const server = new McpServer(
        { name: "air-quality-mcp", title: "Air Quality MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "get_air_quality",
        {
            description:
                "Get current air quality for a location using the Open-Meteo Air Quality API. " +
                "Returns AQI, PM2.5, PM10, ozone, NO2, and pollen levels. Free, no API key.",
            inputSchema: z.object({
                latitude: z.number(),
                longitude: z.number(),
            }),
        },
        async ({ latitude, longitude }) => {
            const url =
                "https://air-quality-api.open-meteo.com/v1/air-quality" +
                `?latitude=${latitude}&longitude=${longitude}` +
                "&current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen";
            const res = await fetch(url);
            const data = await res.json();
            return {
                content: [{ type: "text", text: JSON.stringify(data) }],
            };
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
    if (scheme?.toLowerCase() !== "bearer" || !token) return null;
    return token;
}

function unauthorizedResponse() {
    return Response.json(
        { error: "unauthorized", message: "Send a Pollinations API key as a bearer token." },
        {
            status: 401,
            headers: {
                "WWW-Authenticate": 'Bearer realm="air-quality-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "air-quality-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }
        if (url.pathname !== "/") return new Response("Not found", { status: 404 });
        const token = readBearerToken(request);
        if (!token) return unauthorizedResponse();
        if (
            request.method === "POST" &&
            Array.isArray(await request.clone().json().catch(() => null))
        ) {
            return Response.json(
                { error: "invalid_request", message: "Batch requests are not supported." },
                { status: 400 },
            );
        }
        return mcpHandler.fetch(request, {
            authInfo: { token, clientId: "pollinations-api-key", scopes: [] },
        });
    },
};