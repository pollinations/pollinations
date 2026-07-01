// Google A2A (Agent2Agent) surface for CatGPT.
//
// Per #10628 decisions: A2A is the v1 inter-agent protocol; MCP is dropped.
// Implements the minimum to be a discoverable + callable A2A agent:
//
//   GET  /.well-known/agent-card.json   → metadata advertising this agent
//   POST /a2a                           → JSON-RPC 2.0; method: "message/send"
//
// The agent card is a static description (capabilities, skills, endpoints).
// `message/send` is synchronous: client sends a `Message`, gets a `Task` back
// with the assistant's reply.
//
// Spec: https://google-a2a.github.io/A2A/specification/
//
// This is the "non-streaming, single-task" subset — sufficient for CatGPT.

import {
    buildComicImageUrl,
    generateCatReplyWithUsage,
    UpstreamError,
} from "../../core/index.ts";

type A2APart =
    | { kind: "text"; text: string }
    | { kind: "data"; data: Record<string, unknown> }
    | { kind: "file"; file: { uri: string; mimeType?: string } };

type A2AMessage = {
    role: "user" | "agent";
    parts: A2APart[];
    messageId?: string;
};

type JsonRpcRequest = {
    jsonrpc: "2.0";
    id: string | number | null;
    method: string;
    params?: unknown;
};

function jsonRpcResult(id: JsonRpcRequest["id"], result: unknown) {
    return Response.json({ jsonrpc: "2.0", id, result });
}

function jsonRpcError(
    id: JsonRpcRequest["id"],
    code: number,
    message: string,
    data?: unknown,
) {
    return Response.json({
        jsonrpc: "2.0",
        id,
        error: { code, message, ...(data !== undefined && { data }) },
    });
}

export function buildAgentCard(baseUrl: string) {
    return {
        protocolVersion: "0.3.0",
        name: "CatGPT",
        description:
            "Aloof sarcastic cat that answers in 2-8 words and renders the exchange as a webcomic.",
        url: `${baseUrl}/a2a`,
        version: "0.0.0",
        capabilities: { streaming: false, pushNotifications: false },
        defaultInputModes: ["text/plain"],
        defaultOutputModes: ["text/plain", "application/json"],
        skills: [
            {
                id: "ask",
                name: "ask",
                description:
                    "Ask the cat a question. Returns a 2-8 word reply and a comic URL.",
                tags: ["chat", "humor"],
                examples: [
                    "Why are boxes magic?",
                    "What's the meaning of life?",
                    "Will AI take my job?",
                ],
            },
        ],
    };
}

function pickQuestion(message: A2AMessage): {
    question: string;
    imageUrl: string | null;
} {
    let question = "";
    let imageUrl: string | null = null;
    for (const part of message.parts ?? []) {
        if (part.kind === "text") question += part.text;
        if (part.kind === "file" && part.file?.uri) imageUrl = part.file.uri;
    }
    return { question: question.trim(), imageUrl };
}

// Map upstream HTTP error class to JSON-RPC error code + the same
// {code, message, hint} vocabulary used by the HTTP surfaces. Keeps the
// taxonomy consistent across surfaces — a JSON-RPC client and a REST
// client see the same `code` strings, just wrapped in different envelopes.
function upstreamErrorDetail(err: UpstreamError): {
    rpcCode: number;
    code: string;
    message: string;
    hint: string;
} {
    if (err.status === 401 || err.status === 403) {
        return {
            rpcCode: -32001,
            code: "upstream_auth_failed",
            message: "model provider rejected the request's credentials",
            hint: "set Authorization: Bearer <pk_*> with a valid key from https://enter.pollinations.ai",
        };
    }
    if (err.status === 402) {
        return {
            rpcCode: -32002,
            code: "insufficient_pollen",
            message: "the configured key is out of pollen for this model",
            hint: "top up at https://enter.pollinations.ai or use a key with a higher daily limit",
        };
    }
    if (err.status === 429) {
        return {
            rpcCode: -32003,
            code: "upstream_rate_limited",
            message: "model provider is rate-limiting this key",
            hint: err.retryAfter
                ? `back off and retry; upstream said Retry-After: ${err.retryAfter}`
                : "back off and retry",
        };
    }
    return {
        rpcCode: -32099,
        code: "upstream_error",
        message: `model provider returned ${err.status}`,
        hint: err.body || "see upstream response for details",
    };
}

