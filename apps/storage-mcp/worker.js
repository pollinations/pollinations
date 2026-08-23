import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const MAX_TEXT_BYTES = 64 * 1024;

class StorageFailure extends Error {}

const keySchema = z
    .string()
    .min(1)
    .max(1024)
    .refine(
        (key) =>
            (key.startsWith("private/") || key.startsWith("public/")) &&
            !key.split("/").includes(".."),
        "key must start with private/ or public/ and cannot contain '..'",
    );

function storageRequest(path, authorization, init = {}) {
    const headers = new Headers(init.headers);
    headers.set("Authorization", authorization);
    return new Request(`https://media.internal${path}`, {
        ...init,
        headers,
    });
}

function keyPath(key) {
    return key.split("/").map(encodeURIComponent).join("/");
}

async function storageError(response) {
    const body = await response.text();
    const message = /<Message>([\s\S]*?)<\/Message>/.exec(body)?.[1];
    return (
        message ||
        body.slice(0, 1000) ||
        `Storage returned HTTP ${response.status}`
    );
}

async function requireOk(response) {
    if (!response.ok) {
        throw new StorageFailure(await storageError(response));
    }
    return response;
}

function decodeXml(value = "") {
    return value
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&quot;", '"')
        .replaceAll("&apos;", "'")
        .replaceAll("&amp;", "&");
}

function xmlTag(xml, tag) {
    return decodeXml(
        new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml)?.[1] ?? "",
    );
}

async function listFiles(params, env, authorization) {
    const url = new URL("https://media.internal/s3/");
    url.searchParams.set("list-type", "2");
    url.searchParams.set("max-keys", String(params.limit));
    if (params.prefix) url.searchParams.set("prefix", params.prefix);
    if (params.cursor) {
        url.searchParams.set("continuation-token", params.cursor);
    }
    const response = await requireOk(
        await env.MEDIA.fetch(
            storageRequest(`${url.pathname}${url.search}`, authorization),
        ),
    );
    const xml = await response.text();
    const files = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map(
        ([, content]) => ({
            key: xmlTag(content, "Key"),
            size: Number(xmlTag(content, "Size")),
            lastModified: xmlTag(content, "LastModified"),
            etag: xmlTag(content, "ETag").replace(/^"|"$/g, ""),
        }),
    );
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    files,
                    cursor: xmlTag(xml, "NextContinuationToken") || null,
                }),
            },
        ],
    };
}

async function readTextFile({ key }, env, authorization) {
    const response = await requireOk(
        await env.MEDIA.fetch(
            storageRequest(`/s3/${keyPath(key)}`, authorization),
        ),
    );
    const declaredSize = Number(response.headers.get("content-length"));
    if (!Number.isFinite(declaredSize) || declaredSize > MAX_TEXT_BYTES) {
        await response.body?.cancel();
        throw new StorageFailure(
            "File is too large to read into model context",
        );
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_TEXT_BYTES) {
        throw new StorageFailure(
            "File is too large to read into model context",
        );
    }
    return {
        content: [{ type: "text", text: new TextDecoder().decode(bytes) }],
    };
}

async function writeTextFile(params, env, authorization) {
    const bytes = new TextEncoder().encode(params.content);
    if (bytes.byteLength > MAX_TEXT_BYTES) {
        throw new StorageFailure("File exceeds 64 KB");
    }
    const response = await requireOk(
        await env.MEDIA.fetch(
            storageRequest(`/s3/${keyPath(params.key)}`, authorization, {
                method: "PUT",
                headers: {
                    "Content-Length": String(bytes.byteLength),
                    "Content-Type": params.contentType,
                },
                body: bytes,
            }),
        ),
    );
    await response.body?.cancel();
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    key: params.key,
                    bytes: bytes.byteLength,
                }),
            },
        ],
    };
}

async function deleteFile({ key }, env, authorization) {
    const response = await requireOk(
        await env.MEDIA.fetch(
            storageRequest(`/s3/${keyPath(key)}`, authorization, {
                method: "DELETE",
            }),
        ),
    );
    await response.body?.cancel();
    return {
        content: [{ type: "text", text: JSON.stringify({ deleted: key }) }],
    };
}

function buildServer(env, authorization) {
    const server = new McpServer(
        { name: "pollinations-storage-mcp", version: "0.1.0" },
        {
            instructions:
                "Store and retrieve small text files in the caller's Pollinations storage. Use private/ keys for memories and other user-only data.",
            capabilities: { tools: {} },
        },
    );
    server.registerTool(
        "listFiles",
        {
            description:
                "List files in the caller's Pollinations storage, optionally under a prefix.",
            inputSchema: z.object({
                prefix: z.string().max(1024).optional(),
                cursor: z.string().optional(),
                limit: z.number().int().min(1).max(100).optional().default(100),
            }),
        },
        (params) => listFiles(params, env, authorization),
    );
    server.registerTool(
        "readTextFile",
        {
            description:
                "Read a UTF-8 text file up to 64 KB from the caller's Pollinations storage.",
            inputSchema: z.object({ key: keySchema }),
        },
        (params) => readTextFile(params, env, authorization),
    );
    server.registerTool(
        "writeTextFile",
        {
            description:
                "Create or replace a UTF-8 text file up to 64 KB. Use a private/ key unless the file is intentionally public.",
            inputSchema: z.object({
                key: keySchema,
                content: z.string().max(MAX_TEXT_BYTES),
                contentType: z
                    .string()
                    .optional()
                    .default("text/plain; charset=utf-8"),
            }),
        },
        (params) => writeTextFile(params, env, authorization),
    );
    server.registerTool(
        "deleteFile",
        {
            description:
                "Delete a file from the caller's Pollinations storage.",
            inputSchema: z.object({ key: keySchema }),
        },
        (params) => deleteFile(params, env, authorization),
    );
    return server;
}

export function createWorker() {
    return {
        async fetch(request, env) {
            if (new URL(request.url).pathname !== "/") {
                return new Response("Not found", { status: 404 });
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
            const authorization = request.headers.get("authorization") ?? "";
            const handler = createMcpHandler(
                () => buildServer(env, authorization),
                { onerror: (error) => console.error(error) },
            );
            return handler.fetch(request);
        },
    };
}

export default createWorker();
