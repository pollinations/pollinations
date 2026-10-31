import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const IPAPI_BASE = "https://ipwho.is";

function normalize(data) {
    const { connection = {}, timezone = {} } = data;
    return {
        ip: data.ip ?? null,
        success: data.success ?? null,
        type: data.type ?? null,
        country: data.country ?? null,
        countryCode: data.country_code ?? null,
        region: data.region ?? null,
        city: data.city ?? null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        isEu: data.is_eu ?? null,
        postal: data.postal ?? null,
        timezone: timezone.id ?? null,
        timezoneAbbr: timezone.abbr ?? null,
        utcOffset: timezone.offset ?? null,
        asn: connection.asn ?? null,
        org: connection.org ?? null,
        isp: connection.isp ?? null,
        domain: connection.domain ?? null,
    };
}

async function ipLookup(path) {
    const response = await fetch(`${IPAPI_BASE}${path}`, {
        headers: { Accept: "application/json" },
    });
    if (!response.ok) {
        throw new Error(`ipwho.is returned HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!data.success) {
        throw new Error(`ipwho.is error: ${data.message ?? "unknown error"}`);
    }
    return normalize(data);
}

function buildServer() {
    const server = new McpServer(
        { name: "ip-mcp", title: "IP Geolocation MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "ip_lookup",
        {
            description:
                "Look up geolocation and network info for an IP address: city, region, country, ISP, " +
                "ASN, timezone, latitude/longitude, and whether it is a proxy or hosting provider. " +
                "Uses ipwho.is (no API key needed).",
            inputSchema: {
                ip: z.string().describe("IPv4 or IPv6 address, e.g. 8.8.8.8"),
            },
        },
        async ({ ip }) => {
            const data = await ipLookup(`/${encodeURIComponent(ip)}`);
            return createMCPResponse([
                createTextContent(JSON.stringify(data, null, 2)),
            ]);
        },
    );

    server.registerTool(
        "my_ip",
        {
            description:
                "Get the caller's public IP address and its geolocation info. " +
                "Useful for agents that need to know where a request originated.",
            inputSchema: {},
        },
        async () => {
            const data = await ipLookup("/");
            return createMCPResponse([
                createTextContent(JSON.stringify(data, null, 2)),
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
                "WWW-Authenticate": 'Bearer realm="ip-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "ip-mcp",
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
