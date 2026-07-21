import {
    type AuthenticatedApiKey,
    type AuthUser,
    authenticateApiKeyRequest,
} from "@shared/auth/api-key.ts";
import { MCP_TOOLS_SCOPE } from "@shared/auth/mcp-resource.ts";
import { getPublicOrigin } from "@shared/public-origin.ts";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "@/env.ts";
import type { AuthVariables } from "@/middleware/auth.ts";
import { getGenerationModelRegistry } from "@/model-registry.ts";
import { createMcpGenerationRoutes } from "./proxy.ts";

const JSON_RPC_VERSION = "2.0";

function isMcpOrigin(origin: string): boolean {
    return (
        origin === "https://mcp.pollinations.ai" ||
        origin === "https://staging.mcp.pollinations.ai"
    );
}

function authorizationServer(origin: string): string {
    return origin.replace(".mcp.", ".enter.");
}

function metadataUrl(resource: string): string {
    return `${resource}/.well-known/oauth-protected-resource`;
}

function bearerChallenge(resource: string, extra = ""): string {
    return `Bearer resource_metadata="${metadataUrl(resource)}", scope="${MCP_TOOLS_SCOPE}"${extra}`;
}

function jsonRpcError(id: unknown, code: number, message: string): Response {
    return Response.json({
        jsonrpc: JSON_RPC_VERSION,
        error: { code, message },
        id: id ?? null,
    });
}

function unauthorized(resource: string): Response {
    return new Response(null, {
        status: 401,
        headers: { "WWW-Authenticate": bearerChallenge(resource) },
    });
}

function forbidden(resource: string): Response {
    return new Response(null, {
        status: 403,
        headers: {
            "WWW-Authenticate": bearerChallenge(
                resource,
                ', error="insufficient_scope"',
            ),
        },
    });
}

function createAuthContext(
    user: AuthUser | undefined,
    apiKey: AuthenticatedApiKey,
): AuthVariables["auth"] {
    return {
        user,
        apiKey,
        requireAuthorization: async () => {
            if (!user) throw new HTTPException(401);
        },
        requireUser: () => {
            if (!user) throw new HTTPException(401);
            return user;
        },
        requireModelAccess: () => {},
    };
}

async function authenticateMcpRequest(
    c: Context<Env>,
    resource: string,
): Promise<AuthVariables["auth"] | Response> {
    const authorization = c.req.header("authorization");
    if (!authorization?.startsWith("Bearer ")) return unauthorized(resource);

    const result = await authenticateApiKeyRequest({
        request: c.req.raw,
        env: c.env,
        ctx: c.executionCtx,
    });
    if (!result?.apiKey || !result.user) return unauthorized(resource);

    const metadata = result.apiKey.metadata;
    const scopes = metadata?.oauthScopes;
    if (
        metadata?.oauthResource !== resource ||
        !Array.isArray(scopes) ||
        !scopes.includes(MCP_TOOLS_SCOPE)
    ) {
        return forbidden(resource);
    }
    return createAuthContext(result.user, result.apiKey);
}

function asBase64(buffer: ArrayBuffer): string {
    return Buffer.from(buffer).toString("base64");
}

function toolResult(content: unknown[]) {
    return { content };
}

async function callChat(
    c: Context<Env>,
    auth: AuthVariables["auth"],
    arguments_: Record<string, unknown>,
) {
    const router = createMcpGenerationRoutes(auth, c);
    const response = await router.fetch(
        new Request("https://mcp.internal/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(arguments_),
        }),
        c.env,
        c.executionCtx,
    );
    if (!response.ok) throw new Error(await response.text());
    return toolResult([
        { type: "text", text: JSON.stringify(await response.json(), null, 2) },
    ]);
}

async function callMedia(
    c: Context<Env>,
    auth: AuthVariables["auth"],
    kind: "image" | "video",
    arguments_: Record<string, unknown>,
) {
    const { prompt, ...params } = arguments_;
    if (typeof prompt !== "string" || !prompt) {
        throw new Error("prompt is required");
    }
    const url = new URL(
        `https://mcp.internal/${kind}/${encodeURIComponent(prompt)}`,
    );
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            url.searchParams.set(
                key,
                Array.isArray(value) ? value.join("|") : String(value),
            );
        }
    }
    const router = createMcpGenerationRoutes(auth, c);
    const response = await router.fetch(
        new Request(url),
        c.env,
        c.executionCtx,
    );
    if (!response.ok) throw new Error(await response.text());
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith(`${kind}/`)) {
        throw new Error(`Expected ${kind} response, received ${contentType}`);
    }
    const data = asBase64(await response.arrayBuffer());
    return toolResult(
        kind === "image"
            ? [{ type: "image", data, mimeType: contentType }]
            : [
                  {
                      type: "resource",
                      resource: {
                          uri: `pollinations://video/${crypto.randomUUID()}`,
                          mimeType: contentType,
                          blob: data,
                      },
                  },
              ],
    );
}