async function handleMessageSend(
    id: JsonRpcRequest["id"],
    params: unknown,
    apiKey: string | undefined,
): Promise<Response> {
    const p = params as { message?: A2AMessage } | null;
    const message = p?.message;
    if (!message || !Array.isArray(message.parts)) {
        return jsonRpcError(
            id,
            -32602,
            "invalid params: missing message.parts",
        );
    }

    const { question, imageUrl } = pickQuestion(message);
    if (!question) {
        return jsonRpcError(id, -32602, "invalid params: empty question");
    }

    let reply: string;
    let usage: Awaited<ReturnType<typeof generateCatReplyWithUsage>>["usage"];
    try {
        const result = await generateCatReplyWithUsage(question, imageUrl, {
            apiKey,
        });
        reply = result.text;
        usage = result.usage;
    } catch (err) {
        // JSON-RPC has its own error code space. Map the same upstream-class
        // semantics from core/errors.ts to JSON-RPC error codes:
        //   -32001 = upstream auth failed (server-defined, like a custom HTTP 401)
        //   -32002 = insufficient pollen
        //   -32003 = upstream rate limited
        //   -32099 = generic upstream error
        // The `data` field carries the structured detail so a JSON-RPC client
        // that knows about us can read code/hint just like other surfaces.
        if (err instanceof UpstreamError) {
            const detail = upstreamErrorDetail(err);
            return jsonRpcError(id, detail.rpcCode, detail.message, {
                code: detail.code,
                hint: detail.hint,
                upstreamStatus: err.status,
                ...(err.retryAfter && { retryAfter: err.retryAfter }),
            });
        }
        return jsonRpcError(id, -32099, "upstream unavailable", {
            code: "upstream_unavailable",
            hint: "retry in a few seconds; check https://gen.pollinations.ai/docs",
        });
    }
    const comicUrl = buildComicImageUrl(question, reply, imageUrl, { apiKey });

    // Spec shape: a `Task` with a single completed message in its history.
    // We attach `comic_url` and `usage` (with cost) as a `data` part — A2A
    // clients that don't care can ignore it.
    const taskId = `task-${Math.random().toString(36).slice(2, 12)}`;
    return jsonRpcResult(id, {
        kind: "task",
        id: taskId,
        contextId: taskId,
        status: { state: "completed" },
        history: [
            message,
            {
                role: "agent",
                messageId: `msg-${Math.random().toString(36).slice(2, 12)}`,
                parts: [
                    { kind: "text", text: reply },
                    {
                        kind: "data",
                        data: { comic_url: comicUrl, usage },
                    },
                ],
            },
        ],
    });
}

export async function handleAgentCard(
    req: Request,
    baseUrl?: string,
): Promise<Response> {
    if (req.method !== "GET")
        return new Response("method not allowed", { status: 405 });
    const url = baseUrl ?? new URL(req.url).origin;
    return Response.json(buildAgentCard(url));
}

export async function handleA2A(req: Request): Promise<Response> {
    if (req.method !== "POST")
        return new Response("method not allowed", { status: 405 });

    const body = (await req.json().catch(() => null)) as JsonRpcRequest | null;
    if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
        return jsonRpcError(
            body?.id ?? null,
            -32600,
            "invalid jsonrpc 2.0 request",
        );
    }

    const auth = req.headers.get("authorization");
    const apiKey = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;

    if (body.method === "message/send") {
        return handleMessageSend(body.id, body.params, apiKey);
    }

    return jsonRpcError(body.id, -32601, `method not found: ${body.method}`);
}

// Combined router for the two endpoints. Mountable into any HTTP host.
export async function handleA2ARequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/.well-known/agent-card.json") {
        return handleAgentCard(req, url.origin);
    }
    if (url.pathname === "/a2a") {
        return handleA2A(req);
    }
    return new Response("not found", { status: 404 });
}

export default { fetch: handleA2ARequest };
