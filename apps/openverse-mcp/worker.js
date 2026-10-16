import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { createTextContent } from "../../packages/mcp/src/utils/coreUtils.js";

const OPENVERSE_API = "https://api.openverse.org/v1";
const MAX_RESULTS = 10;

function buildServer() {
    const server = new McpServer(
        { name: "openverse-mcp", title: "Openverse MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "search_open_media",
        {
            description:
                "Find openly licensed images or audio and return source, creator, license, and attribution details. " +
                "Search terms are sent to Openverse's public API. " +
                "Openverse metadata is not a legal guarantee; verify the source page and license before reuse.",
            inputSchema: {
                media_type: z.enum(["images", "audio"]),
                query: z.string().trim().min(1).max(200),
                license_type: z
                    .enum(["commercial", "modification", "all-cc"])
                    .optional(),
                limit: z.number().int().min(1).max(MAX_RESULTS).default(5),
            },
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: true,
            },
        },
        async ({ media_type, query, license_type, limit }) => {
            const url = new URL(`${OPENVERSE_API}/${media_type}/`);
            url.searchParams.set("q", query);
            url.searchParams.set("page_size", String(limit));
            url.searchParams.set("mature", "false");
            if (license_type) {
                url.searchParams.set("license_type", license_type);
            }

            let response;
            try {
                response = await fetch(url, {
                    headers: { Accept: "application/json" },
                    redirect: "manual",
                    signal: AbortSignal.timeout(8_000),
                });
            } catch (error) {
                return {
                    isError: true,
                    content: [
                        createTextContent(
                            `Openverse search failed: ${error instanceof Error ? error.message : "network error"}`,
                        ),
                    ],
                };
            }

            if (!response.ok) {
                return {
                    isError: true,
                    content: [
                        createTextContent(
                            `Openverse returned HTTP ${response.status}. Retry later if the service is rate-limiting requests.`,
                        ),
                    ],
                };
            }

            let data;
            try {
                data = await response.json();
            } catch {
                return {
                    isError: true,
                    content: [
                        createTextContent("Openverse returned invalid JSON."),
                    ],
                };
            }

            const results = Array.isArray(data.results)
                ? data.results.slice(0, limit).map((item) => ({
                      title: item.title,
                      creator: item.creator,
                      creator_url: item.creator_url,
                      license: item.license,
                      license_version: item.license_version,
                      license_url: item.license_url,
                      attribution: item.attribution,
                      source_page: item.foreign_landing_url,
                      media_url: item.url,
                      ...(media_type === "images"
                          ? { thumbnail_url: item.thumbnail }
                          : {}),
                  }))
                : [];

            return {
                content: [
                    createTextContent(
                        {
                            source: "Openverse",
                            results,
                            note: "Check each source page and license terms before reuse; license metadata is not legal advice.",
                        },
                        true,
                    ),
                ],
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
    return scheme?.toLowerCase() === "bearer" && token ? token : null;
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
                    'Bearer realm="openverse-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "openverse-mcp",
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
