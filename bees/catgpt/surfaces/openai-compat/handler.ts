// OpenAI-compatible chat completions surface for CatGPT.
//
// Lets any OpenAI client point at this and use `model: "catgpt"`. Mirrors the
// Polly registry pattern (shared/registry/text.ts:861) — same idea, packaged as
// a standalone surface adapter so any bee can opt in.
//
// Two response shapes:
//   - non-streaming: a single OpenAI ChatCompletion object
//   - streaming:     SSE chunks shaped like OpenAI's `chat.completion.chunk`
//
// Image is exposed as a custom `metadata.comic_url` field on the assistant
// message — non-standard but harmless to clients that ignore it. A future
// variant could emit a tool call instead.

import {
    buildComicImageUrl,
    CAT_SYSTEM,
    errorResponse,
    generateCatReplyWithUsage,
    type ModelUsageWithCost,
    UpstreamError,
    unavailableResponse,
    upstreamErrorResponse,
} from "../../core/index.ts";

type ChatMessage = {
    role: "system" | "user" | "assistant";
    content:
        | string
        | Array<{ type: string; text?: string; image_url?: { url: string } }>;
};

type ChatCompletionRequest = {
    model: string;
    messages: ChatMessage[];
    stream?: boolean;
};

function pickQuestionAndImage(messages: ChatMessage[]): {
    question: string;
    imageUrl: string | null;
} {
    // The most recent user turn defines the question. Image (if any) comes from
    // the same turn's content blocks.
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return { question: "", imageUrl: null };

    if (typeof lastUser.content === "string") {
        return { question: lastUser.content, imageUrl: null };
    }

    let question = "";
    let imageUrl: string | null = null;
    for (const block of lastUser.content) {
        if (block.type === "text" && block.text) question += block.text;
        if (block.type === "image_url" && block.image_url?.url)
            imageUrl = block.image_url.url;
    }
    return { question, imageUrl };
}

function completionId(): string {
    return `chatcmpl-${Math.random().toString(36).slice(2, 12)}`;
}

