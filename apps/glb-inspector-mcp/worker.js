import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { inspectGlb, MAX_GLB_BYTES } from "./inspector.js";

const urlSchema = z
    .string()
    .url()
    .describe("Public GLB asset URL on media.pollinations.ai");
const inputSchema = z.object({ url: urlSchema });
const validationSchema = inputSchema.extend({
    max_triangles: z.number().int().nonnegative().optional(),
    max_meshes: z.number().int().nonnegative().optional(),
    max_file_bytes: z.number().int().nonnegative().optional(),
    require_materials: z.boolean().optional(),
    require_self_contained: z.boolean().optional(),
});

function checkUrl(value) {
    const url = new URL(value);
    if (
        url.protocol !== "https:" ||
        url.hostname !== "media.pollinations.ai" ||
        url.port ||
        url.username ||
        url.password
    ) {
        throw new Error(
            "Only HTTPS assets hosted on media.pollinations.ai are supported.",
        );
    }
    return url;
}

async function downloadGlb(value) {
    const url = checkUrl(value);
    const response = await fetch(url, {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
        throw new Error(`Asset fetch failed (HTTP ${response.status}).`);
    if (Number(response.headers.get("content-length")) > MAX_GLB_BYTES) {
        throw new Error("GLB exceeds the 32 MiB download limit.");
    }
    if (!response.body) throw new Error("Asset response contains no body.");
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > MAX_GLB_BYTES) {
                await reader.cancel();
                throw new Error("GLB exceeds the 32 MiB download limit.");
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

async function inspect(url) {
    const bytes = await downloadGlb(url);
    const report = inspectGlb(bytes);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = Array.from(new Uint8Array(digest), (n) =>
        n.toString(16).padStart(2, "0"),
    ).join("");
    return { sha256, ...report };
}

function response(data) {
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

function registerServer() {
    const server = new McpServer(
        {
            name: "glb-inspector-mcp",
            title: "GLB Inspector MCP",
            version: "0.1.0",
        },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "inspect_glb",
        {
            description:
                "Inspect a Pollinations-hosted GLB 2.0 file. Return SHA-256, structure, declared triangle count, materials, and declared local POSITION bounds. Metadata-only; does not render, decode compressed geometry, or certify full glTF conformance.",
            inputSchema,
        },
        async ({ url }) => {
            try {
                return response(await inspect(url));
            } catch (e) {
                return { isError: true, ...response({ error: e.message }) };
            }
        },
    );
    server.registerTool(
        "validate_glb",
        {
            description:
                "Check GLB container and structural references against optional mesh, triangle, file-size, material and self-containment requirements. Returns pass/fail with exact violations. Does not certify visual quality or full Khronos glTF conformance.",
            inputSchema: validationSchema,
        },
        async ({
            url,
            max_triangles,
            max_meshes,
            max_file_bytes,
            require_materials,
            require_self_contained,
        }) => {
            try {
                const report = await inspect(url);
                const violations = [...report.errors];
                if (
                    max_triangles !== undefined &&
                    !report.summary.triangleCountComplete
                ) {
                    violations.push(
                        "Triangle count is incomplete; cannot certify max_triangles.",
                    );
                }
                if (
                    max_triangles !== undefined &&
                    report.summary.triangles > max_triangles
                ) {
                    violations.push(
                        `Triangle count exceeds max_triangles (${max_triangles}).`,
                    );
                }
                if (
                    max_meshes !== undefined &&
                    report.summary.meshes > max_meshes
                ) {
                    violations.push(
                        `Mesh count exceeds max_meshes (${max_meshes}).`,
                    );
                }
                if (
                    max_file_bytes !== undefined &&
                    report.fileBytes > max_file_bytes
                ) {
                    violations.push(
                        `Asset exceeds max_file_bytes (${max_file_bytes}).`,
                    );
                }
                if (require_materials && report.summary.materials === 0) {
                    violations.push("Asset contains no materials.");
                }
                if (require_self_contained !== false && !report.selfContained) {
                    violations.push("Asset depends on external resources.");
                }
                return response({
                    passed: violations.length === 0,
                    violations,
                    ...report,
                });
            } catch (e) {
                return { isError: true, ...response({ error: e.message }) };
            }
        },
    );
    return server;
}

const handler = createMcpHandler(() => registerServer(), {
    legacy: "stateless",
    onerror: (error) => console.error(error),
});

export default {
    async fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === "/health" && request.method === "GET") {
            return Response.json({
                name: "glb-inspector-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }
        if (path !== "/") return new Response("Not found", { status: 404 });
        const auth = request.headers
            .get("authorization")
            ?.trim()
            .match(/^Bearer\s+(\S+)$/i);
        if (!auth) {
            return Response.json(
                {
                    error: "unauthorized",
                    message: "Send a Pollinations API key as a bearer token.",
                },
                {
                    status: 401,
                    headers: {
                        "WWW-Authenticate":
                            'Bearer realm="glb-inspector-mcp.pollinations.ai"',
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
        return handler.fetch(request, {
            authInfo: {
                token: auth[1],
                clientId: "pollinations-api-key",
                scopes: [],
            },
        });
    },
};
