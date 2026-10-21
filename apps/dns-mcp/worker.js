import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

function buildServer() {
    const server = new McpServer(
        { name: "dns-mcp", title: "DNS MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "dns_lookup",
        {
            description:
                "Look up public DNS records through Cloudflare's 1.1.1.1 resolver. " +
                "Use A/AAAA for addresses, MX for mail, TXT for SPF/DKIM/DMARC, or other DNS record types. " +
                "Returns the resolver's complete JSON response, including TTLs, authority records and DNSSEC AD. " +
                "Read Status: 0 means NOERROR (possibly no records), 2 means SERVFAIL, 3 means NXDOMAIN. " +
                "A lookup is one recursive resolver's cached view, not a propagation or domain-safety check. " +
                "Queries are sent to Cloudflare; no caller credentials are forwarded.",
            inputSchema: z.object({
                name: z
                    .string()
                    .trim()
                    .min(1)
                    .max(254)
                    .describe(
                        "DNS name, e.g. example.com, _dmarc.example.com or _sip._tcp.example.com. Use punycode for internationalized names.",
                    ),
                type: z
                    .string()
                    .trim()
                    .min(1)
                    .max(16)
                    .default("A")
                    .describe(
                        "DNS record type name or IANA numeric code, e.g. A, AAAA, MX, TXT, CAA, SRV or 257.",
                    ),
            }),
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: true,
            },
        },
        async ({ name, type }) => {
            const url = new URL("https://cloudflare-dns.com/dns-query");
            url.searchParams.set("name", name);
            url.searchParams.set("type", type.toUpperCase());
            const response = await fetch(url, {
                headers: { Accept: "application/dns-json" },
                redirect: "manual",
                signal: AbortSignal.timeout(10_000),
            });
            if (!response.ok) {
                throw new Error(
                    `DNS resolver returned HTTP ${response.status}.`,
                );
            }
            return createMCPResponse([
                createTextContent(await response.json(), true),
            ]);
        },
    );
    return server;
}

const mcpHandler = createMcpHandler(() => buildServer(), {
    legacy: "stateless",
    onerror: (error) => console.error(error),
});

export default {
    async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "dns-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }
        if (url.pathname !== "/") {
            return new Response("Not found", { status: 404 });
        }
        const token = request.headers
            .get("authorization")
            ?.trim()
            .match(/^Bearer\s+(\S+)$/i)?.[1];
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
                            'Bearer realm="dns-mcp.pollinations.ai"',
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
            authInfo: { token, clientId: "pollinations-api-key", scopes: [] },
        });
    },
};
