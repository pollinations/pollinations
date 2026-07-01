// OpenAI Chat Completions surface for code-bee.
//
// POST /v1/chat/completions  (model: "code-bee")
//   { messages: [{role,content}], stream?: bool,
//     code_bee?: { cwd: string, allowedTools?: string[], maxTurns?: number } }
//
// The code-bee runtime needs a `cwd` per session. Chat Completions has no
// place for that, so we accept it under a non-standard `code_bee` body field.
// If absent, we 400 — unlike catgpt, code-bee can't be stateless.
//
// === Mapping decisions (the interesting part) ==============================
//
// Chat Completions assumes one response message per request. The Claude Agent
// SDK emits a stream of events: assistant text deltas, tool-use starts/ends,
// and a final result. There is no standard OpenAI shape for "the agent ran
// Read+Edit+Write internally before answering" — function-calling is for the
// *caller's* tools, not the agent's internal loop.
//
// Decision: project the SDK's event stream into the standard OpenAI shape
// for content, plus a non-standard `code_bee` extension that real OpenAI
// clients ignore but the Pollinations platform reads.
//
//   SDK event              | Streaming chunk                | Non-streaming
//   -----------------------|--------------------------------|----------------
//   text {text}            | delta.content (standard)       | message.content
//   tool {name, status}    | code_bee.tool_trace[] entry    | code_bee.tool_trace[]
//                          | (emitted in its own chunk with |
//                          |  delta:{} so OpenAI clients    |
//                          |  see no content delta)         |
//   result {ok, turnsUsed} | finish_reason + final usage    | finish_reason, code_bee.{ok,turnsUsed}
//
// finish_reason: "stop" if ok, "length" if maxTurns hit (matches OpenAI's
// convention for "ran out of room"). No tool_calls finish_reason because the
// agent's tools aren't visible to the caller — they ran already.
//
// Usage block: the SDK's result message doesn't carry token counts directly
// (it would need recordUsage-style aggregation across the SDK's per-turn
// usage events, which @0.2.126 doesn't surface in tool_use_summary). We emit
// a placeholder with `cost_estimated: true` so the platform knows to backfill
// from provider-side billing rather than trust this number. This is the
// honest answer for an agent-loop bee — billing for code-bee is per
// container-second, not per-token (manifest declares billing.default:
// "user-pays").
// ============================================================================

import { runCodeBeeTurn, type SDKQuery } from "../../src/runner.ts";

type ChatMessage = { role: string; content: string };
type ChatRequest = {
    model?: string;
    messages?: ChatMessage[];
    stream?: boolean;
    code_bee?: {
        cwd?: string;
        allowedTools?: string[];
        maxTurns?: number;
        permissionMode?: string;
    };
};

type ToolTraceEntry = { name: string; status: "started" | "finished" };

function completionId(): string {
    return `chatcmpl-${Math.random().toString(36).slice(2, 12)}`;
}

function lastUserPrompt(messages: ChatMessage[]): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "user" && messages[i].content) {
            return messages[i].content;
        }
    }
    return null;
}

function finishReason(
    ok: boolean,
    turnsUsed: number,
    maxTurns: number,
): string {
    if (ok) return "stop";
    if (turnsUsed >= maxTurns) return "length";
    return "stop";
}

export function makeChatCompletionsHandler(query: SDKQuery) {
    return async function handleChatCompletions(
        req: Request,
    ): Promise<Response> {
        if (req.method !== "POST") {
            return new Response("method not allowed", { status: 405 });
        }

        let body: ChatRequest;
        try {
            body = (await req.json()) as ChatRequest;
        } catch {
            return Response.json({ error: "invalid json" }, { status: 400 });
        }

        if (!Array.isArray(body.messages) || body.messages.length === 0) {
            return Response.json(
                { error: "messages required" },
                { status: 400 },
            );
        }

        const prompt = lastUserPrompt(body.messages);
        if (!prompt) {
            return Response.json(
                { error: "no user message found" },
                { status: 400 },
            );
        }

        const cwd = body.code_bee?.cwd;
        if (!cwd) {
            return Response.json(
                {
                    error: "code_bee.cwd required — code-bee runs in the container runtime and needs a per-session working directory",
                },
                { status: 400 },
            );
        }

        const maxTurns = body.code_bee?.maxTurns ?? 8;
        const ac = new AbortController();
        req.signal?.addEventListener("abort", () => ac.abort(), { once: true });

        const turnIter = runCodeBeeTurn(query, prompt, {
            cwd,
            maxTurns,
            allowedTools: body.code_bee?.allowedTools,
            permissionMode: body.code_bee?.permissionMode,
            signal: ac.signal,
        });

        if (body.stream) {
            return streamingResponse(turnIter, maxTurns);
        }
        return nonStreamingResponse(turnIter, maxTurns);
    };
}

