import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const MAX_REDIRECTS = 10;
const TIMEOUT_MS = 10_000;
const SECURITY_HEADERS = [
    "strict-transport-security",
    "content-security-policy",
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
];

// Workers give no documented guarantee against reaching loopback or private
// addresses, so IP-literal and localhost hosts are refused on every hop. URL
// parsing normalizes forms like http://2130706433 to dotted IPv4 first.
function assertNamedHost(url) {
    // Drop root-zone dots so "localhost." is treated like "localhost".
    const hostname = new URL(url).hostname.replace(/\.+$/, "");
    if (
        hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        hostname.startsWith("[") ||
        /^\d+\.\d+\.\d+\.\d+$/.test(hostname)
    ) {
        throw new Error(`${hostname} is not a public host name`);
    }
}

// Follows redirects by hand so every hop is reported. The caller's key never
// leaves this Worker. global_fetch_strictly_public sends even pollinations.ai
// URLs over the public internet, so probes see what any visitor sees.
async function probe(url, method) {
    const startedAt = Date.now();
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    const redirects = [];
    let current = url;
    for (;;) {
        assertNamedHost(current);
        const hopStartedAt = Date.now();
        const response = await fetch(current, {
            method,
            redirect: "manual",
            signal,
        });
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (response.status < 300 || response.status > 399 || !location) {
            // Header iteration yields each Set-Cookie separately, so keep
            // them all as a list instead of only the last one.
            const headers = Object.fromEntries(response.headers);
            const cookies = response.headers.getSetCookie();
            if (cookies.length) headers["set-cookie"] = cookies;
            return {
                url: current,
                status: response.status,
                statusText: response.statusText,
                ms: Date.now() - startedAt,
                redirects,
                headers,
                missingSecurityHeaders: SECURITY_HEADERS.filter(
                    (name) => !(name in headers),
                ),
            };
        }
        if (redirects.length === MAX_REDIRECTS) {
            throw new Error(`Stopped after ${MAX_REDIRECTS} redirects`);
        }
        const next = new URL(location, current).href;
        redirects.push({
            url: current,
            status: response.status,
            location: next,
            ms: Date.now() - hopStartedAt,
        });
        current = next;
    }
}

function buildServer() {
    const server = new McpServer(
        {
            name: "http-probe-mcp",
            title: "HTTP Probe MCP",
            version: "0.1.0",
        },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "http_probe",
        {
            description:
                "Request a public http(s) URL and report its final status, each redirect hop, " +
                "response time, response headers, and which common security headers are missing. " +
                "The response body is not returned.",
            inputSchema: z.object({
                url: z
                    .url({ protocol: /^https?$/ })
                    .describe("Public http or https URL"),
                method: z.enum(["GET", "HEAD"]).default("GET"),
            }),
        },
        async ({ url, method }) => {
            try {
                const result = await probe(url, method);
                return {
                    content: [
                        { type: "text", text: JSON.stringify(result, null, 2) },
                    ],
                };
            } catch (error) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: `Probe of ${url} failed: ${error.message}`,
                        },
                    ],
                };
            }
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
                    'Bearer realm="http-probe-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "http-probe-mcp",
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
