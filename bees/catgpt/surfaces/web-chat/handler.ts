// Plain SSE web chat surface. Mountable into any HTTP host.
//
// Two endpoints:
//   POST /chat               → non-streaming, single turn → JSON
//                               { reply, comicUrl, usage? }
//   POST /chat?stream=1      → SSE; events:
//     event: reply  data: {"text":"..."}        (one per word)
//     event: comic  data: {"url":"https://..."}
//     event: usage  data: {"prompt_tokens":..,"completion_tokens":..,
//                          "cost_pollen":..}    (one before done)
//     event: done   data: {}
//
// This is the simplest streaming surface: no Vercel useChat wire format, no
// agent SDK conventions — just SSE the browser can read with EventSource.
//
// On top of `core/`. State: none (this surface is stateless; per-user state
// lives in the runtime above, see manifest state.scope).

import {
    buildComicImageUrl,
    errorResponse,
    generateCatReplyWithUsage,
    UpstreamError,
    unavailableResponse,
    upstreamErrorResponse,
} from "../../core/index.ts";

type ChatRequest = {
    question?: string;
    imageUrl?: string;
};

function sseEvent(event: string, data: unknown): string {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function handleChatRequest(req: Request): Promise<Response> {
    if (req.method !== "POST") {
        return errorResponse(
            405,
            "method_not_allowed",
            `${req.method} is not supported on this endpoint`,
            "use POST with a JSON body containing `question`",
        );
    }

    const url = new URL(req.url);
    const stream = url.searchParams.get("stream") === "1";

    let body: ChatRequest | null;
    try {
        body = (await req.json()) as ChatRequest;
    } catch {
        return errorResponse(
            400,
            "invalid_json",
            "request body is not valid JSON",
            'send a JSON body like {"question":"why?"}',
        );
    }
    if (!body?.question) {
        return errorResponse(
            400,
            "missing_question",
            "`question` is required",
            'send {"question":"why?"} (optionally with imageUrl)',
        );
    }

    const auth = req.headers.get("authorization");
    const apiKey = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;

    let reply: string;
    let usage: Awaited<ReturnType<typeof generateCatReplyWithUsage>>["usage"];
    try {
        const result = await generateCatReplyWithUsage(
            body.question,
            body.imageUrl ?? null,
            { apiKey },
        );
        reply = result.text;
        usage = result.usage;
    } catch (err) {
        if (err instanceof UpstreamError) {
            return upstreamErrorResponse(err);
        }
        return unavailableResponse();
    }
    const comicUrl = buildComicImageUrl(
        body.question,
        reply,
        body.imageUrl ?? null,
        { apiKey },
    );

    if (!stream) {
        return Response.json({ reply, comicUrl, usage });
    }

    const encoder = new TextEncoder();
    const sse = new ReadableStream({
        start(controller) {
            // Word-by-word streaming. Honest for CatGPT's 2–8 word replies.
            for (const word of reply.split(/(\s+)/)) {
                if (!word) continue;
                controller.enqueue(
                    encoder.encode(sseEvent("reply", { text: word })),
                );
            }
            controller.enqueue(
                encoder.encode(sseEvent("comic", { url: comicUrl })),
            );
            if (usage) {
                controller.enqueue(encoder.encode(sseEvent("usage", usage)));
            }
            controller.enqueue(encoder.encode(sseEvent("done", {})));
            controller.close();
        },
    });

    return new Response(sse, {
        headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
        },
    });
}

export default { fetch: handleChatRequest };
