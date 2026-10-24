import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const BASE = "https://huggingface.co";
const JSON_CAP = 1048576;
const TAG_CAP = 20;
const DEFAULT_SEARCH_LIMIT = 10;
const REPO_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)?$/;

// Reads a capped JSON document from the Hugging Face Hub. Failures come back
// as structured facts (status/error) so one bad response never fails the tool.
async function hfGet(path, params) {
    const url = new URL(BASE + path);
    for (const [key, value] of Object.entries(params ?? {})) {
        if (value != null) url.searchParams.set(key, String(value));
    }
    try {
        const response = await fetch(url.toString());
        const status = response.status;
        const reader = response.body?.getReader();
        if (!reader) {
            return { status, error: `HTTP ${status}` };
        }
        const chunks = [];
        let size = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            size += value.byteLength;
            if (size >= JSON_CAP) {
                await reader.cancel().catch(() => {});
                return {
                    status,
                    truncated: true,
                    error: "Response exceeded the 1 MB cap.",
                };
            }
        }
        const merged = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            merged.set(chunk, offset);
            offset += chunk.byteLength;
        }
        const text = new TextDecoder().decode(merged);
        let json = null;
        let parseError = null;
        try {
            json = JSON.parse(text);
        } catch {
            parseError = "Response was not valid JSON.";
        }
        if (!response.ok) {
            return {
                status,
                error: String((!parseError && json?.error) || `HTTP ${status}`),
            };
        }
        if (parseError) return { status, error: parseError };
        return { status, json };
    } catch (error) {
        return { status: null, error: String(error?.message ?? error) };
    }
}

function failure(result) {
    return {
        status: result.status,
        ...(result.error ? { error: result.error } : {}),
    };
}

function stringTags(tags) {
    return Array.isArray(tags)
        ? tags.filter((tag) => typeof tag === "string").slice(0, TAG_CAP)
        : [];
}

function licenseOf(model) {
    const tagged = model?.tags?.find(
        (tag) => typeof tag === "string" && tag.startsWith("license:"),
    );
    return (
        model?.cardData?.license ??
        (tagged ? tagged.slice("license:".length) : null) ??
        null
    );
}

async function searchModels({ query, task, limit }) {
    const result = await hfGet("/api/models", {
        search: query,
        filter: task,
        limit: limit ?? DEFAULT_SEARCH_LIMIT,
        sort: "downloads",
        direction: -1,
    });
    if (result.status !== 200) return failure(result);
    const models = Array.isArray(result.json) ? result.json : [];
    return {
        query,
        task: task ?? null,
        count: models.length,
        models: models.map((model) => ({
            id: model?.id ?? null,
            task: model?.pipeline_tag ?? null,
            downloads: model?.downloads ?? null,
            likes: model?.likes ?? null,
        })),
    };
}

async function modelInfo({ id }) {
    const result = await hfGet(`/api/models/${id}`);
    if (result.status !== 200) return failure(result);
    const model = result.json ?? {};
    return {
        id: model.id ?? id,
        task: model.pipeline_tag ?? null,
        downloads: model.downloads ?? null,
        likes: model.likes ?? null,
        license: licenseOf(model),
        library: model.library_name ?? null,
        lastModified: model.lastModified ?? null,
        tags: stringTags(model.tags),
    };
}

async function spaceInfo({ id }) {
    const result = await hfGet(`/api/spaces/${id}`);
    if (result.status !== 200) return failure(result);
    const space = result.json ?? {};
    return {
        id: space.id ?? id,
        sdk: space.sdk ?? null,
        likes: space.likes ?? null,
        stage: space?.runtime?.stage ?? null,
        lastModified: space.lastModified ?? null,
        tags: stringTags(space.tags),
    };
}

function buildServer() {
    const server = new McpServer(
        {
            name: "huggingface-mcp",
            title: "Hugging Face MCP",
            version: "0.1.0",
        },
        { capabilities: { tools: {} } },
    );
    const idField = z
        .string()
        .min(1)
        .max(160)
        .regex(
            REPO_ID,
            "id must be a Hugging Face repo id such as openai/whisper-large-v3",
        )
        .describe("Hugging Face repo id, for example openai/whisper-large-v3.");
    server.registerTool(
        "search_models",
        {
            description:
                "Search Hugging Face models by keyword, optionally filtered to a pipeline task. Returns the top matches by downloads with id, task, downloads, and likes.",
            inputSchema: z.object({
                query: z.string().min(1).describe("Keyword such as whisper."),
                task: z
                    .string()
                    .max(64)
                    .optional()
                    .describe(
                        "Pipeline task filter such as text-classification.",
                    ),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(25)
                    .optional()
                    .describe("Matches to return (default 10, max 25)."),
            }),
        },
        async (args) =>
            createMCPResponse([
                createTextContent(await searchModels(args), true),
            ]),
    );
    server.registerTool(
        "model_info",
        {
            description:
                "Read a Hugging Face model's key facts: pipeline task, downloads, likes, license, library, last modified date, and up to 20 tags.",
            inputSchema: z.object({ id: idField }),
        },
        async (args) =>
            createMCPResponse([createTextContent(await modelInfo(args), true)]),
    );
    server.registerTool(
        "space_info",
        {
            description:
                "Inspect a Hugging Face Space: SDK, likes, runtime stage, last modified date, and up to 20 tags.",
            inputSchema: z.object({ id: idField }),
        },
        async (args) =>
            createMCPResponse([createTextContent(await spaceInfo(args), true)]),
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
                    'Bearer realm="huggingface-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "huggingface-mcp",
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
