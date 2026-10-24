/**
 * Agent2Agent (A2A) protocol surface — https://a2a-protocol.org/latest/specification/
 *
 *   GET /.well-known/agent-card.json — the A2A v1.0 AgentCard that clients
 *                                      fetch to discover the agent.
 *   POST /a2a                         — the JSON-RPC 2.0 binding the card
 *                                      advertises (protocolBinding "JSONRPC").
 *
 * Each SendMessage runs as a Chat Completions or Images request through the
 * whole app, so auth, balance, rate limits, caching, deduplication, tracking
 * and billing are exactly those of the REST API. The agent answers with a
 * direct Message instead of a Task: a generation is one turn and the worker
 * keeps no state between requests, matching the hosted MCP server.
 */
import { getPublicOrigin } from "@shared/public-origin.ts";
import { type Context, Hono } from "hono";
import { etag } from "hono/etag";
import type { Env } from "@/env.ts";
import { textBodyLimit } from "./generation-handlers.ts";

type Dispatch = (
    request: Request,
    c: Context<Env>,
) => Response | Promise<Response>;

// JSON-RPC 2.0 standard error codes.
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;
// JSON-RPC reserves -32000..-32099 for server errors; upstream generation
// failures (402 balance, 429 rate limit, provider errors) report there.
const SERVER_ERROR = -32000;

type RpcId = string | number | null;

function rpcResponse(
    id: RpcId,
    body: Record<string, unknown>,
    status = 200,
): Response {
    return new Response(JSON.stringify({ jsonrpc: "2.0", id, ...body }), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8" },
    });
}

function rpcError(
    id: RpcId,
    code: number,
    message: string,
    status = 200,
): Response {
    return rpcResponse(id, { error: { code, message } }, status);
}

async function upstreamErrorMessage(response: Response): Promise<string> {
    const text = await response.text();
    try {
        const parsed = JSON.parse(text) as {
            error?: { message?: string };
            message?: string;
        };
        return parsed.error?.message ?? parsed.message ?? text;
    } catch {
        return text;
    }
}

// Bump when the agent's surface (skills, endpoint, protocol support) changes.
const AGENT_CARD_VERSION = "1.0.0";

function agentCard(origin: string) {
    return {
        name: "Pollinations",
        description:
            "Generate text and images through the Pollinations API. Send a prompt as an A2A message; the reply carries the completion or a stored image URL.",
        supportedInterfaces: [
            {
                url: `${origin}/a2a`,
                protocolBinding: "JSONRPC",
                protocolVersion: "1.0",
            },
        ],
        provider: {
            organization: "Pollinations",
            url: "https://pollinations.ai",
        },
        version: AGENT_CARD_VERSION,
        documentationUrl: `${origin}/docs`,
        capabilities: {
            streaming: false,
            pushNotifications: false,
            extendedAgentCard: false,
        },
        securitySchemes: {
            bearer: {
                httpAuthSecurityScheme: {
                    description:
                        "Pollinations API key, sent as Authorization: Bearer <key>. Create one at https://enter.pollinations.ai/keys",
                    scheme: "bearer",
                },
            },
        },
        securityRequirements: [{ schemes: { bearer: {} } }],
        defaultInputModes: ["text/plain"],
        defaultOutputModes: ["text/plain", "image/png"],
        skills: [
            {
                id: "text",
                name: "Generate text",
                description:
                    "Answer a prompt with a text completion from a Pollinations text model.",
                tags: ["text", "generation"],
                examples: ["Write a haiku about pollination"],
                inputModes: ["text/plain"],
                outputModes: ["text/plain"],
            },
            {
                id: "image",
                name: "Generate an image",
                description:
                    'Render the prompt as an image. Set message metadata to {"modality": "image"} to select this skill; the reply part carries the stored image URL.',
                tags: ["image", "generation"],
                examples: ["A watercolor painting of a bee on a sunflower"],
                inputModes: ["text/plain"],
                outputModes: ["image/png"],
            },
        ],
    };
}

type Part = { text: string } | { url: string; mediaType?: string };

function agentMessage(contextId: string, parts: Part[]) {
    return {
        messageId: crypto.randomUUID(),
        contextId,
        role: "ROLE_AGENT",
        parts,
    };
}

