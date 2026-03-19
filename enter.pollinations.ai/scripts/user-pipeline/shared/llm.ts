/**
 * Minimal LLM client for gen.pollinations.ai.
 *
 * Stateless wrapper around the OpenAI-compatible chat completions endpoint.
 * Requires a secret key (sk_) — publishable keys cannot access paid models.
 */

const ENDPOINT = "https://gen.pollinations.ai/v1/chat/completions";

export async function llmComplete(
    prompt: string,
    options: {
        apiKey: string;
        model?: string;
        temperature?: number;
    },
): Promise<string> {
    const { apiKey, model = "gemini", temperature = 0.1 } = options;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    let response: Response;
    try {
        response = await fetch(ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: [{ role: "user", content: prompt }],
                temperature,
            }),
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
    }

    if (!response.ok) {
        const body = await response.text();
        throw new Error(
            `LLM API HTTP ${response.status}: ${body.slice(0, 200)}`,
        );
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content ?? "";
    return content;
}
