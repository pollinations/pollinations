/**
 * Minimal LLM client for gen.pollinations.ai.
 *
 * Stateless wrapper around the OpenAI-compatible chat completions endpoint.
 * Requires a secret key (sk_) — publishable keys cannot access paid models.
 */

const ENDPOINT = "https://gen.pollinations.ai/v1/chat/completions";
const DEFAULT_MODEL = "gemini-fast";
const REQUEST_TIMEOUT_MS = 120_000;
const TIMEOUT_RESULT = Symbol("llm-timeout");

export async function llmComplete(
    prompt: string,
    options: {
        apiKey: string;
        model?: string;
        temperature?: number;
    },
): Promise<string> {
    const { apiKey, model = DEFAULT_MODEL, temperature = 0.1 } = options;

    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<typeof TIMEOUT_RESULT>((resolve) => {
        timeout = setTimeout(() => {
            console.warn(`   ⏰ AbortController fired after 120s`);
            controller.abort();
            resolve(TIMEOUT_RESULT);
        }, REQUEST_TIMEOUT_MS);
    });

    const requestPromise = (async () => {
        const response = await fetch(ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
                Connection: "close",
            },
            body: JSON.stringify({
                model,
                messages: [{ role: "user", content: prompt }],
                temperature,
            }),
            signal: controller.signal,
        });
        const body = await response.text();

        if (!response.ok) {
            throw new Error(
                `LLM API HTTP ${response.status}: ${body.slice(0, 200)}`,
            );
        }

        const data = JSON.parse(body) as {
            choices?: Array<{ message?: { content?: string } }>;
        };
        return data.choices?.[0]?.message?.content ?? "";
    })();

    try {
        const result = await Promise.race([requestPromise, timeoutPromise]);
        if (result === TIMEOUT_RESULT) {
            const error = new Error(
                `LLM request timed out after ${REQUEST_TIMEOUT_MS}ms`,
            );
            error.name = "AbortError";
            throw error;
        }
        return result;
    } finally {
        if (timeout) {
            clearTimeout(timeout);
        }
    }
}
