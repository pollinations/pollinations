import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import ipaddr from "ipaddr.js";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

function bytesToBigInt(bytes) {
    return bytes.reduce((value, byte) => (value << 8n) | BigInt(byte), 0n);
}

function addressFromBigInt(value, byteLength) {
    const bytes = Array(byteLength).fill(0);
    for (let index = byteLength - 1; index >= 0; index--) {
        bytes[index] = Number(value & 255n);
        value >>= 8n;
    }
    return ipaddr.fromByteArray(bytes).toString();
}

function inspectCidr(cidr, addresses) {
    let parsed;
    try {
        parsed = ipaddr.parseCIDR(cidr);
    } catch {
        throw new Error(`Invalid CIDR range: ${cidr}`);
    }

    const [address, prefixLength] = parsed;
    const kind = address.kind();
    const bitLength = kind === "ipv4" ? 32 : 128;
    const byteLength = bitLength / 8;
    const hostBits = BigInt(bitLength - prefixLength);
    const addressCount = 1n << hostBits;
    const allBits = (1n << BigInt(bitLength)) - 1n;
    const hostMask = addressCount - 1n;
    const networkValue =
        bytesToBigInt(address.toByteArray()) & (allBits ^ hostMask);
    const lastValue = networkValue + hostMask;
    const network = addressFromBigInt(networkValue, byteLength);

    return {
        cidr: `${network}/${prefixLength}`,
        version: kind === "ipv4" ? 4 : 6,
        prefix_length: prefixLength,
        netmask: addressFromBigInt(allBits ^ hostMask, byteLength),
        network,
        last_address: addressFromBigInt(lastValue, byteLength),
        broadcast:
            kind === "ipv4" ? addressFromBigInt(lastValue, byteLength) : null,
        address_count: addressCount.toString(),
        classification: ipaddr.parse(network).range(),
        checks: addresses.map((input) => {
            if (!ipaddr.isValid(input)) {
                return {
                    address: input,
                    valid: false,
                    contained: false,
                };
            }
            const candidate = ipaddr.parse(input);
            return {
                address: input,
                valid: true,
                normalized: candidate.toString(),
                version: candidate.kind() === "ipv4" ? 4 : 6,
                classification: candidate.range(),
                contained: candidate.kind() === kind && candidate.match(parsed),
            };
        }),
    };
}

function buildServer() {
    const server = new McpServer(
        { name: "cidr-mcp", title: "CIDR MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "inspect_cidr",
        {
            description:
                "Inspect an IPv4 or IPv6 CIDR range and optionally test addresses for containment. Returns the normalized network, netmask, last address, address count, and address classifications.",
            inputSchema: {
                cidr: z
                    .string()
                    .trim()
                    .min(1)
                    .max(100)
                    .describe("IPv4 or IPv6 range in CIDR notation"),
                addresses: z
                    .array(z.string().trim().min(1).max(100))
                    .max(20)
                    .optional()
                    .describe(
                        "Optional IP addresses to normalize, classify, and test; up to 20",
                    ),
            },
        },
        ({ cidr, addresses = [] }) =>
            createMCPResponse([
                createTextContent(
                    JSON.stringify(inspectCidr(cidr, addresses), null, 2),
                ),
            ]),
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
        {
            error: "unauthorized",
            message: "Send a Pollinations API key as a bearer token.",
        },
        {
            status: 401,
            headers: {
                "WWW-Authenticate": 'Bearer realm="cidr-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "cidr-mcp",
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
