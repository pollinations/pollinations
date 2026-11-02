import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";

// DoH JSON answers carry numeric record types; map the ones we offer.
const RECORD_TYPES = {
    1: "A",
    2: "NS",
    5: "CNAME",
    6: "SOA",
    12: "PTR",
    15: "MX",
    16: "TXT",
    28: "AAAA",
    33: "SRV",
    43: "DS",
    48: "DNSKEY",
    257: "CAA",
};
const QUERY_TYPES = Object.values(RECORD_TYPES);
const STATUS_NAMES = {
    0: "NOERROR",
    1: "FORMERR",
    2: "SERVFAIL",
    3: "NXDOMAIN",
    5: "REFUSED",
};

async function queryDns(name, type) {
    const url = new URL(DOH_ENDPOINT);
    url.searchParams.set("name", name);
    url.searchParams.set("type", type);

    const response = await fetch(url, {
        headers: { accept: "application/dns-json" },
    });
    if (!response.ok) {
        throw new Error(`DNS query failed with status ${response.status}`);
    }

    const payload = await response.json();
    return {
        name: payload.Question?.[0]?.name ?? name,
        type,
        status: STATUS_NAMES[payload.Status] ?? `RCODE_${payload.Status}`,
        records: (payload.Answer ?? []).map((answer) => ({
            name: answer.name,
            type: RECORD_TYPES[answer.type] ?? `TYPE${answer.type}`,
            ttl: answer.TTL,
            data: answer.data,
        })),
    };
}

function expandIpv6(address) {
    const [head, tail = ""] = address.split("::");
    const headParts = head ? head.split(":") : [];
    const tailParts = tail ? tail.split(":") : [];
    const gap = 8 - headParts.length - tailParts.length;
    return [
        ...headParts,
        ...Array(address.includes("::") ? gap : 0).fill("0"),
        ...tailParts,
    ].map((part) => part.padStart(4, "0"));
}

// PTR lookups need the address reversed under in-addr.arpa or ip6.arpa.
function toReverseName(address) {
    if (address.includes(":")) {
        const nibbles = expandIpv6(address).join("").split("").reverse();
        return `${nibbles.join(".")}.ip6.arpa`;
    }
    return `${address.split(".").reverse().join(".")}.in-addr.arpa`;
}

function buildServer() {
    const server = new McpServer(
        { name: "dns-mcp", title: "DNS MCP", version: "0.1.0" },
        {
            instructions:
                "Look up live DNS records. dns_lookup resolves a hostname for any record type; dns_reverse resolves the hostname behind an IPv4 or IPv6 address. Answers come from Cloudflare's public resolver.",
            capabilities: { tools: {} },
        },
    );

    server.registerTool(
        "dns_lookup",
        {
            title: "Look up DNS records",
            description:
                "Resolve a hostname and return its DNS records, TTLs, and the resolver status (NOERROR, NXDOMAIN, SERVFAIL). Common types: A, AAAA, CNAME, MX, NS, TXT, SOA, SRV, CAA.",
            inputSchema: z.object({
                name: z
                    .string()
                    .min(1)
                    .describe("Hostname to resolve, for example example.com"),
                type: z
                    .enum(QUERY_TYPES)
                    .default("A")
                    .describe("DNS record type to request"),
            }),
        },
        async ({ name, type }) => {
            const result = await queryDns(name, type);
            return createMCPResponse([createTextContent(result, true)]);
        },
    );

    server.registerTool(
        "dns_reverse",
        {
            title: "Reverse-resolve an IP address",
            description:
                "Return the PTR records for an IPv4 or IPv6 address, for example the hostname behind 1.1.1.1.",
            inputSchema: z.object({
                address: z
                    .string()
                    .min(1)
                    .describe("IPv4 or IPv6 address to reverse-resolve"),
            }),
        },
        async ({ address }) => {
            const result = await queryDns(toReverseName(address), "PTR");
            return createMCPResponse([createTextContent(result, true)]);
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
                "WWW-Authenticate": 'Bearer realm="dns-mcp.pollinations.ai"',
            },
        },
    );
}

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
