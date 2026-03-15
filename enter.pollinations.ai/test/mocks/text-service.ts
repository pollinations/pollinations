import { Hono } from "hono";
import { stream } from "hono/streaming";
import type { MockAPI } from "./fetch.ts";
import { createHonoMockHandler } from "./fetch.ts";

type TextServiceState = {
    /** When true, returns JSON even for stream: true requests (simulates upstream bug) */
    forceNonStreaming: boolean;
};

export function createMockTextService(): MockAPI<TextServiceState> {
    const state: TextServiceState = { forceNonStreaming: false };

    const app = new Hono().post("/openai", async (c) => {
        // Add realistic delay to simulate actual service response time
        await new Promise((resolve) => setTimeout(resolve, 100));

        const body = await c.req.json();
        const isStreaming = body.stream === true && !state.forceNonStreaming;

        if (isStreaming) {
            // streaming response in SSE format (match real text service headers)
            c.header("Content-Type", "text/event-stream; charset=utf-8");
            c.header("Cache-Control", "no-cache");
            c.header("Connection", "keep-alive");
            return stream(c, async (stream) => {
                for await (const chunk of mockOpenAIStream(
                    "Hello, whats up?",
                )) {
                    await stream.write(chunk);
                }
            });
        } else {
            // set usage headers
            c.header("x-model-used", "gpt-5-nano-2025-08-07");
            c.header("x-usage-prompt-text-tokens", "1000");
            c.header("x-usage-prompt-cached-tokens", "0");
            c.header("x-usage-prompt-audio-tokens", "0");
            c.header("x-usage-prompt-image-tokens", "0");
            c.header("x-usage-completion-text-tokens", "500");
            c.header("x-usage-completion-reasoning-tokens", "0");
            c.header("x-usage-completion-audio-tokens", "0");
            c.header("x-usage-completion-image-tokens", "0");
            // regular response
            return c.json({
                id: `chatcmpl-mock-${Date.now()}`,
                object: "chat.completion",
                created: Math.floor(Date.now() / 1000),
                model: "gpt-5-nano-2025-08-07",
                choices: [
                    {
                        index: 0,
                        message: {
                            role: "assistant",
                            content: "Hi!",
                        },
                        finish_reason: "stop",
                    },
                ],
                usage: mockUsage,
            });
        }
    });

    return {
        state,
        handlerMap: {
            "ec2-3-80-56-235.compute-1.amazonaws.com:16385":
                createHonoMockHandler(app),
        },
        reset: () => {
            state.forceNonStreaming = false;
        },
    };
}

const mockUsage = {
    prompt_tokens: 1000,
    completion_tokens: 500,
    total_tokens: 1500,
    prompt_tokens_details: {
        cached_tokens: 0,
        audio_tokens: 0,
    },
    completion_tokens_details: {
        reasoning_tokens: 0,
        audio_tokens: 0,
        accepted_prediction_tokens: 0,
        rejected_prediction_tokens: 0,
    },
};

async function* mockOpenAIStream(
    message: string,
    delay: number = 0,
): AsyncIterable<string> {
    const parts = message.split(/(?= )/);
    for (const part of parts) {
        if (delay > 0) {
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
        yield `data: ${JSON.stringify({
            id: `chatcmpl-chunk-mock-${Date.now()}`,
            object: "chat.completion.chunk",
            created: Date.now(),
            model: "gpt-5-nano-2025-08-07",
            choices: [
                {
                    index: 0,
                    delta: {
                        content: part,
                    },
                    finish_reason: null,
                },
            ],
        })}\n\n`;
    }
    yield `data: ${JSON.stringify({
        id: `chatcmpl-chunk-mock-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Date.now(),
        model: "gpt-5-nano-2025-08-07",
        choices: [],
        usage: mockUsage,
    })}\n\n`;
    yield `data: [DONE]\n\n`;
}
