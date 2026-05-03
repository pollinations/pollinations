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

import { buildComicImageUrl, generateCatReply } from "../../core/index.ts";

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
        protocolVersion: "0.2.5",
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

    const reply = await generateCatReply(question, imageUrl, { apiKey });
    const comicUrl = buildComicImageUrl(question, reply, imageUrl, { apiKey });

    // Spec shape: a `Task` with a single completed message in its history.
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
                    { kind: "data", data: { comic_url: comicUrl } },
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
