import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
} from "../../packages/mcp/src/utils/coreUtils.js";

// `health` refreshes every ~minute and `tags` are derived: both are noise in a diff.
const VOLATILE_FIELDS = ["health", "tags"];

const ModelList = z
    .array(z.object({ id: z.string().min(1) }).loose())
    .min(1)
    .max(5000);

// Sort object keys; treat string arrays as sets (sorted, deduplicated). Other
// arrays may be ordered data, so they keep their order.
function canon(value) {
    if (Array.isArray(value)) {
        const items = value.map(canon);
        return items.every((item) => typeof item === "string")
            ? [...new Set(items)].sort()
            : items;
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value)
                .sort(([a], [b]) => (a < b ? -1 : 1))
                .map(([key, item]) => [key, canon(item)]),
        );
    }
    return value;
}

// Parsing rejects the whole list on any malformed or duplicate entry, so a
// partly bad response can never become a smaller catalog that fakes removals.
function toModelMap(models) {
    const byId = new Map();
    for (const entry of ModelList.parse(models)) {
        if (byId.has(entry.id))
            throw new Error(`Duplicate model id ${entry.id}`);
        byId.set(
            entry.id,
            canon(
                Object.fromEntries(
                    Object.entries(entry).filter(
                        ([key]) => !VOLATILE_FIELDS.includes(key),
                    ),
                ),
            ),
        );
    }
    return byId;
}

async function fetchCatalog(context) {
    const { data } = await fetchJsonWithAuth(
        buildUrl("/v1/models"),
        {},
        context,
    );
    return toModelMap(data);
}

function diff(before, after) {
    const added = [...after.keys()].filter((id) => !before.has(id));
    const removed = [...before.keys()].filter((id) => !after.has(id));
    const changed = [];
    for (const [id, old] of before) {
        const now = after.get(id);
        if (!now) continue;
        const changes = [...new Set([...Object.keys(old), ...Object.keys(now)])]
            .filter(
                (key) => JSON.stringify(old[key]) !== JSON.stringify(now[key]),
            )
            .map((key) => ({
                field: key,
                baseline: old[key],
                current: now[key],
            }));
        if (changes.length) changed.push({ id, changes });
    }
    return { added, removed, changed };
}

function buildServer() {
    const server = new McpServer(
        {
            name: "catalog-diff-mcp",
            title: "Catalog Diff MCP",
            version: "0.1.0",
        },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "get_catalog",
        {
            description:
                "Fetch the live model catalog (/v1/models) as a timestamped snapshot. " +
                "Nothing is stored: pass the result to diff_catalog later as the baseline.",
            inputSchema: z.object({}),
        },
        async (_args, context) => {
            const models = [...(await fetchCatalog(context)).values()];
            return createMCPResponse([
                createTextContent(
                    { observed_at: new Date().toISOString(), models },
                    true,
                ),
            ]);
        },
    );
    server.registerTool(
        "diff_catalog",
        {
            description:
                "Compare a baseline from get_catalog with the live catalog. Returns " +
                "added and removed model ids and field-level changes.",
            inputSchema: z.object({
                baseline: z.object({ models: ModelList }),
            }),
        },
        async ({ baseline }, context) => {
            const before = toModelMap(baseline.models);
            const result = diff(before, await fetchCatalog(context));
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
                "WWW-Authenticate":
                    'Bearer realm="catalog-diff-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "catalog-diff-mcp",
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
