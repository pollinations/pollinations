import { Agent, getAgentByName } from "agents";

type BeeState = {
    turns: number;
};

const BEE_MODEL = "minimal-cloudflare-agents-bee";

function json(data: unknown, init: ResponseInit = {}): Response {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json; charset=utf-8");
    return new Response(JSON.stringify(data), { ...init, headers });
}

function errorResponse(
    status: number,
    code: string,
    message: string,
    hint: string,
): Response {
    return json({ error: { code, message, hint } }, { status });
}

function discovery(origin: string) {
    return {
        name: "Minimal Cloudflare Bee",
        description:
            "Stateful Cloudflare Agents SDK bee with OpenAI-compatible chat.",
        endpoints: {
            openai: `${origin}/v1/chat/completions`,
            web: `${origin}/web/messages`,
            a2a: `${origin}/a2a`,
            agentCard: `${origin}/.well-known/agent-card.json`,
        },
        auth: {
            required: false,
            note: "Reference bee only. Production deployments should validate Pollinations keys before invocation.",
        },
        try: `curl -X POST ${origin}/v1/chat/completions -H 'content-type: application/json' --data '{"model":"bee:minimal-cloudflare","messages":[{"role":"user","content":"hello"}]}'`,
    };
}

function card(origin: string) {
    return {
        protocolVersion: "0.3.0",
        name: "Minimal Cloudflare Bee",
        description: "Cloudflare Agents SDK reference bee.",
        url: `${origin}/a2a`,
        preferredTransport: "JSONRPC",
        defaultInputModes: ["text/plain"],
        defaultOutputModes: ["text/plain"],
        capabilities: { streaming: false },
        skills: [
            {
                id: "reply",
                name: "Reply",
                description: "Echoes a message and persists turn count.",
                tags: ["minimal", "cloudflare"],
            },
        ],
    };
}

async function readJson(request: Request): Promise<unknown> {
    try {
        const body = await request.text();
        return body ? JSON.parse(body) : undefined;
    } catch {
        return undefined;
    }
}

function readText(body: unknown): string {
    if (!body || typeof body !== "object") return "";
    const value = body as {
        text?: string;
        message?: { parts?: Array<{ text?: string }> };
        params?: { message?: { parts?: Array<{ text?: string }> } };
    };
    return (
        value.text ??
        value.message?.parts?.find((part) => part.text)?.text ??
        value.params?.message?.parts?.find((part) => part.text)?.text ??
        ""
    );
}

function contentToText(content: unknown): string {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    return content
        .map((part) => {
            const value = part as { text?: unknown };
            return typeof value.text === "string" ? value.text : "";
        })
        .filter(Boolean)
        .join("\n");
}

function lastUserText(messages: unknown): string {
    if (!Array.isArray(messages)) return "";
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index] as
            | { role?: unknown; content?: unknown }
            | undefined;
        if (message?.role === "user") return contentToText(message.content);
    }
    return "";
}

function validateChatBody(
    body: unknown,
):
    | { ok: true; model?: string; text: string }
    | { ok: false; response: Response } {
    if (!body || typeof body !== "object") {
        return {
            ok: false,
            response: errorResponse(
                400,
                "invalid_json",
                "Request body must be valid JSON.",
                'Send {"model":"bee:minimal-cloudflare","messages":[{"role":"user","content":"hello"}]}.',
            ),
        };
    }

    const value = body as {
        model?: unknown;
        messages?: unknown;
        stream?: unknown;
    };
    if (value.stream === true) {
        return {
            ok: false,
            response: errorResponse(
                400,
                "streaming_not_supported",
                "This minimal bee returns one JSON response and does not stream.",
                "Retry without stream:true, or deploy a bee that implements SSE streaming.",
            ),
        };
    }
    if (!Array.isArray(value.messages)) {
        return {
            ok: false,
            response: errorResponse(
                400,
                "missing_messages",
                "OpenAI chat requests require a messages array.",
                'Add messages:[{"role":"user","content":"hello"}].',
            ),
        };
    }
    if (value.messages.length === 0) {
        return {
            ok: false,
            response: errorResponse(
                400,
                "empty_messages",
                "The messages array must contain at least one user message.",
                'Add {"role":"user","content":"hello"} to messages.',
            ),
        };
    }

    const text = lastUserText(value.messages).trim();
    if (!text) {
        return {
            ok: false,
            response: errorResponse(
                400,
                "no_user_message",
                "No user message with text content was found.",
                'Send a message like {"role":"user","content":"hello"}.',
            ),
        };
    }

    return {
        ok: true,
        model: typeof value.model === "string" ? value.model : undefined,
        text,
    };
}

function validateReferenceAuth(request: Request): Response | undefined {
    const authorization = request.headers.get("authorization");
    if (!authorization) return undefined;
    if (/^Bearer\s+(sk_|pk_)/.test(authorization)) return undefined;
    return errorResponse(
        401,
        "invalid_api_key",
        "Authorization must be a Pollinations pk_ or sk_ bearer token.",
        "Remove the Authorization header for this unauthenticated reference bee, or pass a valid Pollinations key.",
    );
}

function chatCompletion(
    reply: { text: string; state: BeeState },
    model = BEE_MODEL,
) {
    return {
        id: `chatcmpl_minimal_cf_${reply.state.turns}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
            {
                index: 0,
                message: { role: "assistant", content: reply.text },
                finish_reason: "stop",
            },
        ],
        metadata: { state: reply.state },
    };
}

export class MinimalCloudflareBee extends Agent<Env, BeeState> {
    initialState = { turns: 0 };

    reply(text: string) {
        const next = { turns: this.state.turns + 1 };
        this.setState(next);

        return {
            text: `Cloudflare bee turn ${next.turns}: ${text}`,
            state: next,
        };
    }

    async onRequest(request: Request): Promise<Response> {
        const url = new URL(request.url);
        if (
            request.method === "GET" &&
            (url.pathname === "/" || url.pathname === "/v1/chat/completions")
        ) {
            return json(discovery(url.origin));
        }

        if (
            request.method === "GET" &&
            url.pathname === "/.well-known/agent-card.json"
        ) {
            return json(card(url.origin));
        }

        if (
            request.method === "POST" &&
            (url.pathname === "/message" || url.pathname === "/web/messages")
        ) {
            return json(this.reply(readText(await readJson(request))));
        }

        if (
            request.method === "POST" &&
            url.pathname === "/v1/chat/completions"
        ) {
            const authError = validateReferenceAuth(request);
            if (authError) return authError;

            const validation = validateChatBody(await readJson(request));
            if (!validation.ok) return validation.response;

            return json(
                chatCompletion(this.reply(validation.text), validation.model),
            );
        }

        if (request.method === "POST" && url.pathname === "/a2a") {
            const body = await readJson(request);
            const value = (body && typeof body === "object" ? body : {}) as {
                id?: string | number | null;
                params?: { message?: { parts?: Array<{ text?: string }> } };
            };
            const text =
                value.params?.message?.parts?.find((part) => part.text)?.text ??
                "";
            const reply = this.reply(text);
            return json({
                jsonrpc: "2.0",
                id: value.id ?? null,
                result: {
                    message: {
                        role: "agent",
                        parts: [{ kind: "text", text: reply.text }],
                    },
                    metadata: { state: reply.state },
                },
            });
        }

        return json({ error: "Not found" }, { status: 404 });
    }
}

export default {
    async fetch(request: Request, env: Env) {
        const agent = await getAgentByName(env.MinimalCloudflareBee, "default");
        return agent.fetch(request);
    },
};