async function handleSendMessage(
    c: Context<Env>,
    dispatch: Dispatch,
    id: RpcId,
    params: Record<string, unknown>,
): Promise<Response> {
    const message = params.message;
    if (
        typeof message !== "object" ||
        message === null ||
        Array.isArray(message)
    ) {
        return rpcError(id, INVALID_PARAMS, "params.message must be an object");
    }
    const user = message as Record<string, unknown>;
    if (user.role !== "ROLE_USER") {
        return rpcError(id, INVALID_PARAMS, 'message.role must be "ROLE_USER"');
    }
    if (typeof user.messageId !== "string" || user.messageId.length === 0) {
        return rpcError(
            id,
            INVALID_PARAMS,
            "message.messageId must be a non-empty string",
        );
    }
    const parts = user.parts;
    if (!Array.isArray(parts) || parts.length === 0) {
        return rpcError(
            id,
            INVALID_PARAMS,
            "message.parts must be a non-empty array",
        );
    }
    const texts: string[] = [];
    for (const part of parts) {
        if (
            typeof part !== "object" ||
            part === null ||
            typeof (part as Record<string, unknown>).text !== "string"
        ) {
            return rpcError(
                id,
                INVALID_PARAMS,
                "message.parts must be text parts",
            );
        }
        texts.push((part as { text: string }).text);
    }
    const prompt = texts.join("\n");
    if (!prompt.trim()) {
        return rpcError(id, INVALID_PARAMS, "message.parts must contain text");
    }

    const metadata = params.metadata;
    const modality =
        typeof metadata === "object" &&
        metadata !== null &&
        !Array.isArray(metadata)
            ? (metadata as Record<string, unknown>).modality
            : undefined;
    if (modality !== undefined && modality !== "text" && modality !== "image") {
        return rpcError(
            id,
            INVALID_PARAMS,
            'metadata.modality must be "text" or "image"',
        );
    }

    const headers = new Headers(c.req.raw.headers);
    headers.delete("content-length");
    headers.set("Content-Type", "application/json");
    const path =
        modality === "image"
            ? "/v1/images/generations"
            : "/v1/chat/completions";
    const generationRequest =
        modality === "image"
            ? { prompt, n: 1, response_format: "url" }
            : { messages: [{ role: "user", content: prompt }], stream: false };

    const response = await dispatch(
        new Request(new URL(path, c.req.url), {
            method: "POST",
            headers,
            body: JSON.stringify(generationRequest),
            signal: c.req.raw.signal,
        }),
        c,
    );
    if (!response.ok) {
        // Operational failures keep their HTTP status: a 401 must stay a
        // WWW-Authenticate challenge, and 402/429 report balance and rate
        // limits the way every other client sees them.
        return rpcError(
            id,
            SERVER_ERROR,
            await upstreamErrorMessage(response),
            response.status,
        );
    }

    // A2A server messages always carry a context id; echo the client's
    // conversation or start one.
    const contextId =
        typeof user.contextId === "string" && user.contextId
            ? user.contextId
            : crypto.randomUUID();

    if (modality === "image") {
        const generated = (await response.json().catch(() => null)) as {
            data?: { url?: unknown; media_type?: unknown }[];
        } | null;
        const image = generated?.data?.[0];
        if (!image || typeof image.url !== "string") {
            return rpcError(
                id,
                INTERNAL_ERROR,
                "Upstream returned no image",
                502,
            );
        }
        const part: Part =
            typeof image.media_type === "string"
                ? { url: image.url, mediaType: image.media_type }
                : { url: image.url };
        return rpcResponse(id, {
            result: { message: agentMessage(contextId, [part]) },
        });
    }

    const completion = (await response.json().catch(() => null)) as {
        choices?: { message?: { content?: unknown } }[];
    } | null;
    const content = completion?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
        return rpcError(
            id,
            INTERNAL_ERROR,
            "Upstream returned no completion",
            502,
        );
    }
    return rpcResponse(id, {
        result: {
            message: agentMessage(contextId, [{ text: content }]),
        },
    });
}

/**
 * The AgentCard is public discovery; POST /a2a authenticates and bills
 * through the dispatched generation routes, exactly like /v1/messages.
 */
export function createA2aRoutes(dispatch: Dispatch) {
    return new Hono<Env>()
        .get("/.well-known/agent-card.json", etag(), (c) => {
            c.header("Cache-Control", "public, max-age=3600");
            return c.json(agentCard(getPublicOrigin(c)));
        })
        .post("/a2a", textBodyLimit, async (c) => {
            let payload: unknown;
            try {
                payload = await c.req.raw.json();
            } catch {
                return rpcError(null, PARSE_ERROR, "Parse error", 400);
            }
            if (
                typeof payload !== "object" ||
                payload === null ||
                Array.isArray(payload)
            ) {
                return rpcError(null, INVALID_REQUEST, "Invalid Request", 400);
            }
            const request = payload as Record<string, unknown>;
            const id = request.id;
            if (
                request.jsonrpc !== "2.0" ||
                typeof request.method !== "string" ||
                !(
                    id === null ||
                    typeof id === "string" ||
                    typeof id === "number"
                )
            ) {
                return rpcError(null, INVALID_REQUEST, "Invalid Request", 400);
            }
            const rpcId = id as RpcId;
            const method = request.method;
            if (method === "ping") {
                return rpcResponse(rpcId, { result: {} });
            }
            if (method === "SendMessage") {
                const params = request.params;
                if (
                    typeof params !== "object" ||
                    params === null ||
                    Array.isArray(params)
                ) {
                    return rpcError(
                        rpcId,
                        INVALID_PARAMS,
                        "params must be an object",
                    );
                }
                return handleSendMessage(
                    c,
                    dispatch,
                    rpcId,
                    params as Record<string, unknown>,
                );
            }
            // Tasks and streaming are unadvertised capabilities (the card
            // declares streaming: false and replies with direct messages),
            // so only the methods the agent implements are routed.
            return rpcError(
                rpcId,
                METHOD_NOT_FOUND,
                `Method not found: ${method}`,
            );
        });
}