function nonStreamingResponse(
    reply: string,
    comicUrl: string,
    usage: ModelUsageWithCost | null,
) {
    return {
        id: completionId(),
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "catgpt",
        choices: [
            {
                index: 0,
                message: {
                    role: "assistant",
                    content: reply,
                    // Non-standard but the natural place for it.
                    metadata: {
                        comic_url: comicUrl,
                        system: CAT_SYSTEM.split("\n")[0],
                    },
                },
                finish_reason: "stop",
            },
        ],
        usage: usage
            ? {
                  prompt_tokens: usage.prompt_tokens,
                  completion_tokens: usage.completion_tokens,
                  total_tokens: usage.prompt_tokens + usage.completion_tokens,
                  // Non-standard cost-attribution fields. The platform reads
                  // these to bill in pollen; OpenAI clients ignore them.
                  cost_pollen: usage.cost_pollen,
                  cost_dollars: usage.cost_dollars,
                  cost_model: usage.model,
                  cost_estimated: usage.estimated,
              }
            : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
}

function* streamingChunks(
    reply: string,
    comicUrl: string,
    usage: ModelUsageWithCost | null,
): Generator<string> {
    const id = completionId();
    const created = Math.floor(Date.now() / 1000);
    const base = {
        id,
        object: "chat.completion.chunk",
        created,
        model: "catgpt",
    };

    // First chunk: role.
    yield `data: ${JSON.stringify({
        ...base,
        choices: [
            { index: 0, delta: { role: "assistant" }, finish_reason: null },
        ],
    })}\n\n`;

    // Stream the reply word-by-word — CatGPT replies are 2–8 words so this is
    // honest, not theatrical.
    const words = reply.split(/(\s+)/);
    for (const word of words) {
        if (!word) continue;
        yield `data: ${JSON.stringify({
            ...base,
            choices: [
                { index: 0, delta: { content: word }, finish_reason: null },
            ],
        })}\n\n`;
    }

    // Final chunk with comic_url in metadata + stop reason.
    yield `data: ${JSON.stringify({
        ...base,
        choices: [
            {
                index: 0,
                delta: { metadata: { comic_url: comicUrl } },
                finish_reason: "stop",
            },
        ],
    })}\n\n`;

    // Usage chunk — matches OpenAI's `stream_options: { include_usage: true }`
    // shape. Always emitted; clients that don't care can ignore.
    if (usage) {
        yield `data: ${JSON.stringify({
            ...base,
            choices: [],
            usage: {
                prompt_tokens: usage.prompt_tokens,
                completion_tokens: usage.completion_tokens,
                total_tokens: usage.prompt_tokens + usage.completion_tokens,
                cost_pollen: usage.cost_pollen,
                cost_dollars: usage.cost_dollars,
                cost_model: usage.model,
                cost_estimated: usage.estimated,
            },
        })}\n\n`;
    }

    yield "data: [DONE]\n\n";
}

// errorResponse, upstreamErrorResponse, unavailableResponse all live in
// core/errors.ts now. Three surfaces share them — keeping them centralized
// stops the codes/hints from drifting across handlers.

// GET / — discovery. Returns enough JSON for a caller to paste this URL
// into a browser, see what the bee serves, and copy a working curl.
//
// Shape matches the friction-research B3 recommendation: `endpoints` map +
// `auth` state + a copyable `try` curl. Cheap to serve, single biggest
// discoverability win for any deployed bee.
function discoveryResponse(baseUrl: string) {
    return Response.json({
        name: "CatGPT",
        description:
            "Aloof sarcastic cat that answers in 2-8 words and renders the exchange as a webcomic.",
        endpoints: {
            chat: `${baseUrl}/v1/chat/completions`,
            web: `${baseUrl}/web/messages`,
            a2a: `${baseUrl}/a2a`,
            agent_card: `${baseUrl}/.well-known/agent-card.json`,
        },
        auth: "optional_pk",
        try: `curl -X POST ${baseUrl}/v1/chat/completions -H 'content-type: application/json' -d '{"messages":[{"role":"user","content":"why?"}]}'`,
    });
}

export async function handleChatCompletions(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // Discovery: GET / or GET /v1/chat/completions both serve the discovery
    // doc. The latter exists so OpenAI clients that probe with GET don't get
    // a 405 and can see what they should be POSTing.
    if (req.method === "GET") {
        return discoveryResponse(`${url.protocol}//${url.host}`);
    }

    if (req.method !== "POST") {
        return errorResponse(
            405,
            "method_not_allowed",
            `${req.method} is not supported on ${url.pathname}`,
            "use POST for chat completions or GET / for discovery",
        );
    }

    let body: ChatCompletionRequest | null;
    try {
        body = (await req.json()) as ChatCompletionRequest;
    } catch {
        return errorResponse(
            400,
            "invalid_json",
            "request body is not valid JSON",
            'send a JSON body like {"messages":[{"role":"user","content":"hi"}]}',
        );
    }

    if (!body || typeof body !== "object") {
        return errorResponse(
            400,
            "invalid_request",
            "request body must be a JSON object",
            'send {"messages":[{"role":"user","content":"hi"}]}',
        );
    }

    if (!Array.isArray(body.messages)) {
        return errorResponse(
            400,
            "missing_messages",
            "`messages` is required and must be an array",
            'send {"messages":[{"role":"user","content":"hi"}]}',
        );
    }

    if (body.messages.length === 0) {
        return errorResponse(
            400,
            "empty_messages",
            "`messages` must contain at least one entry",
            'send {"messages":[{"role":"user","content":"hi"}]}',
        );
    }

    const auth = req.headers.get("authorization");
    const apiKey = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;

    const { question, imageUrl } = pickQuestionAndImage(body.messages);
    if (!question && !imageUrl) {
        // No user turn (e.g. caller sent only a system or assistant message).
        // The OpenAI shape allows it; the bee can't act on it. Surface this
        // as a structured 400 rather than silently producing an empty reply.
        return errorResponse(
            400,
            "no_user_message",
            "messages must contain at least one user turn with text or image content",
            'add {"role":"user","content":"<your prompt>"} to messages',
        );
    }

    let reply: string;
    let usage: ModelUsageWithCost | null;
    try {
        const result = await generateCatReplyWithUsage(question, imageUrl, {
            apiKey,
        });
        reply = result.text;
        usage = result.usage;
    } catch (err) {
        // Translate upstream HTTP errors to structured responses with the
        // upstream status preserved verbatim. Caller sees 401 for an auth
        // problem at the model provider, not a generic 500. Anything else
        // (network failure, malformed JSON from upstream) becomes 502 with
        // a hint to retry. Mirrors the friction-research B5 contract: never
        // leak stack traces; always {error: {code, message, hint}}.
        if (err instanceof UpstreamError) {
            return upstreamErrorResponse(err);
        }
        return unavailableResponse();
    }
    const comicUrl = buildComicImageUrl(question, reply, imageUrl, { apiKey });

    if (body.stream) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            start(controller) {
                for (const chunk of streamingChunks(reply, comicUrl, usage)) {
                    controller.enqueue(encoder.encode(chunk));
                }
                controller.close();
            },
        });
        return new Response(stream, {
            headers: {
                "content-type": "text/event-stream",
                "cache-control": "no-cache",
                connection: "keep-alive",
            },
        });
    }

    return Response.json(nonStreamingResponse(reply, comicUrl, usage));
}

export default { fetch: handleChatCompletions };