const TOOLS = [
    {
        name: "chatCompletion",
        description: "Run an OpenAI-compatible chat completion through Gen.",
        inputSchema: {
            type: "object",
            required: ["messages"],
            properties: { messages: { type: "array" }, model: { type: "string" } },
        },
    },
    {
        name: "generateImage",
        description: "Generate an image and return inline MCP image content.",
        inputSchema: {
            type: "object",
            required: ["prompt"],
            properties: { prompt: { type: "string" }, model: { type: "string" } },
        },
    },
    {
        name: "generateVideo",
        description: "Generate a video and return inline MCP resource content.",
        inputSchema: {
            type: "object",
            required: ["prompt", "model"],
            properties: { prompt: { type: "string" }, model: { type: "string" } },
        },
    },
    {
        name: "listModels",
        description: "List the live Gen model registry.",
        inputSchema: { type: "object", properties: {} },
    },
];

export const mcpRoutes = new Hono<Env>()
    .get("/.well-known/oauth-protected-resource", (c) => {
        const resource = getPublicOrigin(c);
        if (!isMcpOrigin(resource)) return c.notFound();

        c.header("Cache-Control", "public, max-age=3600");
        return c.json({
            resource,
            authorization_servers: [authorizationServer(resource)],
            bearer_methods_supported: ["header"],
            scopes_supported: [MCP_TOOLS_SCOPE],
        });
    })
    .post("/", async (c) => {
        const resource = getPublicOrigin(c);
        if (!isMcpOrigin(resource)) return c.notFound();
        const auth = await authenticateMcpRequest(c, resource);
        if (auth instanceof Response) return auth;

        const contentType = c.req.header("content-type") || "";
        const accept = c.req.header("accept") || "";
        if (!contentType.includes("application/json")) {
            return new Response(null, { status: 415 });
        }
        if (
            accept &&
            !accept.includes("application/json") &&
            !accept.includes("text/event-stream") &&
            !accept.includes("*/*")
        ) {
            return new Response(null, { status: 406 });
        }

        const message = await c.req.json<{
            jsonrpc?: string;
            id?: unknown;
            method?: string;
            params?: Record<string, unknown>;
        }>();
        if (message.jsonrpc !== JSON_RPC_VERSION || !message.method) {
            return jsonRpcError(message.id, -32600, "Invalid Request");
        }
        if (message.method === "initialize") {
            return c.json({
                jsonrpc: JSON_RPC_VERSION,
                id: message.id,
                result: {
                    protocolVersion: "2025-11-25",
                    capabilities: { tools: {} },
                    serverInfo: { name: "pollinations-mcp", version: "3.0.0" },
                },
            });
        }
        if (message.method === "notifications/initialized") {
            return new Response(null, { status: 202 });
        }
        if (message.method === "tools/list") {
            return c.json({
                jsonrpc: JSON_RPC_VERSION,
                id: message.id,
                result: { tools: TOOLS },
            });
        }
        if (message.method !== "tools/call") {
            return jsonRpcError(message.id, -32601, "Method not found");
        }

        const name = message.params?.name;
        const arguments_ = message.params?.arguments;
        if (typeof name !== "string" || !arguments_ || typeof arguments_ !== "object") {
            return jsonRpcError(message.id, -32602, "Invalid tool arguments");
        }
        try {
            let result: unknown;
            if (name === "chatCompletion") {
                result = await callChat(c, auth, arguments_);
            } else if (name === "generateImage" || name === "generateVideo") {
                result = await callMedia(
                    c,
                    auth,
                    name === "generateImage" ? "image" : "video",
                    arguments_,
                );
            } else if (name === "listModels") {
                const registry = await getGenerationModelRegistry(c.env);
                const allowedModels = auth.apiKey?.permissions?.models;
                result = toolResult([
                    {
                        type: "text",
                        text: JSON.stringify(
                            registry
                                .visibleEntries(auth.user?.id)
                                .filter(
                                    (entry) =>
                                        !allowedModels ||
                                        allowedModels.includes(entry.id),
                                ),
                            null,
                            2,
                        ),
                    },
                ]);
            } else {
                return jsonRpcError(message.id, -32602, "Unknown tool");
            }
            return c.json({ jsonrpc: JSON_RPC_VERSION, id: message.id, result });
        } catch (error) {
            return c.json({
                jsonrpc: JSON_RPC_VERSION,
                id: message.id,
                result: toolResult([
                    {
                        type: "text",
                        text: error instanceof Error ? error.message : "Generation failed",
                    },
                ]),
            });
        }
    });
