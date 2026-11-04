import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const SERVER_NAME = "icons-mcp";
const API_ROOT = "https://api.iconify.design";
const REQUEST_TIMEOUT_MS = 15_000;
const SVG_LIMIT = 120_000;
// The caller's Pollinations key authenticates the proxy, not Iconify.
// Iconify is public, so the key is never sent to it.
const UPSTREAM_HEADERS = {
    "User-Agent": `pollinations-${SERVER_NAME} (https://pollinations.ai)`,
};

const iconNameSchema = z
    .string()
    .min(3)
    .max(200)
    .regex(
        /^[a-z0-9-]+:[a-z0-9-]+$/,
        "Use a prefixed lowercase icon name such as mdi:home.",
    )
    .describe(
        "Icon name with its set prefix, for example mdi:home, lucide:search, or simple-icons:github.",
    );

const prefixSchema = z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/)
    .optional()
    .describe(
        "Limit results to one icon set prefix, for example mdi, lucide, tabler, or simple-icons.",
    );

function textResult(value) {
    return {
        content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    };
}

function truncate(text, limit) {
    return text.length > limit
        ? `${text.slice(0, limit)}\n[cut at ${limit} characters]`
        : text;
}

function collectionSummary(info) {
    if (!info) return null;
    return {
        name: info.name ?? null,
        category: info.category ?? null,
        total: info.total ?? null,
        author: info.author?.name ?? null,
        author_url: info.author?.url ?? null,
        license: info.license
            ? {
                  title: info.license.title ?? null,
                  spdx: info.license.spdx ?? null,
                  url: info.license.url ?? null,
              }
            : null,
    };
}

function compactCollections(collections) {
    const result = {};
    for (const [prefix, info] of Object.entries(collections ?? {})) {
        result[prefix] = collectionSummary(info);
    }
    return result;
}

async function request(path, { accept = "application/json", params } = {}) {
    const url = new URL(`${API_ROOT}${path}`);
    for (const [key, value] of Object.entries(params ?? {})) {
        if (value === undefined || value === null || value === "") continue;
        url.searchParams.set(key, String(value));
    }

    let response;
    try {
        response = await fetch(url, {
            headers: { Accept: accept, ...UPSTREAM_HEADERS },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch {
        throw new Error("Iconify is unreachable right now. Try again shortly.");
    }

    const body = await response.text();
    if (!response.ok) {
        const detail = body.trim().slice(0, 200);
        throw new Error(
            `Iconify error (${response.status})${detail ? `: ${detail}` : ""}`,
        );
    }
    return { body, url };
}

async function fetchJson(path, params) {
    const { body } = await request(path, { params });
    try {
        return JSON.parse(body);
    } catch {
        throw new Error("Iconify returned invalid JSON.");
    }
}

async function fetchSvg(path, params) {
    const { body, url } = await request(path, {
        accept: "image/svg+xml",
        params,
    });
    if (!body.includes("<svg")) {
        throw new Error("Iconify did not return an SVG.");
    }
    return { svg: body, url };
}

function buildServer() {
    const server = new McpServer(
        { name: SERVER_NAME, title: "Icons", version: "0.1.0" },
        {
            instructions:
                "Search 200,000+ open-source icons from Iconify, then fetch one as SVG. search_icons returns icon names and the license for each icon set. get_icon returns the SVG plus its collection license, so check the license before shipping the icon.",
            capabilities: { tools: {} },
        },
    );

    server.registerTool(
        "search_icons",
        {
            title: "Search icons",
            description:
                "Search open-source icon sets by keyword and return prefixed icon names such as mdi:home. Results include each collection's author and license. Use start to fetch the next page.",
            inputSchema: z.object({
                query: z
                    .string()
                    .min(1)
                    .max(200)
                    .describe(
                        "What the icon should show, for example shopping cart, settings, or arrow left.",
                    ),
                prefix: prefixSchema,
                limit: z
                    .number()
                    .int()
                    .min(32)
                    .max(200)
                    .default(64)
                    .describe(
                        "Maximum icons to return. Iconify accepts 32 to 999; this server caps at 200.",
                    ),
                start: z
                    .number()
                    .int()
                    .min(0)
                    .max(10_000)
                    .default(0)
                    .describe("Result offset for pagination."),
            }),
        },
        async ({ query, prefix, limit, start }) => {
            const payload = await fetchJson("/search", {
                query: query.trim(),
                prefix,
                limit,
                start,
            });
            const icons = Array.isArray(payload.icons) ? payload.icons : [];
            const pageSize = payload.limit ?? limit;
            const pageStart = payload.start ?? start;
            const hasMore = icons.length >= pageSize;

            return textResult({
                query: query.trim(),
                prefix: prefix ?? null,
                icon_count: icons.length,
                limit: pageSize,
                start: pageStart,
                has_more: hasMore,
                next_start: hasMore ? pageStart + icons.length : null,
                icons,
                collections: compactCollections(payload.collections),
            });
        },
    );

    server.registerTool(
        "get_icon",
        {
            title: "Get icon SVG",
            description:
                "Fetch one icon as SVG by its prefixed name. Optionally set a CSS color and a height in pixels. The response also includes the collection's license and a direct Iconify URL.",
            inputSchema: z.object({
                name: iconNameSchema,
                color: z
                    .string()
                    .min(1)
                    .max(50)
                    .optional()
                    .describe(
                        "Optional CSS color such as #ff6600, red, or currentColor. Ignored by icons that already have a fixed palette.",
                    ),
                size: z
                    .number()
                    .int()
                    .min(8)
                    .max(1024)
                    .optional()
                    .describe(
                        "Optional height in pixels. Width keeps the icon's aspect ratio.",
                    ),
            }),
        },
        async ({ name, color, size }) => {
            const iconName = name.trim().toLowerCase();
            const [prefix, icon] = iconName.split(":");
            if (!prefix || !icon) {
                throw new Error("Icon name must look like mdi:home.");
            }

            const path = `/${prefix}/${icon}.svg`;
            const params = { color, height: size };
            const [{ svg, url }, collections] = await Promise.all([
                fetchSvg(path, params),
                fetchJson("/collections", { prefix }),
            ]);

            return textResult({
                name: iconName,
                svg: truncate(svg, SVG_LIMIT),
                url: url.toString(),
                collection: collectionSummary(collections[prefix]),
            });
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
                "WWW-Authenticate": `Bearer realm="${SERVER_NAME}.pollinations.ai"`,
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: SERVER_NAME,
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
