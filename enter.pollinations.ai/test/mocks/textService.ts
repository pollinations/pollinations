import { fetchMock } from "cloudflare:test";

/**
 * Setup mock for text service outbound requests.
 * Uses Cloudflare's fetchMock API which works properly in Workers runtime.
 */
export function setupTextServiceMock() {
    const textServiceHost = "ec2-3-80-56-235.compute-1.amazonaws.com:16385";
    
    // Mock POST /openai endpoint
    fetchMock
        .get(`http://${textServiceHost}`)
        .intercept({ path: "/openai", method: "POST" })
        .reply(200, {
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
        }, {
            headers: {
                "content-type": "application/json",
                "x-model-used": "gpt-5-nano-2025-08-07",
                "x-usage-prompt-text-tokens": "1000",
                "x-usage-prompt-cached-tokens": "0",
                "x-usage-prompt-audio-tokens": "0",
                "x-usage-prompt-image-tokens": "0",
                "x-usage-completion-text-tokens": "500",
                "x-usage-completion-reasoning-tokens": "0",
                "x-usage-completion-audio-tokens": "0",
                "x-usage-completion-image-tokens": "0"
            }
        });
}
