// Local stub exposing /v1/messages using the REAL translation, streaming and
// error modules, with a synthetic Chat Completions upstream. No Cloudflare
// bindings needed, so it runs on plain Node. This exists to point Claude Code
// and the Anthropic SDKs at the exact wire shape we ship and watch them parse
// it. Dev aid only — not part of the vitest suite.
//
//   npx tsx scripts/messages-stub-server.ts
//   ANTHROPIC_BASE_URL=http://127.0.0.1:8787 ANTHROPIC_AUTH_TOKEN=x \
//     ANTHROPIC_MODEL=mock claude -p "say pong"

import { createServer } from "node:http";
import { toAnthropicStream } from "../src/text/anthropic/stream.ts";
import {
    anthropicToChatRequest,
    chatToAnthropicResponse,
} from "../src/text/anthropic/translate.ts";

// Absolute URL import sidesteps the runner's path-plane resolution for a file
// that lives above this package's rootDir.
const schemaModule = await import(
    new URL("../../shared/schemas/anthropic.ts", import.meta.url).href
);
const CreateAnthropicMessageRequestSchema =
    schemaModule.CreateAnthropicMessageRequestSchema as typeof import("../../shared/schemas/anthropic.ts").CreateAnthropicMessageRequestSchema;

const MODEL = "mock";
const encoder = new TextEncoder();

const chatCompletion = (prompt: string) => ({
    id: "chatcmpl-stub",
    object: "chat.completion",
    model: "gpt-5.4-nano",
    choices: [
        {
            index: 0,
            message: {
                role: "assistant",
                content: `stub reply to: ${prompt.slice(0, 80)}`,
            },
            finish_reason: "stop",
        },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 6, total_tokens: 16 },
});

/** A two-chunk Chat SSE stream the real adapter consumes. */
function stubChatSse(text: string): ReadableStream<Uint8Array<ArrayBuffer>> {
    const frames = [
        `data: ${JSON.stringify({
            id: "c",
            model: "gpt-5.4-nano",
            choices: [
                { index: 0, delta: { content: text }, finish_reason: null },
            ],
        })}\n\n`,
        `data: ${JSON.stringify({
            id: "c",
            model: "gpt-5.4-nano",
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            usage: {
                prompt_tokens: 10,
                completion_tokens: 6,
                total_tokens: 16,
            },
        })}\n\n`,
        "data: [DONE]\n\n",
    ];
    return new ReadableStream({
        start(controller) {
            for (const frame of frames)
                controller.enqueue(encoder.encode(frame));
            controller.close();
        },
    });
}

const json = (status: number, body: unknown) => ({
    status,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
});

const anthropicError = (
    status: number,
    type: string,
    message: string,
): { status: number; headers: Record<string, string>; body: string } => ({
    status,
    headers: {
        "content-type": "application/json",
        ...(status === 429 ? { "retry-after": "1" } : {}),
    },
    body: JSON.stringify({ type: "error", error: { type, message } }),
});

const server = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
    }
    if (req.method !== "POST" || !req.url?.startsWith("/v1/messages")) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(
            JSON.stringify({
                type: "error",
                error: { type: "not_found_error", message: "not found" },
            }),
        );
        return;
    }

    const raw = await new Promise<string>((resolve) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => chunks.push(chunk as Buffer));
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    });

    console.error(
        `[messages-stub] ${req.method} ${req.url} bytes=${raw.length} auth=${Boolean(req.headers.authorization)}`,
    );

    let parsed: ReturnType<typeof CreateAnthropicMessageRequestSchema.parse>;
    try {
        parsed = CreateAnthropicMessageRequestSchema.parse(JSON.parse(raw));
    } catch (error) {
        // Log the raw shape so schema gaps against real clients are visible.
        console.error("[messages-stub] raw body:", raw.slice(0, 4000));
        const out = anthropicError(
            400,
            "invalid_request_error",
            error instanceof Error ? error.message : "invalid request",
        );
        res.writeHead(out.status, out.headers);
        res.end(out.body);
        return;
    }

    // Unknown model → Anthropic not_found_error, so Claude Code's handling is exercised.
    if (parsed.model !== MODEL) {
        const out = anthropicError(
            404,
            "not_found_error",
            `model "${parsed.model}" not found`,
        );
        res.writeHead(out.status, out.headers);
        res.end(out.body);
        return;
    }

    // Prove our request adapter accepts Claude Code's payload.
    const chat = anthropicToChatRequest(parsed);
    const lastUser = [...chat.messages]
        .reverse()
        .find((m) => m.role === "user");
    const prompt =
        typeof lastUser?.content === "string"
            ? lastUser.content
            : JSON.stringify(lastUser?.content ?? "");

    if (parsed.stream) {
        res.writeHead(200, {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache",
        });
        const stream = toAnthropicStream({
            body: stubChatSse(prompt.slice(0, 80)),
            messageId: "msg_stub",
            model: MODEL,
            keepaliveMs: 30_000,
        });
        const reader = stream.getReader();
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
        }
        res.end();
        return;
    }

    const response = chatToAnthropicResponse(chatCompletion(prompt), MODEL);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(response));
});

const port = Number(process.env.PORT ?? 8899);
server.listen(port, "127.0.0.1", () => {
    console.log(`messages stub listening on http://127.0.0.1:${port}`);
});
