import { Hono } from "hono";
import type { MockAPI } from "./fetch.ts";
import { createHonoMockHandler } from "./fetch.ts";

export function createMockTextService(): MockAPI<Record<string, never>> {
    const app = new Hono()
        .post("/openai", async (c) => {
            // Add realistic delay to simulate actual service response time
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Simple mock response with minimal tokens and required tracking headers
            const response = c.json({
                id: `chatcmpl-mock-${Date.now()}`,
                object: "chat.completion",
                created: Math.floor(Date.now() / 1000),
                model: "gpt-5-nano-2025-08-07",
                choices: [{
                    index: 0,
                    message: {
                        role: "assistant",
                        content: "Hi!"
                    },
                    finish_reason: "stop"
                }],
                usage: {
                    prompt_tokens: 1000,
                    completion_tokens: 500,
                    total_tokens: 1500,
                    prompt_tokens_details: {
                        cached_tokens: 0,
                        audio_tokens: 0
                    },
                    completion_tokens_details: {
                        reasoning_tokens: 0,
                        audio_tokens: 0,
                        accepted_prediction_tokens: 0,
                        rejected_prediction_tokens: 0
                    }
                }
            });
            
            // Add required tracking headers (model and usage)
            response.headers.set("x-model-used", "gpt-5-nano-2025-08-07");
            
            // Usage headers (matching USAGE_TYPE_HEADERS from shared/registry/usage-headers.ts)
            response.headers.set("x-usage-prompt-text-tokens", "1000");
            response.headers.set("x-usage-prompt-cached-tokens", "0");
            response.headers.set("x-usage-prompt-audio-tokens", "0");
            response.headers.set("x-usage-prompt-image-tokens", "0");
            response.headers.set("x-usage-completion-text-tokens", "500");
            response.headers.set("x-usage-completion-reasoning-tokens", "0");
            response.headers.set("x-usage-completion-audio-tokens", "0");
            response.headers.set("x-usage-completion-image-tokens", "0");
            
            return response;
        });

    return {
        state: {},
        handlerMap: {
            "ec2-3-80-56-235.compute-1.amazonaws.com:16385": createHonoMockHandler(app),
        },
        reset: () => {
            // No state to reset
        },
    };
}
