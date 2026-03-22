/**
 * Minimal LLM client for gen.pollinations.ai.
 *
 * Requires a secret key (sk_) — publishable keys cannot access paid models.
 */

const ENDPOINT = "https://gen.pollinations.ai/v1/chat/completions";
const DEFAULT_MODEL = "claude";
const REQUEST_TIMEOUT_MS = 30_000;

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
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(ENDPOINT, {
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

        const text = await response.text();

        if (!text.trim()) {
            throw new Error("LLM request returned empty response");
        }

        const data = JSON.parse(text) as {
            choices?: Array<{ message?: { content?: string } }>;
            error?: { message?: string };
        };

        if (data.error) {
            throw new Error(`LLM API error: ${data.error.message}`);
        }

        return data.choices?.[0]?.message?.content ?? "";
    } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
            throw Object.assign(
                new Error(
                    `LLM request timed out after ${REQUEST_TIMEOUT_MS}ms`,
                ),
                {
                    name: "AbortError",
                },
            );
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}
