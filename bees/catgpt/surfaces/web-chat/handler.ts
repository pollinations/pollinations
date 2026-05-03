// Plain SSE web chat surface. Mountable into any HTTP host.
//
// Two endpoints:
//   POST /chat               → non-streaming, single turn → JSON
//   POST /chat?stream=1      → SSE; events:
//     event: reply  data: {"text":"..."}        (one per word)
//     event: comic  data: {"url":"https://..."}
//     event: done   data: {}
//
// This is the simplest streaming surface: no Vercel useChat wire format, no
// agent SDK conventions — just SSE the browser can read with EventSource.
//
// On top of `core/`. State: none (this surface is stateless; per-user state
// lives in the runtime above, see manifest state.scope).

import { buildComicImageUrl, generateCatReply } from "../../core/index.ts";

type ChatRequest = {
    question?: string;
    imageUrl?: string;
};

function sseEvent(event: string, data: unknown): string {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function handleChatRequest(req: Request): Promise<Response> {
    if (req.method !== "POST") {
        return new Response("method not allowed", { status: 405 });
    }

    const url = new URL(req.url);
    const stream = url.searchParams.get("stream") === "1";

    const body = (await req.json().catch(() => null)) as ChatRequest | null;
    if (!body?.question) {
        return new Response("question required", { status: 400 });
    }

    const auth = req.headers.get("authorization");
    const apiKey = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;

    const reply = await generateCatReply(body.question, body.imageUrl ?? null, {
        apiKey,
    });
    const comicUrl = buildComicImageUrl(
        body.question,
        reply,
        body.imageUrl ?? null,
        { apiKey },
    );

    if (!stream) {
        return Response.json({ reply, comicUrl });
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