async function nonStreamingResponse(
    turnIter: AsyncGenerator<
        | { type: "text"; text: string }
        | { type: "tool"; name: string; status: "started" | "finished" }
        | { type: "result"; text: string; turnsUsed: number; ok: boolean }
    >,
    maxTurns: number,
): Promise<Response> {
    let content = "";
    const toolTrace: ToolTraceEntry[] = [];
    let ok = false;
    let turnsUsed = 0;

    for await (const ev of turnIter) {
        if (ev.type === "text") {
            content = ev.text;
        } else if (ev.type === "tool") {
            toolTrace.push({ name: ev.name, status: ev.status });
        } else if (ev.type === "result") {
            ok = ev.ok;
            turnsUsed = ev.turnsUsed;
        }
    }

    return Response.json({
        id: completionId(),
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "code-bee",
        choices: [
            {
                index: 0,
                message: { role: "assistant", content },
                finish_reason: finishReason(ok, turnsUsed, maxTurns),
            },
        ],
        // See header for why these are zero + estimated. Agent-loop bees
        // bill per container-second; the platform backfills real numbers.
        usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
            cost_estimated: true,
        },
        // Non-standard extension: the agent's internal tool calls. OpenAI
        // clients ignore unknown top-level fields. Pollinations clients can
        // render this as a "the agent ran X, Y, Z" trace.
        code_bee: {
            ok,
            turnsUsed,
            tool_trace: toolTrace,
        },
    });
}

function streamingResponse(
    turnIter: AsyncGenerator<
        | { type: "text"; text: string }
        | { type: "tool"; name: string; status: "started" | "finished" }
        | { type: "result"; text: string; turnsUsed: number; ok: boolean }
    >,
    maxTurns: number,
): Response {
    const id = completionId();
    const created = Math.floor(Date.now() / 1000);

    function chunk(delta: object, extra?: object): string {
        return `data: ${JSON.stringify({
            id,
            object: "chat.completion.chunk",
            created,
            model: "code-bee",
            choices: [{ index: 0, delta, finish_reason: null }],
            ...extra,
        })}\n\n`;
    }

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const enc = new TextEncoder();
            try {
                // First chunk: announce the role, per OpenAI convention.
                controller.enqueue(enc.encode(chunk({ role: "assistant" })));

                let lastText = "";
                let ok = false;
                let turnsUsed = 0;

                for await (const ev of turnIter) {
                    if (ev.type === "text") {
                        // Emit only the *new* portion as a delta. The SDK
                        // gives us the cumulative text per assistant message;
                        // diff it against what we last emitted.
                        const delta = ev.text.startsWith(lastText)
                            ? ev.text.slice(lastText.length)
                            : ev.text;
                        lastText = ev.text;
                        if (delta) {
                            controller.enqueue(
                                enc.encode(chunk({ content: delta })),
                            );
                        }
                    } else if (ev.type === "tool") {
                        // Tool events have no OpenAI equivalent. Emit an
                        // empty-delta chunk with a non-standard `code_bee`
                        // top-level field. Standard OpenAI clients see no
                        // content change; Pollinations clients pick up the
                        // tool trace.
                        controller.enqueue(
                            enc.encode(
                                chunk(
                                    {},
                                    {
                                        code_bee: {
                                            tool: {
                                                name: ev.name,
                                                status: ev.status,
                                            },
                                        },
                                    },
                                ),
                            ),
                        );
                    } else if (ev.type === "result") {
                        ok = ev.ok;
                        turnsUsed = ev.turnsUsed;
                    }
                }

                // Final chunk: finish_reason, usage, and code_bee summary.
                const reason = finishReason(ok, turnsUsed, maxTurns);
                controller.enqueue(
                    enc.encode(
                        `data: ${JSON.stringify({
                            id,
                            object: "chat.completion.chunk",
                            created,
                            model: "code-bee",
                            choices: [
                                { index: 0, delta: {}, finish_reason: reason },
                            ],
                            usage: {
                                prompt_tokens: 0,
                                completion_tokens: 0,
                                total_tokens: 0,
                                cost_estimated: true,
                            },
                            code_bee: { ok, turnsUsed },
                        })}\n\n`,
                    ),
                );
                controller.enqueue(enc.encode("data: [DONE]\n\n"));
            } catch (err) {
                controller.enqueue(
                    enc.encode(
                        `data: ${JSON.stringify({ error: String(err) })}\n\n`,
                    ),
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
}
