// SSE web-chat surface for code-bee.
//
// POST /chat
//   body: { prompt: string, cwd: string, allowedTools?: string[], maxTurns?: number }
//   stream: text/event-stream
//     event: text  data: {"text": "..."}              (assistant token chunk)
//     event: tool  data: {"name": "Read", "status":"finished"}
//     event: done  data: {"text":"...","turnsUsed":3,"ok":true}
//
// Identical Request/Response shape as catgpt/surfaces/web-chat — the platform
// can mount both bees behind the same SSE adapter convention.
//
// `query` is dependency-injected so tests don't pull in the SDK.

import { runCodeBeeTurn, type SDKQuery } from "../../src/runner.ts";

function sse(event: string, data: unknown): string {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function makeChatHandler(query: SDKQuery) {
    return async function handleChatRequest(req: Request): Promise<Response> {
        if (req.method !== "POST")
            return new Response("method not allowed", { status: 405 });

        let body: {
            prompt?: string;
            cwd?: string;
            allowedTools?: string[];
            maxTurns?: number;
            permissionMode?: string;
        };
        try {
            body = (await req.json()) as typeof body;
        } catch {
            return new Response("invalid json", { status: 400 });
        }
        if (!body.prompt || !body.cwd) {
            return new Response("prompt and cwd required", { status: 400 });
        }

        const ac = new AbortController();
        req.signal?.addEventListener("abort", () => ac.abort(), { once: true });

        const stream = new ReadableStream<Uint8Array>({
            async start(controller) {
                const enc = new TextEncoder();
                try {
                    for await (const ev of runCodeBeeTurn(query, body.prompt!, {
                        cwd: body.cwd!,
                        allowedTools: body.allowedTools,
                        maxTurns: body.maxTurns,
                        permissionMode: body.permissionMode,
                        signal: ac.signal,
                    })) {
                        if (ev.type === "text") {
                            controller.enqueue(
                                enc.encode(sse("text", { text: ev.text })),
                            );
                        } else if (ev.type === "tool") {
                            controller.enqueue(
                                enc.encode(
                                    sse("tool", {
                                        name: ev.name,
                                        status: ev.status,
                                    }),
                                ),
                            );
                        } else if (ev.type === "result") {
                            controller.enqueue(enc.encode(sse("done", ev)));
                        }
                    }
                } catch (err) {
                    controller.enqueue(
                        enc.encode(sse("error", { message: String(err) })),
                    );
                } finally {
                    controller.close();
                }
            },
        });

        return new Response(stream, {
            status: 200,
            headers: {
                "content-type": "text/event-stream",
                "cache-control": "no-cache",
            },
        });
    };
}
